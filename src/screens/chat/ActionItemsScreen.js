import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import Button from '../../components/Button';
import { getMessagesForSummary } from '../../services/messages';
import { extractActionItems, aiLimitReachedMessage } from '../../services/ai';
import { incrementAIUsage, checkAIUsageLimit } from '../../services/users';
import { logAIUsage } from '../../services/usageTracking';
import { useAuth } from '../../context/AuthContext';

// Mirrors ConversationSummaryScreen's layout/flow, but for pulling out
// concrete action items and open questions instead of a general summary
// (README Phase 5: "action-item extraction" + "AI task generation").
export default function ActionItemsScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const { groupId, groupName } = route.params || {};

  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { allowed, plan, limit } = await checkAIUsageLimit(user.uid).catch(() => ({ allowed: true }));
      if (!allowed) {
        setResult(aiLimitReachedMessage(plan, limit));
        return;
      }
      const messages = await getMessagesForSummary(groupId);
      const output = await extractActionItems(messages);
      setResult(output);
      await incrementAIUsage(user.uid, 1);
      await logAIUsage({
        userId: user.uid,
        groupId,
        category: 'action_items',
        model: 'action-items',
        inputText: messages.map((m) => m.text).join('\n'),
        outputText: output,
        subscriptionPlan: plan,
      });
    } catch (e) {
      console.error('ActionItems generate error:', e);
      setResult("Sorry, I couldn't extract action items just now. Please try again in a moment 🙏");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          Action Items
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="checkbox-outline" size={22} color={colors.aiAccent} />
            <Text style={[typography.bodyBold, { color: colors.textPrimary, marginLeft: 8 }]}>
              {groupName || 'Conversation'} Action Items
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 8 }]}>
            HiveAI will scan recent messages for tasks and open questions.
          </Text>
        </View>

        <Button title="Extract Action Items" onPress={handleGenerate} loading={loading} style={{ marginTop: spacing.lg }} />

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
              HiveAI is scanning the conversation...
            </Text>
          </View>
        )}

        {!!result && !loading && (
          <View style={[styles.resultBox, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, marginTop: spacing.lg }]}>
            <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>{result}</Text>
          </View>
        )}
      </ScrollView>
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
  card: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  loadingBox: { alignItems: 'center', marginTop: 32 },
  resultBox: { padding: 16 },
});
