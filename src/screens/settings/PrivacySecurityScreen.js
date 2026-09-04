import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';

export default function PrivacySecurityScreen() {
  const { colors, typography, spacing, radius, mode, toggleTheme } = useTheme();
  const navigation = useNavigation();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          Privacy & Security
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>Dark Mode</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              Toggle app appearance
            </Text>
          </View>
          <Switch value={mode === 'dark'} onValueChange={toggleTheme} trackColor={{ true: colors.primary }} />
        </View>
        {[
          { title: 'End-to-end encryption', desc: 'Coming in a future update', icon: 'lock-closed' },
          { title: 'Two-factor authentication', desc: 'Add extra security to your account', icon: 'shield-checkmark' },
          { title: 'Data export', desc: 'Download your chat history', icon: 'download' },
        ].map((item) => (
          <View key={item.title} style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, marginTop: 10 }]}>
            <Ionicons name={item.icon} size={22} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
});
