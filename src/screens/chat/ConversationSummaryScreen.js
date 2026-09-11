import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import Button from '../../components/Button';
import { getMessagesForSummary } from '../../services/messages';
import { generateConversationSummary, aiLimitReachedMessage } from '../../services/ai';
import { incrementAIUsage, checkAIUsageLimit } from '../../services/users';
import { useAuth } from '../../context/AuthContext';

export default function ConversationSummaryScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const { groupId, groupName } = route.params || {};

  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { allowed, plan, limit } = await checkAIUsageLimit(user.uid).catch(() => ({ allowed: true }));
      if (!allowed) {
        setSummary(aiLimitReachedMessage(plan, limit));
        return;
      }
      const messages = await getMessagesForSummary(groupId);
      const result = await generateConversationSummary(messages);
      setSummary(result);
      await incrementAIUsage(user.uid, 1);
    } catch (e) {
      console.error('ConversationSummary generate error:', e);
      setSummary("Sorry, I couldn't generate a summary just now. Please try again in a moment 🙏");
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
          AI Summary
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={22} color={colors.aiAccent} />
            <Text style={[typography.bodyBold, { color: colors.textPrimary, marginLeft: 8 }]}>
              {groupName || 'Conversation'} Summary
            </Text>
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 8 }]}>
            HiveAI will analyze recent messages and generate key takeaways.
          </Text>
        </View>

        <Button title="Generate Summary" onPress={handleGenerate} loading={loading} style={{ marginTop: spacing.lg }} />

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
              HiveAI is analyzing...
            </Text>
          </View>
        )}

        {!!summary && !loading && (
          <View style={[styles.summaryBox, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, marginTop: spacing.lg }]}>
            <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>{summary}</Text>
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
  summaryBox: { padding: 16 },
});
