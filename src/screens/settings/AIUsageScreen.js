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
import { getUsageBreakdown, categoryLabel } from '../../services/usageTracking';

export default function AIUsageScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [usage, setUsage] = useState(user?.aiTokensUsed || 0);
  const [plan, setPlan] = useState(user?.plan || 'free');
  const [breakdown, setBreakdown] = useState({});
  const [totals, setTotals] = useState({ totalTokens: 0, totalCost: 0, totalCalls: 0 });
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);

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

  // Real per-category token/cost breakdown (README Phase 3: "AI Cost &
  // Analytics"), sourced from the aiUsageLogs written by every AI call.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    setLoadingBreakdown(true);
    getUsageBreakdown(user.uid).then((result) => {
      if (cancelled) return;
      setBreakdown(result.breakdown);
      setTotals(result);
      setLoadingBreakdown(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const limit = PLANS[plan]?.aiLimit || 50;
  const percent = Math.min((usage / limit) * 100, 100);
  const breakdownEntries = Object.entries(breakdown).sort((a, b) => b[1].calls - a[1].calls);

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
          <View style={styles.cardHeader}>
            <Text style={[typography.bodyBold, { color: colors.textPrimary, flex: 1 }]}>Usage breakdown</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>This month</Text>
          </View>

          {loadingBreakdown ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 12 }]}>Loading...</Text>
          ) : breakdownEntries.length === 0 ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 12 }]}>
              No AI activity yet this month.
            </Text>
          ) : (
            breakdownEntries.map(([cat, stats]) => {
              const { label, icon } = categoryLabel(cat);
              return (
                <View key={cat} style={styles.usageRow}>
                  <Ionicons name={icon} size={18} color={colors.textMuted} />
                  <Text style={[typography.body, { color: colors.textSecondary, marginLeft: 10, flex: 1 }]}>
                    {label}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textPrimary }]}>
                    {stats.calls} call{stats.calls === 1 ? '' : 's'} · {stats.tokens.toLocaleString()} tok
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing.md }]}>
          <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>Estimated cost</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 6 }]}>
            Based on tokens used across free/paid AI models this month. Free-tier models (used by default)
            cost $0 — this becomes meaningful once a paid model is configured.
          </Text>
          <Text style={[typography.h3, { color: colors.textPrimary, marginTop: 10 }]}>
            ${totals.totalCost.toFixed(4)}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
            {totals.totalCalls} AI call{totals.totalCalls === 1 ? '' : 's'} · {totals.totalTokens.toLocaleString()} tokens total
          </Text>
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
