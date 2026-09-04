import React, { useState } from 'react';
import { Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import FormInput from '../../components/FormInput';
import Button from '../../components/Button';

export default function ForgotPasswordScreen({ navigation }) {
  const { colors, spacing, typography } = useTheme();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setError('');
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    const result = await resetPassword(email);
    setLoading(false);
    if (result.success) {
      setSent(true);
    } else {
      setError(result.error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: 24 }} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>

        <Text style={[typography.h1, { color: colors.textPrimary }]}>Forgot Password</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: 6, marginBottom: spacing.xl }]}>
          Enter your email and we'll send you instructions
        </Text>

        <FormInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          error={error}
        />

        {sent && (
          <Text style={[typography.caption, { color: colors.success, marginBottom: spacing.md }]}>
            A reset link has been sent — please check your inbox.
          </Text>
        )}

        <Button title="Send Reset Link" onPress={handleSend} loading={loading} />

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 20, alignSelf: 'center' }}>
          <Text style={[typography.caption, { color: colors.primary }]}>Back to login</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
