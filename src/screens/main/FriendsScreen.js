import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/Button';
import FormInput from '../../components/FormInput';
import Avatar from '../../components/Avatar';
import {
  subscribeFriendRequests,
  subscribeSentRequests,
  subscribeFriends,
  acceptFriendRequest,
  rejectFriendRequest,
  sendFriendRequest,
} from '../../services/friends';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'requests', label: 'Requests' },
  { key: 'sent', label: 'Sent' },
];

function FriendRow({ friend, mode, colors, typography, radius, onAccept, onReject, busy }) {
  return (
    <View style={[styles.friendRow, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
      <Avatar name={friend.name} email={friend.email} photoURL={friend.photoURL} size={46} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
          {friend.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
          {friend.email}
        </Text>
      </View>

      {mode === 'requests' && (
        busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => onReject?.(friend)}
              hitSlop={8}
              style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => onAccept?.(friend)}
              hitSlop={8}
              style={[styles.iconBtn, { backgroundColor: colors.primary, borderRadius: radius.pill, marginLeft: 8 }]}
            >
              <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        )
      )}

      {mode === 'sent' && (
        <View style={[styles.pendingPill, { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill }]}>
          <Text style={[typography.small, { color: colors.textMuted }]}>Pending</Text>
        </View>
      )}

      {mode === 'all' && <View style={[styles.onlineDot, { backgroundColor: colors.online }]} />}
    </View>
  );
}

export default function FriendsScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [requests, setRequests] = useState([]);
  const [sent, setSent] = useState([]);
  const [friends, setFriends] = useState([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const u1 = subscribeFriendRequests(user.uid, setRequests);
    const u2 = subscribeSentRequests(user.uid, setSent);
    const u3 = subscribeFriends(user.uid, setFriends);
    return () => { u1(); u2(); u3(); };
  }, [user?.uid]);

  const listForTab = useMemo(() => {
    const base = activeTab === 'requests' ? requests : activeTab === 'sent' ? sent : friends;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (f) => f.name?.toLowerCase().includes(q) || f.email?.toLowerCase().includes(q)
    );
  }, [activeTab, requests, friends, sent, search]);

  const handleAccept = async (request) => {
    setBusyId(request.id);
    try {
      await acceptFriendRequest(request);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (request) => {
    setBusyId(request.id);
    try {
      await rejectFriendRequest(request.id);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSendRequest = async () => {
    if (!email.trim()) return;
    setSending(true);
    const result = await sendFriendRequest(user, email);
    setSending(false);
    if (result.success) {
      setModalVisible(false);
      setEmail('');
      Alert.alert('Sent!', 'Your friend request has been sent.');
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const emptyLabel =
    activeTab === 'requests' ? 'No new friend requests' : activeTab === 'sent' ? 'No sent requests' : 'No friends yet';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[typography.h2, { color: colors.textPrimary, flex: 1 }]}>Friends</Text>
        {requests.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.danger || '#FF5C7C' }]}>
            <Text style={styles.badgeText}>{requests.length}</Text>
          </View>
        )}
        <Pressable onPress={() => setModalVisible(true)} hitSlop={10} style={{ marginLeft: 12 }}>
          <Ionicons name="person-add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search friends..."
            placeholderTextColor={colors.textMuted}
            style={[typography.body, { color: colors.textPrimary, flex: 1, marginLeft: 8, paddingVertical: 0 }]}
          />
        </View>

        <View style={[styles.tabsRow, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            const count = tab.key === 'requests' ? requests.length : tab.key === 'sent' ? sent.length : friends.length;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, { borderRadius: radius.sm }, active && { backgroundColor: colors.primary }]}
              >
                <Text style={[typography.bodyBold, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>
                  {tab.label}{count > 0 ? ` (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {listForTab.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={[typography.body, { color: colors.textMuted, marginTop: 10 }]}>
              {search ? `No matches for "${search}"` : emptyLabel}
            </Text>
          </View>
        ) : (
          listForTab.map((friend) => (
            <FriendRow
              key={friend.id}
              friend={friend}
              mode={activeTab}
              colors={colors}
              typography={typography}
              radius={radius}
              onAccept={handleAccept}
              onReject={handleReject}
              busy={busyId === friend.id}
            />
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>Add Friend</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 12 }]}>
              Enter their registered email address
            </Text>
            <FormInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="friend@example.com"
              keyboardType="email-address"
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="outline" onPress={() => setModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Send" onPress={handleSendRequest} loading={sending} style={{ flex: 1, marginLeft: 10 }} />
            </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    height: 44,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  tabsRow: { flexDirection: 'row', marginTop: 12, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pendingPill: { paddingHorizontal: 10, paddingVertical: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  modalCard: { padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalActions: { flexDirection: 'row', marginTop: 8 },
});
