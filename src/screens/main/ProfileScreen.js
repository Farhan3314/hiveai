import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import { initialsFor } from '../../utils/user';

const MENU_SECTIONS = [
  {
    items: [
      { key: 'editProfile', label: 'Edit Profile', icon: 'person-outline', route: 'EditProfile' },
      { key: 'account', label: 'Account', icon: 'settings-outline', route: 'Account' },
      { key: 'subscription', label: 'Subscription', icon: 'card-outline', route: 'Subscription' },
      { key: 'aiUsage', label: 'AI Usage', icon: 'bar-chart-outline', route: 'AIUsage' },
    ],
  },
  {
    items: [
      { key: 'privacy', label: 'Privacy & Security', icon: 'shield-checkmark-outline', route: 'PrivacySecurity' },
      { key: 'help', label: 'Help & Support', icon: 'help-circle-outline', route: 'HelpSupport' },
    ],
  },
];

export default function ProfileScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { user, logout } = useAuth();
  const navigation = useNavigation();

  const displayName = user?.name || 'Your Name';
  const displayEmail = user?.email || '';

  const handleNavigate = (route) => {
    if (navigation?.navigate) {
      // Screens not yet implemented will simply no-op / warn in dev;
      // wire these up as each destination screen is built.
      navigation.navigate(route);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[typography.h2, { color: colors.textPrimary }]}>Profile</Text>
        </View>

        {/* Avatar + identity */}
        <View style={styles.identity}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarFallback,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[typography.h2, { color: colors.textOnPrimary }]}>
                {initialsFor(displayName, displayEmail)}
              </Text>
            </View>
          )}

          <Text style={[typography.h3, { color: colors.textPrimary, marginTop: spacing.md }]}>
            {displayName}
          </Text>
          {!!displayEmail && (
            <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>
              {displayEmail}
            </Text>
          )}
        </View>

        {/* Menu sections */}
        {MENU_SECTIONS.map((section, sectionIndex) => (
          <View
            key={sectionIndex}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                marginTop: sectionIndex === 0 ? spacing.xl : spacing.md,
              },
            ]}
          >
            {section.items.map((item, index) => (
              <Pressable
                key={item.key}
                onPress={() => handleNavigate(item.route)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    paddingHorizontal: spacing.md,
                    borderBottomColor: colors.divider,
                    borderBottomWidth: index === section.items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  },
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <View style={styles.rowLeft}>
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
                    ]}
                  >
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[typography.body, { color: colors.textPrimary, marginLeft: spacing.sm }]}>
                    {item.label}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ))}

        {/* Logout */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.card,
            styles.row,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              marginTop: spacing.md,
              paddingHorizontal: spacing.md,
              justifyContent: 'flex-start',
            },
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm },
            ]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          </View>
          <Text style={[typography.bodyBold, { color: colors.danger, marginLeft: spacing.sm }]}>
            Logout
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 8,
  },
  identity: { alignItems: 'center', marginTop: 8 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});