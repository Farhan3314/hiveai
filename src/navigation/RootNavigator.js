import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { extractInviteCodeFromUrl } from '../utils/inviteLink';
import { setPendingInviteCode, getPendingInviteCode, clearPendingInviteCode } from '../utils/pendingInvite';

import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';

// Individual screens reachable outside the tab bar (pushed on top of tabs)
import GroupChatScreen from '../screens/chat/GroupChatScreen';
import MembersScreen from '../screens/chat/MembersScreen';
import FileAnalysisScreen from '../screens/chat/FileAnalysisScreen';
import ConversationSummaryScreen from '../screens/chat/ConversationSummaryScreen';
import ActionItemsScreen from '../screens/chat/ActionItemsScreen';
import SubscriptionScreen from '../screens/settings/SubscriptionScreen';
import AIUsageScreen from '../screens/settings/AIUsageScreen';
import AccountScreen from '../screens/settings/AccountScreen';
import PrivacySecurityScreen from '../screens/settings/PrivacySecurityScreen';
import HelpSupportScreen from '../screens/settings/HelpSupportScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import JoinGroupScreen from '../screens/main/JoinGroupScreen';

const Stack = createNativeStackNavigator();

// Exported so a future screen could also push navigation from outside a
// component if needed; used here to replay a group-invite deep link once
// the navigator is mounted and ready.
export const navigationRef = createNavigationContainerRef();

export default function RootNavigator() {
  const { user, initializing } = useAuth();
  const { colors, mode } = useTheme();
  const hasReplayedPendingRef = useRef(false);

  // Handles a "hiveai://join/ABC123" link in every state the app can be
  // opened from: cold start (getInitialURL), already running in the
  // background (the 'url' event), logged out (code is parked via
  // setPendingInviteCode until login), and already logged in (jumps
  // straight to JoinGroup). Without this, tapping an invite link would
  // just open the app to whatever screen it was already on and silently
  // drop the invite.
  useEffect(() => {
    const handleUrl = async (url) => {
      const code = extractInviteCodeFromUrl(url);
      if (!code) return;
      console.log('[RootNavigator] deep link invite code detected', code);
      if (user && navigationRef.isReady()) {
        navigationRef.navigate('JoinGroup', { code });
      } else {
        await setPendingInviteCode(code);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [user]);

  // Covers the logged-out case above: once `user` flips truthy (right
  // after login/signup), replay any code that was waiting.
  useEffect(() => {
    if (!user || hasReplayedPendingRef.current) return;
    (async () => {
      const code = await getPendingInviteCode();
      if (code) {
        hasReplayedPendingRef.current = true;
        await clearPendingInviteCode();
        // Navigation may not be mounted on the very first tick after
        // login — a short delay keeps this simple without a polling loop.
        setTimeout(() => {
          if (navigationRef.isReady()) navigationRef.navigate('JoinGroup', { code });
        }, 300);
      }
    })();
  }, [user]);

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.primary,
    },
  };

  // Wait for Firebase's onAuthStateChanged to report the initial auth
  // state before deciding whether to show Auth or the main app — this
  // avoids a flash of the Splash/Login screen for already-logged-in users.
  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen name="GroupChat" component={GroupChatScreen} />
            <Stack.Screen name="Members" component={MembersScreen} />
            <Stack.Screen name="JoinGroup" component={JoinGroupScreen} />
            <Stack.Screen name="FileAnalysis" component={FileAnalysisScreen} />
            <Stack.Screen name="ConversationSummary" component={ConversationSummaryScreen} />
            <Stack.Screen name="ActionItems" component={ActionItemsScreen} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} />
            <Stack.Screen name="AIUsage" component={AIUsageScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
            <Stack.Screen name="PrivacySecurity" component={PrivacySecurityScreen} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}