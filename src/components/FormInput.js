import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  error,
}) {
  const { colors, radius, typography, spacing } = useTheme();
  const [hidden, setHidden] = useState(secureTextEntry);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {!!label && (
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          style={[typography.body, styles.input, { color: colors.textPrimary }]}
        />
        {secureTextEntry && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text style={[typography.small, { color: colors.danger, marginTop: 4 }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
  },
});
