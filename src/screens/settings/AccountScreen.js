import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function AccountScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();

  const rows = [
    { label: 'Email', value: user?.email },
    { label: 'User ID', value: user?.uid ? `${user.uid.slice(0, 12)}...` : '' },
    { label: 'Plan', value: user?.plan || 'free' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          Account
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {rows.map((row) => (
          <View key={row.label} style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{row.label}</Text>
            <Text style={[typography.body, { color: colors.textPrimary, marginTop: 4 }]}>{row.value}</Text>
          </View>
        ))}
        <Pressable
          onPress={() => navigation.navigate('EditProfile')}
          style={[styles.linkRow, { marginTop: spacing.lg }]}
        >
          <Text style={[typography.bodyBold, { color: colors.primary }]}>Edit Profile →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  row: { padding: 16, marginBottom: 10 },
  linkRow: { alignItems: 'center' },
});
