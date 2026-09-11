// HiveAI Design Tokens — "Ink & Honeycomb"
//
// Every previous purple-on-navy palette read like generic AI-SaaS chrome —
// it could have belonged to any chat app. This one is built from the
// product's own name: a hive is a warm, amber, handmade thing built by a
// collective — that's the human/brand side (honey). The AI living inside it
// is the cool, precise counterpart (teal). The two accents are deliberately
// different hues (not two shades of one color) so a message's origin —
// person or HiveAI — is legible by color alone, before you even read who
// sent it.
//
// Backgrounds lean warm ink/paper rather than blue-black/blue-white, so nothing
// here reads as the default "dark mode navy" every other app already uses.

export const darkTheme = {
  mode: 'dark',

  // Backgrounds — warm ink, not navy
  background: '#14110C',
  surface: '#1E1911',
  surfaceAlt: '#2A2317',
  border: '#3E3320',

  // Brand / accent — honeycomb amber (human actions: buttons, links, your own messages)
  primary: '#E3A23A',
  primaryPressed: '#C7871F',
  primaryGradientStart: '#F0BC5D',
  primaryGradientEnd: '#C7871F',

  // Text
  textPrimary: '#F6EFE1',
  textSecondary: '#BDAD8E',
  textMuted: '#7C7057',
  textOnPrimary: '#221806',

  // Chat bubbles — honey for people, teal for HiveAI (a functional distinction,
  // not decoration: you can tell who's speaking from color alone)
  bubbleUser: '#E3A23A',
  bubbleUserText: '#221806',
  bubbleAI: '#152825',
  bubbleAIText: '#DCF1EE',
  aiAccent: '#4CC2B9',

  // Status
  success: '#5FB86B',
  warning: '#D97C3F',
  danger: '#E2604A',
  online: '#5FB86B',

  // Misc
  divider: '#291F11',
  overlay: 'rgba(10, 7, 3, 0.65)',
  inputBackground: '#1E1911',
  tabBarBackground: '#100D08',
  shadow: 'rgba(227, 162, 58, 0.22)',
};

export const lightTheme = {
  mode: 'light',

  // Backgrounds — warm paper, not cool white
  background: '#FBF7EE',
  surface: '#FFFFFF',
  surfaceAlt: '#F4EAD5',
  border: '#E7D8B8',

  // Brand / accent — deepened for contrast on a light, warm ground
  primary: '#B3791E',
  primaryPressed: '#93620F',
  primaryGradientStart: '#CB9333',
  primaryGradientEnd: '#93620F',

  // Text
  textPrimary: '#241C10',
  textSecondary: '#5C5038',
  textMuted: '#8D8065',
  textOnPrimary: '#FFFCF5',

  bubbleUser: '#B3791E',
  bubbleUserText: '#FFFCF5',
  bubbleAI: '#E7F4F1',
  bubbleAIText: '#123B37',
  aiAccent: '#1D8478',

  success: '#2E8E4E',
  warning: '#AA5E17',
  danger: '#C14634',
  online: '#2E8E4E',

  divider: '#EFE3C7',
  overlay: 'rgba(36, 28, 16, 0.4)',
  inputBackground: '#F4EAD5',
  tabBarBackground: '#FFFFFF',
  shadow: 'rgba(179, 121, 30, 0.16)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Radius is assigned by role, not applied uniformly: pills for
// fully-rounded controls, a slightly tighter curve for compact chrome
// (inputs, small chips), a softer one for bubbles/cards, and a near-flat
// corner for large surfaces — so hierarchy comes from shape, not just size.
export const radius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
};

// Type scale follows a ~1.25 ratio between steps (a classic, deliberate
// scale rather than round numbers), with letter-spacing tightened slightly
// on larger sizes and opened slightly on small caption/label text — the
// kind of hand-tuned detail that a default system scale skips.
export const typography = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.4, lineHeight: 40 },
  h1: { fontSize: 27, fontWeight: '700', letterSpacing: -0.3, lineHeight: 33 },
  h2: { fontSize: 21, fontWeight: '700', letterSpacing: -0.2, lineHeight: 27 },
  h3: { fontSize: 17, fontWeight: '600', letterSpacing: -0.1, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  small: { fontSize: 11.5, fontWeight: '500', letterSpacing: 0.15, lineHeight: 15 },
};
