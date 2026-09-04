import React from 'react';
import { Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeContext';

export default function CreateNewPasswordScreen({ navigation }) {
  const { colors, spacing, typography } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start', marginBottom: 24 }} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>

        <Ionicons name="mail-open-outline" size={56} color={colors.primary} />
        <Text style={[typography.h2, { color: colors.textPrimary, marginTop: spacing.lg, textAlign: 'center' }]}>
          Check Your Email
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center', lineHeight: 22 }]}>
          Firebase password reset links open in your browser/email app. Tap the link in the email to set a new password, then return here to log in.
        </Text>
        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: spacing.xl }}>
          <Text style={[typography.bodyBold, { color: colors.primary }]}>Back to Login</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
