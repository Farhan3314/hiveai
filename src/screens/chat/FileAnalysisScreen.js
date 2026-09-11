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
import { embeddingsAvailable } from '../../services/embeddings';
import { incrementAIUsage, checkAIUsageLimit } from '../../services/users';
import { logAIUsage } from '../../services/usageTracking';
import { RAG_SUPPORTED_EXTENSIONS } from '../../config';

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

export default function FileAnalysisScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const { fileName, fileUrl, fileUri, groupId, aiChatId, initialQuestion } = route.params || {};

  const scopePath = groupId ? `groups/${groupId}` : `users/${user.uid}/aiChats/${aiChatId}`;

  const [stage, setStage] = useState(STAGE.READING);
  const [statusText, setStatusText] = useState('Reading file...');
  const [docId, setDocId] = useState(null);
  const [qa, setQa] = useState([]); // { id, question, answer, loading }
  const [question, setQuestion] = useState('');
  const listRef = useRef(null);
  const askedInitialQuestion = useRef(false);

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
        setStatusText(
          `"${fileName}" isn't a supported text format. This app reads ${RAG_SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')} files directly in Expo Go. Try exporting this file as .txt and re-uploading.`
        );
        return;
      }

      try {
        setStage(STAGE.READING);
        setStatusText('Reading file...');
        const res = await fetch(fileUri);
        if (!res.ok) throw new Error(`Could not read the file (status ${res.status}).`);
        const text = await res.text();
        if (cancelled) return;

        if (!text || !text.trim()) {
          setStage(STAGE.ERROR);
          setStatusText('This file appears to be empty.');
          return;
        }

        setStage(STAGE.PROCESSING);
        const { docId: newDocId, chunkCount } = await ingestDocument({
          scopePath,
          fileName,
          fileUrl,
          text,
          onProgress: (status, detail) => {
            if (cancelled) return;
            if (status === 'error') {
              setStage(STAGE.ERROR);
            }
            setStatusText(detail);
          },
        });

        if (cancelled) return;
        if (chunkCount > 0) {
          setDocId(newDocId);
          setStage(STAGE.READY);
          setStatusText(`Ready — ask anything about this document (${chunkCount} sections indexed).`);
        }
      } catch (e) {
        if (cancelled) return;
        console.error('FileAnalysis ingest error:', e);
        setStage(STAGE.ERROR);
        setStatusText(e.message || 'Something went wrong while processing this file.');
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
  const handleAsk = async (overrideQuestion) => {
    const trimmed = (overrideQuestion ?? question).trim();
    if (!trimmed || stage !== STAGE.READY) return;

    const entryId = `${Date.now()}`;
    setQa((prev) => [...prev, { id: entryId, question: trimmed, answer: '', sources: [], loading: true }]);
    setQuestion('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { allowed, plan, limit } = await checkAIUsageLimit(user.uid).catch(() => ({ allowed: true }));
      let answer;
      let sources = [];
      if (!allowed) {
        answer = aiLimitReachedMessage(plan, limit);
      } else {
        const chunks = await retrieveContext({ scopePath, docId, question: trimmed, topK: 4 });
        const result = await generateRAGAnswer(trimmed, chunks);
        answer = result.text;
        sources = result.sources;
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
        });
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
    if (stage === STAGE.READY && initialQuestion?.trim() && !askedInitialQuestion.current) {
      askedInitialQuestion.current = true;
      handleAsk(initialQuestion);
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