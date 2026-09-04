import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { uploadAvatar } from '../../services/storage';
import FormInput from '../../components/FormInput';
import Button from '../../components/Button';

function initialsFor(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_SIZE = 96;

export default function EditProfileScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { user, updateUserProfile } = useAuth();
  const navigation = useNavigation();

  const [name, setName] = useState(user?.name || '');
  const [photoURI, setPhotoURI] = useState(user?.photoURL || null);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access to change your profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      setPhotoURI(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError('');
    setSaving(true);
    try {
      let photoURL = photoURI;
      if (photoURI && photoURI.startsWith('file://')) {
        photoURL = await uploadAvatar(user.uid, photoURI);
      }
      const res = await updateUserProfile({ name: name.trim(), photoURL });
    setSaving(false);

    if (res.success) {
      navigation.goBack();
    } else {
      Alert.alert('Could not save', res.error);
    }
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', e.message);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[typography.h3, { color: colors.textPrimary }]}>Edit Profile</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar section */}
          <View style={styles.avatarSection}>
            <Pressable onPress={pickImage}>
              {photoURI ? (
                <Image source={{ uri: photoURI }} style={styles.avatar} />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    styles.avatarFallback,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={[typography.h1, { color: colors.textOnPrimary }]}>
                    {initialsFor(name, user?.email)}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.editBadge,
                  { backgroundColor: colors.primary, borderColor: colors.background },
                ]}
              >
                <Ionicons name="camera" size={14} color={colors.textOnPrimary} />
              </View>
            </Pressable>
            <Pressable onPress={pickImage} hitSlop={8}>
              <Text style={[typography.bodyBold, { color: colors.primary, marginTop: spacing.sm }]}>
                Change Photo
              </Text>
            </Pressable>
          </View>

          {/* Fields */}
          <View style={{ marginTop: spacing.lg }}>
            <FormInput
              label="Full Name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (nameError) setNameError('');
              }}
              placeholder="Your name"
              autoCapitalize="words"
              error={nameError}
            />

            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>
              Email
            </Text>
            <View
              style={[
                styles.readOnlyField,
                { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radius.md },
              ]}
            >
              <Text style={[typography.body, { color: colors.textMuted }]}>{user?.email || ''}</Text>
            </View>
            <Text style={[typography.small, { color: colors.textMuted, marginTop: 4, marginBottom: spacing.md }]}>
              Email can't be changed here. Contact support if you need it updated.
            </Text>
          </View>

          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
            style={{ marginTop: spacing.sm }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  avatarSection: { alignItems: 'center', marginTop: 12 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  readOnlyField: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});