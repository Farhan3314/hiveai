import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * variant: 'primary' | 'outline' | 'text'
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}) {
  const { colors, radius, typography } = useTheme();
  const isDisabled = disabled || loading;

  const baseStyle = [
    styles.base,
    { borderRadius: radius.md },
    variant === 'primary' && { backgroundColor: colors.primary },
    variant === 'outline' && {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    variant === 'text' && { backgroundColor: 'transparent' },
    isDisabled && { opacity: 0.6 },
    style,
  ];

  const textColor =
    variant === 'primary' ? colors.textOnPrimary : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [...baseStyle, pressed && !isDisabled && { opacity: 0.85 }]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[typography.bodyBold, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
