import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotification,
  createNotification,
} from '../../services/notifications';
import { addMemberToGroup, getGroup } from '../../services/groups';
import { formatRelativeTime } from '../../utils/user';

const ICON_MAP = {
  ai_reply: 'sparkles',
  friend_request: 'person-add',
  friend_accepted: 'checkmark-circle',
  group_invite: 'people-circle',
  group_invite_accepted: 'checkmark-done-circle',
  group_remove: 'person-remove',
  group_member_left: 'exit-outline',
  default: 'notifications',
};

export default function NotificationsScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);
  const [respondingId, setRespondingId] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeNotifications(user.uid, setNotifications);
    return unsub;
  }, [user?.uid]);

  const handlePress = async (notif) => {
    // Pending group invites are handled by the Accept/Decline buttons, not
    // by tapping the row (tapping would otherwise jump into a group chat
    // the person hasn't actually joined yet).
    if (notif.type === 'group_invite' && notif.status === 'pending') return;
    if (!notif.read) await markNotificationRead(notif.id);
    if (notif.groupId) {
      navigation.navigate('GroupChat', { groupId: notif.groupId, groupName: notif.groupName || 'Group' });
    }
  };

  const handleAcceptInvite = async (notif) => {
    setRespondingId(notif.id);
    try {
      const group = await getGroup(notif.groupId);
      if (!group) {
        Alert.alert('Group not found', 'This group may have been deleted.');
        await updateNotification(notif.id, { status: 'declined', read: true });
        return;
      }
      console.log('[NotificationsScreen] Accepting invite, joining group', notif.groupId);
      await addMemberToGroup(notif.groupId, user.uid);
      await updateNotification(notif.id, { status: 'accepted', read: true });
      if (notif.inviterUid) {
        await createNotification({
          userId: notif.inviterUid,
          type: 'group_invite_accepted',
          title: 'Invite accepted',
          body: `${user.name || 'Someone'} joined "${notif.groupName || group.name}"`,
          groupId: notif.groupId,
          groupName: notif.groupName || group.name,
        });
      }
      navigation.navigate('GroupChat', { groupId: notif.groupId, groupName: notif.groupName || group.name });
    } catch (e) {
      console.error('[NotificationsScreen] handleAcceptInvite FAILED', { code: e.code, message: e.message });
      Alert.alert('Error', e.message || 'Could not join the group');
    } finally {
      setRespondingId(null);
    }
  };

  const handleDeclineInvite = async (notif) => {
    setRespondingId(notif.id);
    try {
      await updateNotification(notif.id, { status: 'declined', read: true });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not decline invite');
    } finally {
      setRespondingId(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[typography.h2, { color: colors.textPrimary }]}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable onPress={() => markAllNotificationsRead(user.uid)}>
            <Text style={[typography.caption, { color: colors.primary }]}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
            <Text style={[typography.body, { color: colors.textMuted, marginTop: 10 }]}>
              No notifications yet
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPendingInvite = item.type === 'group_invite' && item.status === 'pending';
          const responding = respondingId === item.id;
          return (
            <Pressable
              onPress={() => handlePress(item)}
              style={[
                styles.notifRow,
                {
                  backgroundColor: item.read ? colors.surface : colors.surfaceAlt,
                  borderRadius: radius.md,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.notifTopRow}>
                <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons
                    name={ICON_MAP[item.type] || ICON_MAP.default}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    {item.body}
                  </Text>
                  {item.type === 'group_invite' && item.status && item.status !== 'pending' && (
                    <Text style={[typography.small, { color: colors.textMuted, marginTop: 2 }]}>
                      {item.status === 'accepted' ? 'You joined this group' : 'Invite declined'}
                    </Text>
                  )}
                </View>
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  {formatRelativeTime(item.createdAt)}
                </Text>
              </View>

              {isPendingInvite && (
                <View style={styles.inviteActions}>
                  {responding ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Pressable
                        onPress={() => handleDeclineInvite(item)}
                        style={[styles.inviteBtn, styles.declineBtn, { borderColor: colors.border, borderRadius: radius.sm }]}
                      >
                        <Text style={[typography.caption, { color: colors.textSecondary, fontWeight: '700' }]}>
                          Decline
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleAcceptInvite(item)}
                        style={[styles.inviteBtn, { backgroundColor: colors.primary, borderRadius: radius.sm }]}
                      >
                        <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '700' }]}>
                          Accept
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  empty: { alignItems: 'center', paddingTop: 80 },
  notifRow: {
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  inviteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  declineBtn: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
});