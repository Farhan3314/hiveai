import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import FormInput from '../../components/FormInput';
import { getGroupInvitePreview, joinGroupByCode } from '../../services/groups';

// Reached two ways:
//  1) Deep link (hiveai://join/ABC123) — route.params.code is already set,
//     RootNavigator wires this up via the `linking` config / pendingInvite.
//  2) Manually from Home → "Join with a code" — no code yet, user types one.
// Either way this screen previews the group name before actually joining,
// so tapping a link never silently drops someone into a group.
export default function JoinGroupScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const initialCode = route.params?.code || '';

  const [code, setCode] = useState(initialCode);
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const runPreview = async (raw) => {
    const clean = (raw || '').trim().toUpperCase();
    if (!clean) return;
    setChecking(true);
    setError('');
    setPreview(null);
    try {
      const result = await getGroupInvitePreview(clean);
      if (!result) {
        setError('This invite code is invalid or has expired.');
      } else {
        setPreview(result);
      }
    } catch (e) {
      console.error('[JoinGroupScreen] preview FAILED', { code: e.code, message: e.message });
      setError(e.message || 'Could not check this code.');
    } finally {
      setChecking(false);
    }
  };

  // A code arriving via deep link is trusted enough to preview
  // automatically — no need to make the user retype what they just tapped.
  useEffect(() => {
    if (initialCode) runPreview(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const handleJoin = async () => {
    if (!preview) return;
    setJoining(true);
    try {
      const result = await joinGroupByCode(preview.code, user);
      navigation.replace('GroupChat', { groupId: result.groupId, groupName: result.groupName });
    } catch (e) {
      console.error('[JoinGroupScreen] join FAILED', { code: e.code, message: e.message });
      Alert.alert('Could not join', e.message || 'Something went wrong.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, marginLeft: 10 }]}>
          Join a Group
        </Text>
      </View>

      <View style={{ padding: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md }]}>
          Paste or type the invite code someone shared with you.
        </Text>

        <FormInput
          label="Invite code"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="e.g. K7XQ2M"
          autoCapitalize="characters"
        />

        <Button
          title={checking ? 'Checking…' : 'Check code'}
          variant="outline"
          onPress={() => runPreview(code)}
          loading={checking}
          disabled={!code.trim()}
        />

        {!!error && (
          <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md, textAlign: 'center' }]}>
            {error}
          </Text>
        )}

        {preview && (
          <View
            style={[
              styles.previewCard,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.lg },
            ]}
          >
            <Ionicons name="people-circle-outline" size={36} color={colors.primary} />
            <Text style={[typography.h3, { color: colors.textPrimary, marginTop: 8 }]}>
              {preview.groupName}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4, marginBottom: spacing.md }]}>
              You've been invited to join this group.
            </Text>
            {joining ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Button title="Join Group" onPress={handleJoin} style={{ width: '100%' }} />
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewCard: {
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
  },
});
