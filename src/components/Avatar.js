import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { initialsFor } from '../utils/user';

export default function Avatar({ name, email, photoURL, size = 44, style }) {
  const { colors, typography } = useTheme();

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary,
        },
        style,
      ]}
    >
      <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '700' }]}>
        {initialsFor(name, email)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});