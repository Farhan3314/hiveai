import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';

const FAQ = [
  { q: 'How do I mention HiveAI in chat?', a: 'Type @HiveAI or tap the sparkles icon in the chat input.' },
  { q: 'How do friend requests work?', a: 'Go to Friends → Find More Friends and enter their registered email.' },
  { q: 'Can I share files?', a: 'Yes! Tap the attach icon in group chat to share and analyze files.' },
];

export default function HelpSupportScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const navigation = useNavigation();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          Help & Support
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Pressable
          onPress={() => Linking.openURL('mailto:support@hiveai.app')}
          style={[styles.contactCard, { backgroundColor: colors.primary, borderRadius: radius.lg }]}
        >
          <Ionicons name="mail" size={24} color={colors.textOnPrimary} />
          <Text style={[typography.bodyBold, { color: colors.textOnPrimary, marginLeft: 12 }]}>
            Email Support
          </Text>
        </Pressable>

        <Text style={[typography.h3, { color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md }]}>
          FAQ
        </Text>
        {FAQ.map((item) => (
          <View key={item.q} style={[styles.faqCard, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
            <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{item.q}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 6, lineHeight: 20 }]}>
              {item.a}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  faqCard: { padding: 16, marginBottom: 10 },
});
