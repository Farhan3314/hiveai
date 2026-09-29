// Pure-JS text extraction for .docx and .pdf, used by the document Q&A (RAG)
// pipeline. No React Native imports here on purpose, so it runs unchanged in
// Expo Go / dev builds (no native module) and can be unit-tested in Node.
//
// Limits (honest ones): scanned/image-only PDFs have no text layer, and
// password-protected PDFs can't be read — both raise a friendly error instead
// of returning garbage.

import { unzipSync, unzlibSync, inflateSync, strFromU8 } from 'fflate';

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractDocxText(bytes) {
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (f) => /^word\/(document|footnotes|endnotes)\.xml$/.test(f.name),
    });
  } catch (e) {
    throw new Error('This .docx file looks damaged or is not a real Word document.');
  }
  const main = files['word/document.xml'];
  if (!main) throw new Error('This .docx file has no readable document body.');

  const parts = [strFromU8(main)];
  if (files['word/footnotes.xml']) parts.push(strFromU8(files['word/footnotes.xml']));
  if (files['word/endnotes.xml']) parts.push(strFromU8(files['word/endnotes.xml']));

  const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<\/w:p>|<\/w:tc>|<\/w:tr>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  let out = '';
  for (const xml of parts) {
    let m;
    tokenRe.lastIndex = 0;
    while ((m = tokenRe.exec(xml))) {
      const tok = m[0];
      if (m[1] !== undefined) out += decodeXmlEntities(m[1]);
      else if (tok === '</w:p>' || tok.startsWith('<w:br') || tok.startsWith('<w:cr')) out += '\n';
      else if (tok === '</w:tc>') out = `${out.replace(/\n$/, '')}\t|\t`; // table cell separator
      else if (tok === '</w:tr>') out = `${out.replace(/\t\|\t$/, '')}\n`; // table row end
      else out += '\t'; // <w:tab/>
    }
    out += '\n';
  }
  return cleanText(out);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function toLatin1(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return s;
}

function ascii85Decode(u8) {
  const text = toLatin1(u8).replace(/\s+/g, '');
  const end = text.indexOf('~>');
  const src = (end === -1 ? text : text.slice(0, end)).replace(/^<~/, '');
  const out = [];
  let group = [];
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(src.charCodeAt(i) - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const pad = 5 - group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, 4 - pad));
  }
  return Uint8Array.from(out);
}

function asciiHexDecode(u8) {
  const hex = toLatin1(u8).replace(/>.*$/s, '').replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Applies the object's /Filter chain (Flate, ASCII85, ASCIIHex). Anything else
// (LZW, DCT images, ...) returns null so the stream is simply skipped.
function decodeStream(dict, data) {
  const fm = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict);
  if (!fm) return data;
  const names = fm[1].match(/\/[A-Za-z0-9]+/g) || [];
  let cur = data;
  for (const name of names) {
    if (!cur) return null;
    if (name === '/FlateDecode' || name === '/Fl') cur = tryInflate(cur);
    else if (name === '/ASCII85Decode' || name === '/A85') cur = ascii85Decode(cur);
    else if (name === '/ASCIIHexDecode' || name === '/AHx') cur = asciiHexDecode(cur);
    else return null;
  }
  return cur;
}

function tryInflate(data) {
  try {
    return unzlibSync(data);
  } catch (e) {
    try {
      return inflateSync(data);
    } catch (e2) {
      return null;
    }
  }
}

function refNum(dict, key) {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
  return m ? Number(m[1]) : null;
}

// Returns the balanced `<< ... >>` dictionary that starts at or after `from`.
function balancedDict(text, from) {
  const start = text.indexOf('<<', from);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < text.length - 1; i += 1) {
    const two = text[i] + text[i + 1];
    if (two === '<<') {
      depth += 1;
      i += 1;
    } else if (two === '>>') {
      depth -= 1;
      i += 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

// Parses every `N G obj ... endobj` (including objects packed inside object
// streams) into Map<number, { dict: string, data: Uint8Array|null }>.
function parsePdfObjects(bytes) {
  const s = toLatin1(bytes);
  const objs = new Map();
  const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = objRe.exec(s))) {
    const num = Number(m[1]);
    const start = objRe.lastIndex;
    const sIdx = s.indexOf('stream', start);
    const eIdx = s.indexOf('endobj', start);

    if (sIdx !== -1 && (eIdx === -1 || sIdx < eIdx)) {
      const dict = s.slice(start, sIdx);
      let ds = sIdx + 6;
      if (s[ds] === '\r') ds += 1;
      if (s[ds] === '\n') ds += 1;

      let de = -1;
      const lenMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      if (lenMatch) {
        const cand = ds + Number(lenMatch[1]);
        if (/^\s*endstream/.test(s.slice(cand, cand + 12))) de = cand;
      }
      if (de === -1) {
        de = s.indexOf('endstream', ds);
        if (de === -1) break;
      }

      let data = bytes.subarray(ds, de);
      try {
        data = decodeStream(dict, data);
      } catch (e) {
        data = null;
      }
      objs.set(num, { dict, data });
      objRe.lastIndex = de;
    } else {
      if (eIdx === -1) break;
      objs.set(num, { dict: s.slice(start, eIdx), data: null });
      objRe.lastIndex = eIdx;
    }
  }

  // Expand object streams (PDF 1.5+ packs fonts/pages dictionaries in them).
  for (const [, obj] of Array.from(objs.entries())) {
    if (!obj.data || !/\/Type\s*\/ObjStm/.test(obj.dict)) continue;
    const n = Number((/\/N\s+(\d+)/.exec(obj.dict) || [])[1]);
    const first = Number((/\/First\s+(\d+)/.exec(obj.dict) || [])[1]);
    if (!n || !first) continue;
    const text = toLatin1(obj.data);
    const header = text
      .slice(0, first)
      .trim()
      .split(/\s+/)
      .map(Number);
    for (let i = 0; i < n; i += 1) {
      const id = header[i * 2];
      const off = header[i * 2 + 1];
      const nextOff = i + 1 < n ? header[(i + 1) * 2 + 1] : text.length - first;
      if (Number.isFinite(id) && Number.isFinite(off) && !objs.has(id)) {
        objs.set(id, { dict: text.slice(first + off, first + nextOff), data: null });
      }
    }
  }
  return { objs, raw: s };
}

// --- ToUnicode CMaps --------------------------------------------------------

function utf16beHexToString(hex) {
  let out = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const chunk = hex.slice(i, i + 4);
    if (chunk.length < 4) break;
    out += String.fromCharCode(parseInt(chunk, 16));
  }
  return out;
}

function parseToUnicode(cmapText) {
  const map = new Map();
  let codeLen = 0;

  const csr = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let m;
  while ((m = csr.exec(cmapText))) {
    const first = /<([0-9a-fA-F]+)>/.exec(m[1]);
    if (first) codeLen = Math.max(codeLen, Math.ceil(first[1].length / 2));
  }

  const bfc = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bfc.exec(cmapText))) {
    const pairRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let p;
    while ((p = pairRe.exec(m[1]))) {
      map.set(parseInt(p[1], 16), utf16beHexToString(p[2]));
    }
  }

  const bfr = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfr.exec(cmapText))) {
    const rangeRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g;
    let r;
    while ((r = rangeRe.exec(m[1]))) {
      const lo = parseInt(r[1], 16);
      const hi = parseInt(r[2], 16);
      if (hi < lo || hi - lo > 0xffff) continue;
      if (r[3].startsWith('[')) {
        const dests = r[3].match(/<([0-9a-fA-F]+)>/g) || [];
        dests.forEach((d, i) => map.set(lo + i, utf16beHexToString(d.slice(1, -1))));
      } else {
        const base = r[3].slice(1, -1);
        const baseCode = parseInt(base.slice(-4), 16);
        const prefix = utf16beHexToString(base.slice(0, -4));
        for (let c = lo; c <= hi; c += 1) {
          map.set(c, prefix + String.fromCharCode(baseCode + (c - lo)));
        }
      }
    }
  }

  return { map, codeLen: codeLen || (map.size && [...map.keys()].some((k) => k > 255) ? 2 : 1) };
}

// --- Content stream tokenizer ----------------------------------------------

const WS = ' \t\r\n\f\0';
const DELIM = '()<>[]{}/%';

function readLiteralString(s, i) {
  // s[i] === '('
  let depth = 1;
  let out = '';
  let j = i + 1;
  while (j < s.length && depth > 0) {
    const c = s[j];
    if (c === '\\') {
      const n = s[j + 1];
      if (n === 'n') out += '\n';
      else if (n === 'r') out += '\r';
      else if (n === 't') out += '\t';
      else if (n === 'b') out += '\b';
      else if (n === 'f') out += '\f';
      else if (n === '\r') {
        if (s[j + 2] === '\n') j += 1;
      } else if (n === '\n') {
        // line continuation
      } else if (n >= '0' && n <= '7') {
        let oct = n;
        if (s[j + 2] >= '0' && s[j + 2] <= '7') {
          oct += s[j + 2];
          j += 1;
          if (s[j + 2] >= '0' && s[j + 2] <= '7') {
            oct += s[j + 2];
            j += 1;
          }
        }
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      } else if (n !== undefined) out += n;
      j += 2;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    out += c;
    j += 1;
  }
  return { value: out, next: j + 1 };
}

function hexToBinaryString(hex) {
  let h = hex.replace(/\s+/g, '');
  if (h.length % 2) h += '0';
  let out = '';
  for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return out;
}

function decodeShown(str, font) {
  if (font && font.cmap && font.cmap.map.size) {
    const { map, codeLen } = font.cmap;
    let out = '';
    for (let i = 0; i < str.length; i += codeLen) {
      let code = 0;
      for (let k = 0; k < codeLen && i + k < str.length; k += 1) {
        code = (code << 8) | str.charCodeAt(i + k);
      }
      const ch = map.get(code);
      if (ch !== undefined) out += ch;
    }
    return out;
  }
  // Simple fonts without a ToUnicode map: bytes are (close to) Latin-1/WinAnsi.
  return str;
}

function extractTextFromContent(content, fonts) {
  let out = '';
  let font = null;
  let lastY = null;
  const stack = [];

  const newline = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const space = () => {
    if (out && !/\s$/.test(out)) out += ' ';
  };

  let i = 0;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (WS.includes(c)) {
      i += 1;
    } else if (c === '%') {
      while (i < n && content[i] !== '\n' && content[i] !== '\r') i += 1;
    } else if (c === '(') {
      const { value, next } = readLiteralString(content, i);
      stack.push({ t: 's', v: value });
      i = next;
    } else if (c === '<' && content[i + 1] === '<') {
      // inline dictionary (marked-content properties etc.) — skip it
      const d = balancedDict(content, i);
      i += Math.max(d.length, 2);
    } else if (c === '<') {
      const end = content.indexOf('>', i);
      if (end === -1) break;
      stack.push({ t: 's', v: hexToBinaryString(content.slice(i + 1, end)) });
      i = end + 1;
    } else if (c === '[') {
      stack.push({ t: '[' });
      i += 1;
    } else if (c === ']') {
      const items = [];
      while (stack.length && stack[stack.length - 1].t !== '[') items.unshift(stack.pop());
      stack.pop();
      stack.push({ t: 'a', v: items });
      i += 1;
    } else if (c === '/') {
      let j = i + 1;
      while (j < n && !WS.includes(content[j]) && !DELIM.includes(content[j])) j += 1;
      stack.push({ t: 'n', v: content.slice(i + 1, j) });
      i = j;
    } else if (c === ')' || c === '>' || c === '{' || c === '}') {
      i += 1;
    } else {
      let j = i;
      while (j < n && !WS.includes(content[j]) && !DELIM.includes(content[j])) j += 1;
      const tok = content.slice(i, j);
      i = j > i ? j : i + 1;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) {
        stack.push({ t: 'x', v: parseFloat(tok) });
        continue;
      }

      // Operator
      const nums = stack.filter((o) => o.t === 'x').map((o) => o.v);
      const lastStr = [...stack].reverse().find((o) => o.t === 's');
      switch (tok) {
        case 'Tf': {
          const nameOp = stack.find((o) => o.t === 'n');
          font = nameOp && fonts ? fonts[nameOp.v] || null : null;
          break;
        }
        case 'Tj':
          if (lastStr) out += decodeShown(lastStr.v, font);
          break;
        case "'":
        case '"':
          newline();
          if (lastStr) out += decodeShown(lastStr.v, font);
          break;
        case 'TJ': {
          const arr = [...stack].reverse().find((o) => o.t === 'a');
          if (arr) {
            arr.v.forEach((item) => {
              if (item.t === 's') out += decodeShown(item.v, font);
              else if (item.t === 'x' && item.v < -180) space();
            });
          }
          break;
        }
        case 'Td':
        case 'TD':
          if (nums.length >= 2) {
            if (nums[1] !== 0) newline();
            else if (nums[0] > 0) space();
          }
          break;
        case 'T*':
          newline();
          break;
        case 'Tm':
          if (nums.length >= 6) {
            const y = nums[5];
            if (lastY !== null && Math.abs(y - lastY) > 0.5) newline();
            else if (lastY !== null) space();
            lastY = y;
          }
          break;
        case 'ET':
          space();
          break;
        case 'BI': {
          // inline image — skip to EI
          const ei = content.indexOf('EI', i);
          i = ei === -1 ? n : ei + 2;
          break;
        }
        default:
          break;
      }
      stack.length = 0;
    }
  }
  return out;
}

// --- Page + font resolution --------------------------------------------------

function findInheritedResources(objs, pageNum) {
  let num = pageNum;
  for (let depth = 0; depth < 20 && num != null; depth += 1) {
    const obj = objs.get(num);
    if (!obj) return '';
    const idx = obj.dict.search(/\/Resources\b/);
    if (idx !== -1) {
      const after = obj.dict.slice(idx + 10);
      const ref = /^\s*(\d+)\s+\d+\s+R/.exec(after);
      if (ref) return objs.get(Number(ref[1]))?.dict || '';
      return balancedDict(obj.dict, idx);
    }
    num = refNum(obj.dict, 'Parent');
  }
  return '';
}

function buildFontTable(objs, resourcesDict, cmapCache) {
  const fonts = {};
  const fIdx = resourcesDict.search(/\/Font\b/);
  if (fIdx === -1) return fonts;

  let fontDict;
  const after = resourcesDict.slice(fIdx + 5);
  const ref = /^\s*(\d+)\s+\d+\s+R/.exec(after);
  if (ref) fontDict = objs.get(Number(ref[1]))?.dict || '';
  else fontDict = balancedDict(resourcesDict, fIdx);

  const entryRe = /\/([^\s/<>[\](){}]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = entryRe.exec(fontDict))) {
    const fontNum = Number(m[2]);
    const fontObj = objs.get(fontNum);
    const entry = { cmap: null };
    if (fontObj) {
      const tuNum = refNum(fontObj.dict, 'ToUnicode');
      if (tuNum != null) {
        if (!cmapCache.has(tuNum)) {
          const tu = objs.get(tuNum);
          cmapCache.set(tuNum, tu && tu.data ? parseToUnicode(toLatin1(tu.data)) : null);
        }
        entry.cmap = cmapCache.get(tuNum);
      }
    }
    fonts[m[1]] = entry;
  }
  return fonts;
}

function orderedPageNumbers(objs) {
  const pages = [];
  const visit = (num, depth) => {
    if (depth > 30) return;
    const obj = objs.get(num);
    if (!obj) return;
    if (/\/Type\s*\/Pages\b/.test(obj.dict) || /\/Kids\s*\[/.test(obj.dict)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(obj.dict);
      if (kids) {
        const kidRe = /(\d+)\s+\d+\s+R/g;
        let k;
        while ((k = kidRe.exec(kids[1]))) visit(Number(k[1]), depth + 1);
      }
    } else if (/\/Type\s*\/Page\b/.test(obj.dict)) {
      pages.push(num);
    }
  };

  let rootNum = null;
  for (const obj of objs.values()) {
    if (/\/Type\s*\/Catalog\b/.test(obj.dict)) {
      rootNum = refNum(obj.dict, 'Pages');
      break;
    }
  }
  if (rootNum != null) visit(rootNum, 0);

  if (pages.length === 0) {
    // Fallback: every /Page object in file order.
    for (const [num, obj] of objs) {
      if (/\/Type\s*\/Page\b(?!s)/.test(obj.dict)) pages.push(num);
    }
  }
  return pages;
}

export function extractPdfText(bytes) {
  const { objs, raw } = parsePdfObjects(bytes);
  if (objs.size === 0) throw new Error('This PDF could not be read (it may be damaged).');
  if (/\/Encrypt\b/.test(raw.slice(-4096)) || [...objs.values()].some((o) => /\/Encrypt\s+\d+\s+\d+\s+R/.test(o.dict))) {
    throw new Error('This PDF is password-protected, so I can\'t read its text.');
  }

  const cmapCache = new Map();
  const pageNums = orderedPageNumbers(objs);
  const pageTexts = [];

  for (const pageNum of pageNums) {
    const page = objs.get(pageNum);
    const contentRefs = [];
    const arr = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict);
    if (arr) {
      const re = /(\d+)\s+\d+\s+R/g;
      let r;
      while ((r = re.exec(arr[1]))) contentRefs.push(Number(r[1]));
    } else {
      const single = refNum(page.dict, 'Contents');
      if (single != null) contentRefs.push(single);
    }

    const fonts = buildFontTable(objs, findInheritedResources(objs, pageNum), cmapCache);
    let text = '';
    for (const ref of contentRefs) {
      const c = objs.get(ref);
      if (c && c.data) text += `${extractTextFromContent(toLatin1(c.data), fonts)}\n`;
    }
    pageTexts.push(cleanText(text));
  }

  const result = cleanText(pageTexts.filter(Boolean).join('\n\n'));
  if (result.replace(/\s/g, '').length < 10) {
    throw new Error(
      'I couldn\'t find readable text in this PDF. It may be a scanned/image-only PDF — try exporting it as text (.txt) or a searchable PDF.'
    );
  }
  return result;
}

// ---------------------------------------------------------------------------

export function cleanText(s) {
  return String(s || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
