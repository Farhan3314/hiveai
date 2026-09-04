import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { PLANS } from '../../config';
import { db } from '../../services/firebase';

export default function AIUsageScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [usage, setUsage] = useState(user?.aiTokensUsed || 0);
  const [plan, setPlan] = useState(user?.plan || 'free');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setUsage(snap.data().aiTokensUsed || 0);
        setPlan(snap.data().plan || 'free');
      }
    });
    return unsub;
  }, [user?.uid]);

  const limit = PLANS[plan]?.aiLimit || 50;
  const percent = Math.min((usage / limit) * 100, 100);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          AI Usage
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={28} color={colors.aiAccent} />
            <View style={{ marginLeft: 12 }}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>{PLANS[plan]?.name} Plan</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {limit} AI requests per month
              </Text>
            </View>
          </View>

          <View style={[styles.progressBg, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, marginTop: spacing.lg }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: percent >= 90 ? colors.danger : colors.primary,
                  borderRadius: radius.pill,
                  width: `${percent}%`,
                },
              ]}
            />
          </View>

          <Text style={[typography.bodyBold, { color: colors.textPrimary, marginTop: spacing.md }]}>
            {usage} / {limit} used
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
            {limit - usage > 0 ? `${limit - usage} requests remaining this month` : 'Limit reached — upgrade your plan'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.md }]}>
          <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>Usage breakdown</Text>
          {[
            { label: 'Chat @HiveAI mentions', icon: 'chatbubble' },
            { label: 'Conversation summaries', icon: 'document-text' },
            { label: 'File analysis', icon: 'document' },
            { label: 'AI Assistant tab', icon: 'sparkles' },
          ].map((item) => (
            <View key={item.label} style={styles.usageRow}>
              <Ionicons name={item.icon} size={18} color={colors.textMuted} />
              <Text style={[typography.body, { color: colors.textSecondary, marginLeft: 10, flex: 1 }]}>
                {item.label}
              </Text>
              <Ionicons name="checkmark" size={16} color={colors.success} />
            </View>
          ))}
        </View>
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
  card: { padding: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  progressBg: { height: 10, overflow: 'hidden' },
  progressFill: { height: '100%' },
  usageRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
});
