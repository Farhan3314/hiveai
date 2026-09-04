import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import FormInput from '../../components/FormInput';
import Button from '../../components/Button';

export default function SignUpScreen({ navigation }) {
  const { colors, spacing, typography } = useTheme();
  const { signup, isLoading } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = 'Full name is required';
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Please enter a valid email format';
    if (!password) next.password = 'Password is required';
    else if (password.length < 6) next.password = 'Password must be at least 6 characters long';
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignUp = async () => {
    setFormError('');
    if (!validate()) return;
    const result = await signup(fullName.trim(), email, password);
    if (!result.success) {
      setFormError(result.error);
    }
    // On success, AuthContext's onAuthStateChanged updates `user`,
    // and RootNavigator automatically switches to the Dashboard/Home.
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: 24 }} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>

          <Text style={[typography.h1, { color: colors.textPrimary }]}>Create Account</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: 6, marginBottom: spacing.xl }]}>
            Join HiveAI today
          </Text>

          <FormInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full Name"
            autoCapitalize="words"
            error={errors.fullName}
          />
          <FormInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            error={errors.email}
          />
          <FormInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            error={errors.password}
          />
          <FormInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            secureTextEntry
            error={errors.confirmPassword}
          />

          {!!formError && (
            <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>
              {formError}
            </Text>
          )}

          <Button title="Sign Up" onPress={handleSignUp} loading={isLoading} />

          <View style={styles.footerRow}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Already have an account?{' '}
            </Text>
            <Pressable onPress={() => navigation.navigate('Login')}>
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>
                Log in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
});
