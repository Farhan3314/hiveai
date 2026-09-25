import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import MessageBubble from '../../components/MessageBubble';
import { subscribeMessages, sendMessage } from '../../services/messages';
import { uploadChatFile } from '../../services/storage';

export default function GroupChatScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const { groupId, groupName } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // An image/document the user picked but hasn't sent yet — held so they
  // can type a prompt/caption to go along with it before it's uploaded.
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!groupId) return;
    const unsub = subscribeMessages(groupId, setMessages);
    return unsub;
  }, [groupId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    const attachment = pendingAttachment;
    if (sending) return;
    if (!trimmed && !attachment) return;

    setText('');
    setPendingAttachment(null);
    setSending(true);
    try {
      if (attachment) {
        await sendAttachmentMessage(attachment, trimmed);
      } else {
        await sendMessage(groupId, {
          text: trimmed,
          senderId: user.uid,
          senderName: user.name || 'User',
        });
      }
    } catch (e) {
      Alert.alert('Error', e.message);
      // Put back whatever didn't make it out, so the user doesn't lose it.
      if (attachment) setPendingAttachment(attachment);
      if (trimmed) setText(trimmed);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // Uploads the held image/document and sends it — now paired with
  // whatever prompt/caption the user typed while it was on hold, so
  // HiveAI can answer about it correctly instead of just the file itself.
  const sendAttachmentMessage = async (attachment, caption) => {
    if (attachment.kind === 'image') {
      const { url } = await uploadChatFile(groupId, attachment.uri, attachment.name, 'image');
      await sendMessage(groupId, {
        senderId: user.uid,
        senderName: user.name || 'User',
        type: 'image',
        fileUrl: url,
        fileName: attachment.name,
        ...(caption ? { text: caption } : {}),
      });
    } else {
      const { url, fileName } = await uploadChatFile(groupId, attachment.uri, attachment.name);
      await sendMessage(groupId, {
        senderId: user.uid,
        senderName: user.name || 'User',
        type: 'file',
        fileUrl: url,
        fileName,
        ...(caption ? { text: caption } : {}),
      });
      // If the user already typed a prompt, pass it along so FileAnalysis
      // asks it automatically as soon as the document finishes processing.
      navigation.navigate('FileAnalysis', {
        groupId,
        fileName,
        fileUrl: url,
        fileUri: attachment.uri,
        ...(caption ? { initialQuestion: caption } : {}),
      });
    }
  };

  const handleAttach = () => {
    if (sending) return;
    Alert.alert('Attach', 'Send a photo or a document to the group', [
      { text: 'Photo', onPress: handlePickImage },
      { text: 'Document', onPress: handlePickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Picking no longer uploads right away — it just holds the image so the
  // user can type a prompt/caption first, then send both together.
  const handlePickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to share images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      setPendingAttachment({
        kind: 'image',
        uri: asset.uri,
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not pick image');
    }
  };

  // Same idea for documents — hold it, don't upload until send is pressed.
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];

      setPendingAttachment({
        kind: 'document',
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || null,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not pick document');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
            {groupName || 'Group Chat'}
          </Text>
          <Text style={[typography.small, { color: colors.textMuted }]}>
            HiveAI is listening — just chat
          </Text>
        </View>
        <Pressable onPress={() => navigation.navigate('ActionItems', { groupId, groupName })} hitSlop={10} style={{ marginRight: 16 }}>
          <Ionicons name="checkbox-outline" size={22} color={colors.aiAccent} />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ConversationSummary', { groupId, groupName })} hitSlop={10} style={{ marginRight: 16 }}>
          <Ionicons name="sparkles-outline" size={22} color={colors.aiAccent} />
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Members', { groupId, groupName })} hitSlop={10}>
          <Ionicons name="people-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: spacing.md, flexGrow: 1 }}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.senderId === user?.uid} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
                Start the conversation — HiveAI will jump in too!
              </Text>
            </View>
          }
        />

        {!!pendingAttachment && (
          <View
            style={[
              styles.attachmentPreview,
              { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
          >
            {pendingAttachment.kind === 'image' ? (
              <Image source={{ uri: pendingAttachment.uri }} style={[styles.attachmentThumb, { borderRadius: radius.sm }]} />
            ) : (
              <View style={[styles.attachmentThumb, styles.attachmentFileIcon, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
                <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              </View>
            )}
            <Text
              style={[typography.caption, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}
              numberOfLines={1}
            >
              {pendingAttachment.name}
            </Text>
            <Pressable onPress={() => setPendingAttachment(null)} disabled={sending} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, marginBottom: spacing.md }]}>
          <Pressable onPress={handleAttach} disabled={sending} hitSlop={8}>
            <Ionicons name="attach" size={24} color={sending ? colors.textMuted : colors.primary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={pendingAttachment ? 'Add a prompt (optional)...' : 'Type a message...'}
            placeholderTextColor={colors.textMuted}
            multiline
            style={[
              typography.body,
              styles.input,
              { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderRadius: radius.md },
            ]}
          />
          <Pressable
            onPress={handleSend}
            disabled={(!text.trim() && !pendingAttachment) || sending}
            style={[
              styles.sendBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: radius.pill,
                opacity: text.trim() || pendingAttachment ? 1 : 0.5,
              },
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.textOnPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentThumb: { width: 40, height: 40 },
  attachmentFileIcon: { alignItems: 'center', justifyContent: 'center' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    marginHorizontal: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});