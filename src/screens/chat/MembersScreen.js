import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { subscribeGroup, removeMemberFromGroup, leaveGroup } from '../../services/groups';
import { subscribeFriends } from '../../services/friends';
import { createNotification } from '../../services/notifications';
import Avatar from '../../components/Avatar';

export default function MembersScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const { groupId, groupName } = route.params || {};

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState([]);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [addingUid, setAddingUid] = useState(null);
  const [removingUid, setRemovingUid] = useState(null);

  const isAdmin = !!user?.uid && group?.createdBy === user.uid;

  useEffect(() => {
    if (!groupId) return;
    const unsub = subscribeGroup(groupId, setGroup);
    return unsub;
  }, [groupId]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeFriends(user.uid, setFriends);
    return unsub;
  }, [user?.uid]);

  const invitableFriends = useMemo(
    () => friends.filter((f) => !group?.memberIds?.includes(f.uid)),
    [friends, group?.memberIds]
  );

  const handleInvite = async (friend) => {
    if (!group) return;
    setAddingUid(friend.uid);
    try {
      // Don't add them to the group directly — send a pending invite
      // notification instead, so they can choose to accept or decline
      // joining from their Notifications screen.
      await createNotification({
        userId: friend.uid,
        type: 'group_invite',
        title: 'Group invite',
        body: `${user.name || 'Someone'} invited you to join "${groupName || group.name}"`,
        groupId,
        groupName: groupName || group.name,
        inviterUid: user.uid,
        inviterName: user.name || 'Someone',
        status: 'pending',
      });
      Alert.alert('Invite sent', `${friend.name} will be asked to join the group.`);
    } catch (e) {
      console.error('[MembersScreen] handleInvite FAILED', { code: e.code, message: e.message });
      Alert.alert('Error', e.message || 'Could not send invite');
    } finally {
      setAddingUid(null);
    }
  };

  const handleRemove = (member) => {
    if (!group) return;
    Alert.alert(
      'Remove member',
      `Remove ${member.name} from "${groupName || group.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingUid(member.uid);
            try {
              await removeMemberFromGroup(groupId, member.uid, group.membersCount);
              await createNotification({
                userId: member.uid,
                type: 'group_remove',
                title: 'Removed from a group',
                body: `${user.name || 'Someone'} removed you from "${groupName || group.name}"`,
                groupId,
                groupName: groupName || group.name,
              });
            } catch (e) {
              console.error('[MembersScreen] handleRemove FAILED', { code: e.code, message: e.message });
              Alert.alert('Error', e.message || 'Could not remove member');
            } finally {
              setRemovingUid(null);
            }
          },
        },
      ]
    );
  };

  const handleLeave = () => {
    if (!group) return;
    Alert.alert('Leave group', `Leave "${groupName || group.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(groupId, user.uid, group.membersCount);
            // Let the group admin know someone left. Previously nothing
            // notified anyone on leave (unlike add/remove/invite, which all
            // already create a notification) — now it's consistent.
            if (group.createdBy && group.createdBy !== user.uid) {
              await createNotification({
                userId: group.createdBy,
                type: 'group_member_left',
                title: 'Member left the group',
                body: `${user.name || 'Someone'} left "${groupName || group.name}"`,
                groupId,
                groupName: groupName || group.name,
              });
            }
            navigation.goBack();
          } catch (e) {
            console.error('[MembersScreen] handleLeave FAILED', { code: e.code, message: e.message });
            Alert.alert('Error', e.message || 'Could not leave group');
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (!group?.memberIds?.length) {
      setLoading(false);
      return;
    }
    (async () => {
      const snaps = await Promise.all(
        group.memberIds.map(async (uid) => {
          const snap = await getDoc(doc(db, 'users', uid));
          // Always trust the doc ID for uid, not whatever's (or isn't)
          // stored inside the document — some older docs never got a
          // `uid` field written, which left it undefined here and broke
          // the list's `key` prop below.
          if (snap.exists()) return { ...snap.data(), uid };
          return { uid, name: 'Member', email: '' };
        })
      );
      const seen = new Set();
      const uniqueSnaps = snaps.filter((m) => {
        if (!m || seen.has(m.uid)) return false;
        seen.add(m.uid);
        return true;
      });
      setMembers([
        { uid: 'hiveai', name: 'HiveAI', email: 'ai@hiveai.app', isAI: true },
        ...uniqueSnaps,
      ]);
      setLoading(false);
    })();
  }, [group?.memberIds]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[typography.h3, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
          Members
        </Text>
        <Pressable onPress={() => setInviteVisible(true)} hitSlop={10}>
          <Ionicons name="person-add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <Text style={[typography.caption, { color: colors.textMuted, paddingHorizontal: spacing.lg, marginBottom: spacing.md }]}>
        {groupName} · {group?.membersCount || members.length} members
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
          {members.map((member) => (
            <View
              key={member.uid}
              style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 8 }]}
            >
              {member.isAI ? (
                <View style={[styles.aiAvatar, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="sparkles" size={20} color={colors.aiAccent} />
                </View>
              ) : (
                <Avatar name={member.name} email={member.email} photoURL={member.photoURL} size={44} />
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                  {member.name}
                  {member.isAI && (
                    <Text style={{ color: colors.aiAccent }}> · AI Teammate</Text>
                  )}
                </Text>
                {!!member.email && (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{member.email}</Text>
                )}
              </View>
              {!member.isAI && member.uid !== group?.createdBy && (
                <View style={[styles.onlineDot, { backgroundColor: colors.online, marginRight: isAdmin ? 10 : 0 }]} />
              )}
              {isAdmin && !member.isAI && member.uid !== user.uid && (
                removingUid === member.uid ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Pressable onPress={() => handleRemove(member)} hitSlop={8}>
                    <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
                  </Pressable>
                )
              )}
            </View>
          ))}

          {!isAdmin && (
            <Pressable
              onPress={handleLeave}
              style={[styles.row, styles.leaveRow, { backgroundColor: colors.surface, borderRadius: radius.md, marginTop: 4 }]}
            >
              <Ionicons name="exit-outline" size={20} color={colors.danger} />
              <Text style={[typography.bodyBold, { color: colors.danger, marginLeft: 12 }]}>
                Leave Group
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      <Modal visible={inviteVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>Invite Member</Text>
              <Pressable onPress={() => setInviteVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {invitableFriends.length === 0 ? (
              <Text style={[typography.caption, { color: colors.textMuted, paddingVertical: 12 }]}>
                {friends.length === 0
                  ? 'Add friends first, then invite them to this group.'
                  : 'All your friends are already in this group.'}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {invitableFriends.map((friend) => (
                  <View
                    key={friend.uid}
                    style={[styles.inviteRow, { borderColor: colors.border, borderRadius: radius.md }]}
                  >
                    <Avatar name={friend.name} email={friend.email} photoURL={friend.photoURL} size={36} />
                    <Text
                      style={[typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}
                      numberOfLines={1}
                    >
                      {friend.name}
                    </Text>
                    {addingUid === friend.uid ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Pressable
                        onPress={() => handleInvite(friend)}
                        style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: radius.sm }]}
                      >
                        <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '700' }]}>
                          Invite
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  row: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  aiAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  leaveRow: { justifyContent: 'center', marginBottom: 24 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  modalCard: { padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});