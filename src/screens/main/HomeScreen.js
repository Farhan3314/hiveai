import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import FormInput from '../../components/FormInput';
import Avatar from '../../components/Avatar';
import { subscribeUserGroups, createGroup, deleteGroup } from '../../services/groups';
import { subscribeFriends } from '../../services/friends';
import { createNotification } from '../../services/notifications';
import { formatRelativeTime } from '../../utils/user';

function GroupAvatar({ icon, bg }) {
  return (
    <View style={[styles.groupAvatar, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={22} color="#FFFFFF" />
    </View>
  );
}

function GroupRow({ group, colors, typography, onPress, onDelete, canDelete }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.groupRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <GroupAvatar icon={group.icon} bg={group.iconBg} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={styles.groupTopRow}>
          <Text style={[typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={[typography.small, { color: colors.textMuted }]}>
            {formatRelativeTime(group.lastMessageAt)}
          </Text>
        </View>
        <Text
          style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
          numberOfLines={2}
        >
          {group.lastMessage || `${group.membersCount || 0} members`}
        </Text>
      </View>
      {canDelete && (
        <Pressable onPress={onDelete} hitSlop={10} style={{ paddingLeft: 10 }}>
          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

export default function HomeScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [friends, setFriends] = useState([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeUserGroups(user.uid, (data) => {
      setGroups(data);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeFriends(user.uid, setFriends);
    return unsub;
  }, [user?.uid]);

  const toggleFriend = (uid) => {
    setSelectedFriendIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const firstName = (user?.name || 'there').split(' ')[0];

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.trim().toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [query, groups]);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Group name required', 'Please enter a group name.');
      return;
    }
    setCreating(true);
    try {
      const trimmedName = groupName.trim();
      // Only the creator joins immediately — selected friends get a
      // pending invite instead of being added straight away, so they can
      // accept or decline joining from their Notifications screen.
      const id = await createGroup({
        name: trimmedName,
        createdBy: user.uid,
        creatorName: user.name || 'User',
        memberIds: [],
      });

      await Promise.all(
        selectedFriendIds.map((friendUid) =>
          createNotification({
            userId: friendUid,
            type: 'group_invite',
            title: 'Group invite',
            body: `${user.name || 'Someone'} invited you to join "${trimmedName}"`,
            groupId: id,
            groupName: trimmedName,
            inviterUid: user.uid,
            inviterName: user.name || 'Someone',
            status: 'pending',
          })
        )
      );

      setModalVisible(false);
      setGroupName('');
      setSelectedFriendIds([]);
      navigation.navigate('GroupChat', { groupId: id, groupName: trimmedName });
    } catch (e) {
      console.error('[HomeScreen] handleCreateGroup FAILED', { code: e.code, message: e.message });
      Alert.alert('Error', e.message || 'Could not create group');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGroup = (group) => {
    if (group.createdBy !== user.uid) {
      Alert.alert('Not allowed', 'Only the group creator can delete this group.');
      return;
    }
    Alert.alert(
      'Delete group?',
      `This permanently deletes "${group.name}" and all its messages for everyone. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(group.id);
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not delete group');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>
              {greeting}
            </Text>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>
              {user?.name || 'there'}
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
            <Avatar name={user?.name} email={user?.email} photoURL={user?.photoURL} size={45} />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search groups..."
            placeholderTextColor={colors.textMuted}
            style={[typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 8, paddingVertical: 0 }]}
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={[typography.h3, { color: colors.textPrimary }]}>Your Groups</Text>
          <Pressable onPress={() => navigation.navigate('Friends')}>
            <Text style={[typography.caption, { color: colors.primary }]}>See all</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredGroups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                colors={colors}
                typography={typography}
                canDelete={group.createdBy === user.uid}
                onDelete={() => handleDeleteGroup(group)}
                onPress={() => navigation.navigate('GroupChat', { groupId: group.id, groupName: group.name })}
              />
            ))}

            {filteredGroups.length === 0 && (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' }]}>
                {query ? `No groups match "${query}"` : 'No groups yet — create your first one!'}
              </Text>
            )}
          </View>
        )}

        <Button
          title="+ Create New Group"
          onPress={() => setModalVisible(true)}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg, maxHeight: '80%' }]}>
            <Text style={[typography.h3, { color: colors.textPrimary }]}>Create Group</Text>
            <FormInput
              label="Group Name"
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g. React Native Team"
              autoCapitalize="words"
            />

            <Text style={[typography.bodyBold, { color: colors.textPrimary, marginTop: 4, marginBottom: 8 }]}>
              Invite friends {selectedFriendIds.length > 0 ? `(${selectedFriendIds.length} selected)` : '(optional)'}
            </Text>

            {friends.length === 0 ? (
              <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 8 }]}>
                No friends yet — add friends first to invite them to groups.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                {friends.map((friend) => {
                  const selected = selectedFriendIds.includes(friend.uid);
                  return (
                    <Pressable
                      key={friend.uid}
                      onPress={() => toggleFriend(friend.uid)}
                      style={[
                        styles.friendRow,
                        {
                          backgroundColor: selected ? colors.surfaceAlt : 'transparent',
                          borderColor: colors.border,
                          borderRadius: radius.md,
                        },
                      ]}
                    >
                      <Avatar name={friend.name} email={friend.email} photoURL={friend.photoURL} size={36} />
                      <Text
                        style={[typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}
                        numberOfLines={1}
                      >
                        {friend.name}
                      </Text>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? colors.primary : colors.textMuted}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setModalVisible(false);
                  setSelectedFriendIds([]);
                }}
                style={{ flex: 1 }}
              />
              <Button title="Create" onPress={handleCreateGroup} loading={creating} style={{ flex: 1, marginLeft: 10 }} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    height: 46,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  groupTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  modalCard: { padding: 20 },
  modalActions: { flexDirection: 'row', marginTop: 12 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
  },
});