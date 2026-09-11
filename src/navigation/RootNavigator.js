import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';

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

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, initializing } = useAuth();
  const { colors, mode } = useTheme();

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
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen name="GroupChat" component={GroupChatScreen} />
            <Stack.Screen name="Members" component={MembersScreen} />
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