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

export default function LoginScreen({ navigation }) {
  const { colors, spacing, typography } = useTheme();
  const { login, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Please enter a valid email format';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = async () => {
    setFormError('');
    if (!validate()) return;
    const result = await login(email, password);
    if (!result.success) {
      setFormError(result.error);
    }
    // On success, AuthContext's onAuthStateChanged updates `user`,
    // and RootNavigator automatically switches to the main app.
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

          <Text style={[typography.h1, { color: colors.textPrimary }]}>Welcome back</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: 6, marginBottom: spacing.xl }]}>
            Login to continue
          </Text>

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

          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={{ alignSelf: 'flex-end', marginBottom: spacing.lg }}
          >
            <Text style={[typography.caption, { color: colors.primary }]}>Forgot password?</Text>
          </Pressable>

          {!!formError && (
            <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>
              {formError}
            </Text>
          )}

          <Button title="Log In" onPress={handleLogin} loading={isLoading} />

          <View style={styles.footerRow}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Don't have an account?{' '}
            </Text>
            <Pressable onPress={() => navigation.navigate('SignUp')}>
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>
                Sign up
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
