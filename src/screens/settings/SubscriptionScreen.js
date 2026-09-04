import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import { PLANS } from '../../config';
import { updateUserDoc } from '../../services/users';

const PLAN_LIST = [
  { key: 'free', ...PLANS.free, features: ['50 AI requests/mo', '3 groups', 'Basic chat'] },
  { key: 'pro', ...PLANS.pro, features: ['500 AI requests/mo', 'Unlimited groups', 'File analysis', 'Priority AI'], popular: true },
  { key: 'team', ...PLANS.team, features: ['2000 AI requests/mo', 'Team admin', 'Advanced summaries', 'All Pro features'] },
];

export default function SubscriptionScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [upgrading, setUpgrading] = useState(null);

  const currentPlan = user?.plan || 'free';

  const handleSelect = async (planKey) => {
    if (planKey === currentPlan) return;

    // Downgrading to Free has no payment step, so it shouldn't go through the
    // "Activate Demo" purchase dialog below. Previously `planKey !== 'free'`
    // gated the entire function body, so tapping "Choose Free" while on
    // Pro/Team silently did nothing at all — no dialog, no downgrade, no
    // error. Confirm and apply it directly instead.
    if (planKey === 'free') {
      Alert.alert('Switch to Free?', "You'll lose access to your current plan's features.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch to Free',
          style: 'destructive',
          onPress: async () => {
            setUpgrading(planKey);
            try {
              await updateUserDoc(user.uid, { plan: planKey });
              Alert.alert('Done', "You're now on the Free plan.");
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setUpgrading(null);
            }
          },
        },
      ]);
      return;
    }

    Alert.alert(
      'Demo Mode',
      `In production, ${PLANS[planKey].name} ($${PLANS[planKey].price}/mo) would open payment. For demo, we'll activate it free.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate Demo',
          onPress: async () => {
            setUpgrading(planKey);
            try {
              await updateUserDoc(user.uid, { plan: planKey });
              Alert.alert('Success', `${PLANS[planKey].name} plan activated!`);
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setUpgrading(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          Subscription
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Current plan: <Text style={{ color: colors.primary, fontWeight: '700' }}>{PLANS[currentPlan]?.name || 'Free'}</Text>
        </Text>

        {PLAN_LIST.map((plan) => {
          const isCurrent = plan.key === currentPlan;
          return (
            <View
              key={plan.key}
              style={[
                styles.planCard,
                {
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  borderColor: plan.popular ? colors.primary : colors.border,
                  borderWidth: plan.popular ? 2 : 1,
                },
              ]}
            >
              {plan.popular && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[typography.small, { color: colors.textOnPrimary }]}>POPULAR</Text>
                </View>
              )}
              <Text style={[typography.h3, { color: colors.textPrimary }]}>{plan.name}</Text>
              <Text style={[typography.h2, { color: colors.primary, marginTop: 4 }]}>
                ${plan.price}<Text style={[typography.caption, { color: colors.textMuted }]}>/mo</Text>
              </Text>
              {plan.features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[typography.caption, { color: colors.textSecondary, marginLeft: 8 }]}>{f}</Text>
                </View>
              ))}
              <Button
                title={isCurrent ? 'Current Plan' : `Choose ${plan.name}`}
                variant={isCurrent ? 'outline' : 'primary'}
                disabled={isCurrent}
                loading={upgrading === plan.key}
                onPress={() => handleSelect(plan.key)}
                style={{ marginTop: spacing.md }}
              />
            </View>
          );
        })}
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
  planCard: { padding: 20, marginBottom: 16 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 8,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
});
