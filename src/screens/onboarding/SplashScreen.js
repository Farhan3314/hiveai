import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import Button from '../../components/Button';

export default function SplashScreen({ navigation }) {
  const { colors, spacing, typography, radius } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        {/* Logo mark — a honeycomb cell, not a generic app-icon shape */}
        <View
          style={[
            styles.logoBadge,
            { borderColor: colors.primary, backgroundColor: colors.surface },
          ]}
        >
          <MaterialCommunityIcons name="hexagon-outline" size={40} color={colors.primary} />
        </View>

        <Text style={[typography.display, { color: colors.textPrimary, marginTop: spacing.lg }]}>
          Hive<Text style={{ color: colors.primary }}>AI</Text>
        </Text>

        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
          ]}
        >
          Collaborate. Chat. Create. With AI.
        </Text>
      </View>

      <View style={styles.middle}>
        <View style={[styles.botBadge, { backgroundColor: colors.surface }]}>
          <Ionicons name="hardware-chip-outline" size={34} color={colors.aiAccent} />
        </View>
        <Text
          style={[
            typography.bodyBold,
            { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' },
          ]}
        >
          AI is not just a bot.{'\n'}AI is your teammate.
        </Text>
      </View>

      <View style={styles.bottom}>
        <Button
          title="Get Started"
          variant="primary"
          onPress={() => navigation.navigate('SignUp')}
          style={{ marginBottom: spacing.md }}
        />
        <Button
          title="Log In"
          variant="outline"
          onPress={() => navigation.navigate('Login')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  top: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoBadge: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    alignItems: 'center',
  },
  botBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    width: '100%',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
});
