import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { generateRAGAnswer, aiLimitReachedMessage } from '../../services/ai';
import { ingestDocument, retrieveContext, isRAGSupported } from '../../services/rag';
import { extractTextFromFile } from '../../services/textExtract';
import { embeddingsAvailable } from '../../services/embeddings';
import { incrementAIUsage, checkAIUsageLimit } from '../../services/users';
import { logAIUsage } from '../../services/usageTracking';
import { postAIMessage } from '../../services/messages';
import { addAIChatMessage } from '../../services/aiChats';
import { RAG_SUPPORTED_EXTENSIONS, DOCUMENT_DIRECT_MAX_CHARS } from '../../config';

// STAGE constants drive the "Uploading -> Processing -> Completed" status
// feedback (FR-028) and double as an error/unsupported state so the UI never
// silently pretends a file was analyzed when it wasn't.
const STAGE = {
  READING: 'reading',
  PROCESSING: 'processing',
  READY: 'ready',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
};

// Used when the document was sent with no caption/prompt, so HiveAI still
// replies right after processing instead of sitting silent.
// Splits document text into a few big passages for generateRAGAnswer (used
// when embeddings aren't needed or aren't available).
function directChunks(fileName, text) {
  const out = [];
  const PIECE = 3500;
  const capped = (text || '').slice(0, DOCUMENT_DIRECT_MAX_CHARS);
  for (let i = 0; i < capped.length; i += PIECE) {
    out.push({ fileName, text: capped.slice(i, i + PIECE), score: 1 });
  }
  return out;
}

const DEFAULT_QUESTION = 'Please give a short summary of this document and list its key points.';

export default function FileAnalysisScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const { fileName, fileUri, groupId, aiChatId, initialQuestion } = route.params || {};

  const scopePath = groupId ? `groups/${groupId}` : `users/${user.uid}/aiChats/${aiChatId}`;

  const [stage, setStage] = useState(STAGE.READING);
  const [statusText, setStatusText] = useState('Reading file...');
  const [docId, setDocId] = useState(null);
  const [qa, setQa] = useState([]); // { id, question, answer, loading }
  const [question, setQuestion] = useState('');
  const listRef = useRef(null);
  const askedInitialQuestion = useRef(false);
  const fullTextRef = useRef('');
  const directModeRef = useRef(false);

  // Copies HiveAI's answer into the chat the file was sent from (group chat
  // for everyone to see, or the user's own AI Assistant thread), so the
  // reply shows up in the conversation itself — not just on this screen.
  const mirrorToChat = async (text, sources = []) => {
    try {
      if (groupId) {
        await postAIMessage(groupId, { text, sources });
      } else if (aiChatId) {
        await addAIChatMessage(user.uid, aiChatId, {
          senderId: 'hiveai',
          senderName: 'HiveAI',
          type: 'ai',
          text,
          ...(sources.length ? { sources } : {}),
        });
      }
    } catch (e) {
      console.error('[file-analysis] mirrorToChat failed (non-fatal):', e);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!embeddingsAvailable()) {
        setStage(STAGE.ERROR);
        setStatusText('Add EXPO_PUBLIC_OPENROUTER_API_KEY to your .env to enable document Q&A.');
        return;
      }

      if (!isRAGSupported(fileName)) {
        setStage(STAGE.UNSUPPORTED);
        const unsupportedMsg = `"${fileName}" isn't a format I can read yet. I can read ${RAG_SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')} files. Try exporting it as PDF or .txt and re-uploading.`;
        setStatusText(unsupportedMsg);
        mirrorToChat(unsupportedMsg);
        return;
      }

      try {
        setStage(STAGE.READING);
        setStatusText('Reading file...');
        // PDF / DOCX are parsed on-device; text-like files are read directly.
        const { text, truncated } = await extractTextFromFile(fileUri, fileName);
        if (cancelled) return;

        if (!text || !text.trim()) {
          setStage(STAGE.ERROR);
          setStatusText('This file appears to be empty.');
          return;
        }

        fullTextRef.current = text;
        const longNote = truncated || text.length > DOCUMENT_DIRECT_MAX_CHARS;

        // Short documents: no embeddings needed, answer straight from the text.
        if (text.length <= DOCUMENT_DIRECT_MAX_CHARS) {
          directModeRef.current = true;
          setStage(STAGE.READY);
          setStatusText('Ready — ask anything about this document.');
          return;
        }

        setStage(STAGE.PROCESSING);
        try {
          const { docId: newDocId, chunkCount } = await ingestDocument({
            scopePath,
            fileName,
            text,
            onProgress: (status, detail) => {
              if (cancelled) return;
              // Errors are handled by the fallback below, not shown as a dead end.
              if (status !== 'error') setStatusText(detail);
            },
          });
          if (cancelled) return;
          if (chunkCount > 0) {
            setDocId(newDocId);
            setStage(STAGE.READY);
            setStatusText(
              `Ready — ask anything about this document (${chunkCount} sections indexed).` +
                (truncated ? ' The file is very long, so only the first part was indexed.' : '')
            );
            return;
          }
        } catch (ingestError) {
          if (cancelled) return;
          console.warn('[file-analysis] indexing failed, answering from the start of the document instead:', ingestError?.message);
        }

        // Indexing failed (e.g. free embedding model busy): still answer from
        // the beginning of the document instead of giving up.
        directModeRef.current = true;
        setStage(STAGE.READY);
        setStatusText(
          longNote
            ? 'Ready — this file is long, so I will answer from its first part.'
            : 'Ready — ask anything about this document.'
        );
      } catch (e) {
        if (cancelled) return;
        console.error('FileAnalysis ingest error:', e);
        const failMsg = e.message || 'Something went wrong while processing this file.';
        setStage(STAGE.ERROR);
        setStatusText(failMsg);
        // Also tell the chat the file came from, so it isn't left silent.
        mirrorToChat(`I couldn't read "${fileName}". ${failMsg}`);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUri, fileName]);

  // Extracted so it can be triggered either by the user pressing send, or
  // automatically once the doc finishes processing if they already typed a
  // prompt before it was uploaded (see initialQuestion below).
  const handleAsk = async (overrideQuestion, { auto = false } = {}) => {
    // onPress/onSubmitEditing call this with a native event object, not a
    // string — treat anything that isn't a real string override as "use
    // the current question state" instead of crashing on event.trim().
    const source = typeof overrideQuestion === 'string' ? overrideQuestion : question;
    const isAuto = auto === true;
    const trimmed = source.trim();
    if (!trimmed || stage !== STAGE.READY) return;

    const entryId = `${Date.now()}`;
    setQa((prev) => [...prev, { id: entryId, question: trimmed, answer: '', sources: [], loading: true }]);
    setQuestion('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { allowed, plan, limit } = await checkAIUsageLimit(user.uid);
      let answer;
      let sources = [];
      if (!allowed) {
        answer = aiLimitReachedMessage(plan, limit);
        if (isAuto) await mirrorToChat(answer);
      } else {
        let chunks;
        if (directModeRef.current) {
          chunks = directChunks(fileName, fullTextRef.current);
        } else {
          try {
            chunks = await retrieveContext({ scopePath, docId, question: trimmed, topK: 4, fallbackToFirst: isAuto });
          } catch (retrieveError) {
            console.warn('[file-analysis] retrieval failed, using start of document:', retrieveError?.message);
            chunks = directChunks(fileName, fullTextRef.current);
          }
        }
        const result = await generateRAGAnswer(trimmed, chunks);
        answer = result.text;
        sources = result.sources;
        // The first (auto) answer is also posted into the chat itself.
        if (isAuto) await mirrorToChat(answer, sources);
        await incrementAIUsage(user.uid, 1).catch(() => {});
        await logAIUsage({
          userId: user.uid,
          groupId,
          chatId: aiChatId,
          category: 'file_analysis',
          model: 'file-qa',
          inputText: trimmed,
          outputText: answer,
          subscriptionPlan: plan,
        }).catch((error) => console.error('[file-analysis] logAIUsage failed after response:', error));
      }
      setQa((prev) =>
        prev.map((item) => (item.id === entryId ? { ...item, answer, sources, loading: false } : item))
      );
    } catch (e) {
      console.error('FileAnalysis ask error:', e);
      setQa((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? { ...item, answer: "Sorry, I couldn't answer that just now. Please try again in a moment 🙏", loading: false }
            : item
        )
      );
    } finally {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // If the user typed a prompt while the document was still "on hold" in
  // the AI chat, ask it automatically the moment processing finishes,
  // instead of silently dropping it.
  useEffect(() => {
    if (stage === STAGE.READY && !askedInitialQuestion.current) {
      askedInitialQuestion.current = true;
      // With a caption -> answer that. Without one -> auto-summarize.
      handleAsk(initialQuestion?.trim() || DEFAULT_QUESTION, { auto: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, initialQuestion]);

  const isBusy = stage === STAGE.READING || stage === STAGE.PROCESSING;
  const isBlocked = stage === STAGE.ERROR || stage === STAGE.UNSUPPORTED;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]} numberOfLines={1}>
          {fileName || 'Document'}
        </Text>
      </View>

      <View style={[styles.statusBar, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
        {isBusy && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />}
        {isBlocked && (
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={colors.textSecondary}
            style={{ marginRight: 8 }}
          />
        )}
        {stage === STAGE.READY && (
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        )}
        <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>{statusText}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={qa}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
          ListEmptyComponent={
            stage === STAGE.READY ? (
              <View style={styles.emptyBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.textMuted} />
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
                  Ask a question about this document to get started.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.lg }}>
              <View style={[styles.questionBubble, { backgroundColor: colors.primary, borderRadius: radius.lg }]}>
                <Text style={[typography.body, { color: '#fff' }]}>{item.question}</Text>
              </View>
              <View
                style={[
                  styles.answerBubble,
                  { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, marginTop: 8 },
                ]}
              >
                {item.loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 22 }]}>
                      {item.answer}
                    </Text>
                    {!!item.sources?.length && (
                      <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                        <Text style={[typography.small, { color: colors.textMuted, marginBottom: 4 }]}>
                          Sources
                        </Text>
                        {item.sources.map((s) => (
                          <Text key={s.fileName} style={[typography.small, { color: colors.aiAccent }]}>
                            [{s.refIndex}] {s.fileName} · {Math.round(s.score * 100)}% match
                          </Text>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          )}
        />

        {!isBlocked && (
          <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder={stage === STAGE.READY ? 'Ask about this document...' : 'Processing...'}
              placeholderTextColor={colors.textMuted}
              editable={stage === STAGE.READY}
              style={[
                styles.input,
                { color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg },
              ]}
              onSubmitEditing={handleAsk}
              returnKeyType="send"
            />
            <Pressable
              onPress={handleAsk}
              disabled={stage !== STAGE.READY || !question.trim()}
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: stage === STAGE.READY ? 1 : 0.5 }]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
  },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  questionBubble: { alignSelf: 'flex-end', maxWidth: '85%', padding: 12 },
  answerBubble: { padding: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});