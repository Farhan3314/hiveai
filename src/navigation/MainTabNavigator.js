import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';

import HomeScreen from '../screens/main/HomeScreen';
import FriendsScreen from '../screens/main/FriendsScreen';
import AIAssistantScreen from '../screens/main/AIAssistantScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

const Tab = createBottomTabNavigator();

const ICONS = {
  Home: 'home',
  Friends: 'people',
  AI: 'sparkles',
  Notifications: 'notifications',
  Profile: 'person',
};

export default function MainTabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopColor: colors.border,
          height: 70,
          paddingBottom: 16,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={focused ? ICONS[route.name] : `${ICONS[route.name]}-outline`}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen name="AI" component={AIAssistantScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
