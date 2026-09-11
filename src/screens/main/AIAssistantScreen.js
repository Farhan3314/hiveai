import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useTheme } from '../../theme/ThemeContext';
import MessageBubble from '../../components/MessageBubble';
import { generateAIReply, generateRAGAnswer, analyzeImageContent, aiLimitReachedMessage } from '../../services/ai';
import { retrieveContext, hasReadyDocuments } from '../../services/rag';
import { incrementAIUsage, checkAIUsageLimit } from '../../services/users';
import { logAIUsage } from '../../services/usageTracking';
import { uploadAIChatFile } from '../../services/storage';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeAIChats,
  createAIChat,
  subscribeAIChatMessages,
  addAIChatMessage,
  updateAIChatMessage,
  deleteAIChatMessages,
  deleteAIChat,
} from '../../services/aiChats';
import { formatRelativeTime } from '../../utils/user';

const WELCOME_MESSAGE = {
  id: 'welcome',
  senderId: 'hiveai',
  senderName: 'HiveAI',
  type: 'ai',
  text: "Hello! I'm HiveAI — your AI teammate. Ask me anything!",
};

export default function AIAssistantScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();

  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);

  const [chats, setChats] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // An image/document the user picked but hasn't sent yet — held so they
  // can type a prompt/caption to go along with it before it's uploaded.
  const [pendingAttachment, setPendingAttachment] = useState(null);
  // The message currently being edited (null when composing a new message).
  const [editingMessageId, setEditingMessageId] = useState(null);

  const listRef = useRef(null);

  // List of previous conversations (for the history modal)
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeAIChats(user.uid, setChats);
    return unsub;
  }, [user?.uid]);

  // Messages of whichever conversation is currently open
  useEffect(() => {
    if (!user?.uid || !activeChatId) return;
    const unsub = subscribeAIChatMessages(user.uid, activeChatId, (data) => {
      setMessages(data.length ? data : [WELCOME_MESSAGE]);
    });
    return unsub;
  }, [user?.uid, activeChatId]);

  const displayMessages = useMemo(
    () =>
      typing
        ? [...messages, { id: 'typing', senderId: 'hiveai', senderName: 'HiveAI', type: 'ai_typing', text: '' }]
        : messages,
    [messages, typing]
  );

  // Runs the actual AI reply generation + saves it — shared by a normal
  // send and by re-generating a reply after a message gets edited.
  const generateAndSendReply = async (chatId, trimmed) => {
    // Check the plan limit BEFORE spending a real AI call — mirrors the
    // same guard in group chat (services/messages.js).
    const { allowed, plan, limit } = await checkAIUsageLimit(user.uid).catch(() => ({ allowed: true }));

    let reply;
    let sources = [];
    if (!allowed) {
      reply = aiLimitReachedMessage(plan, limit);
    } else {
      // If this conversation has documents uploaded to it, answer using
      // retrieved passages (FR-019 / FR-024) instead of a generic reply.
      const scopePath = `users/${user.uid}/aiChats/${chatId}`;
      const usesDocs = await hasReadyDocuments(scopePath).catch(() => false);
      // Give the assistant short-term memory of this conversation
      // (README Phase 5) instead of answering each message in isolation.
      const history = messages
        .filter((m) => m.id !== 'welcome' && m.text && m.text.trim())
        .slice(-8)
        .map((m) => ({ senderId: m.senderId, senderName: m.senderName, text: m.text }));

      if (usesDocs) {
        const chunks = await retrieveContext({ scopePath, question: trimmed, topK: 4 });
        if (chunks.length) {
          const result = await generateRAGAnswer(trimmed, chunks);
          reply = result.text;
          sources = result.sources;
        } else {
          reply = await generateAIReply(trimmed, null, history);
        }
      } else {
        reply = await generateAIReply(trimmed, null, history);
      }
      await incrementAIUsage(user.uid, 1);
      await logAIUsage({
        userId: user.uid,
        chatId,
        category: 'ai_assistant',
        model: 'ai-assistant',
        inputText: trimmed,
        outputText: reply,
        subscriptionPlan: plan,
      });
    }

    await addAIChatMessage(user.uid, chatId, {
      senderId: 'hiveai',
      senderName: 'HiveAI',
      type: 'ai',
      text: reply,
      ...(sources.length ? { sources } : {}),
    });
  };

  const sendTextMessage = async (chatId, trimmed) => {
    await addAIChatMessage(user.uid, chatId, {
      senderId: user.uid,
      senderName: user.name || 'You',
      type: 'text',
      text: trimmed,
    });
    await generateAndSendReply(chatId, trimmed);
  };

  // Uploads the held image/document and sends it — now paired with
  // whatever prompt/caption the user typed while it was on hold.
  const sendAttachmentMessage = async (chatId, attachment, caption) => {
    if (attachment.kind === 'image') {
      const { url, base64 } = await uploadAIChatFile(user.uid, chatId, attachment.uri, attachment.name, 'image');

      await addAIChatMessage(user.uid, chatId, {
        senderId: user.uid,
        senderName: user.name || 'You',
        type: 'image',
        fileUrl: url,
        fileName: attachment.name,
        ...(caption ? { text: caption } : {}),
      });

      const { allowed, plan, limit } = await checkAIUsageLimit(user.uid).catch(() => ({ allowed: true }));
      let reply;
      if (!allowed) {
        reply = aiLimitReachedMessage(plan, limit);
      } else {
        // Reuse the same compressed image we just uploaded (url is already
        // a "data:image/jpeg;base64,..." URI) instead of the original,
        // uncompressed picker output — keeps this fast and avoids sending
        // a multi-MB payload to the vision API.
        const dataUrl = base64 ? url : null;
        reply = dataUrl
          ? await analyzeImageContent(attachment.name, dataUrl, caption)
          : 'Sorry, I could not read that image.';
        await incrementAIUsage(user.uid, 1);
        await logAIUsage({
          userId: user.uid,
          chatId,
          category: 'image_analysis',
          model: 'gpt-4o-mini',
          inputText: caption || attachment.name,
          outputText: reply,
          subscriptionPlan: plan,
        });
      }

      await addAIChatMessage(user.uid, chatId, {
        senderId: 'hiveai',
        senderName: 'HiveAI',
        type: 'ai',
        text: reply,
      });
    } else {
      const { url, fileName } = await uploadAIChatFile(user.uid, chatId, attachment.uri, attachment.name, 'document');

      await addAIChatMessage(user.uid, chatId, {
        senderId: user.uid,
        senderName: user.name || 'You',
        type: 'file',
        fileUrl: url,
        fileName,
        ...(caption ? { text: caption } : {}),
      });

      // Full RAG processing (chunking + embeddings + retrieval) happens on
      // the FileAnalysis screen, which also shows upload/processing status.
      // If the user already typed a prompt, pass it along so that screen
      // asks it automatically as soon as the document is ready.
      navigation.navigate('FileAnalysis', {
        aiChatId: chatId,
        fileName,
        fileUrl: url,
        fileUri: attachment.uri,
        ...(caption ? { initialQuestion: caption } : {}),
      });
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    const attachment = pendingAttachment;
    if (sending) return;

    if (editingMessageId) {
      if (!trimmed) return;
      return handleSaveEdit(editingMessageId, trimmed);
    }

    if (!trimmed && !attachment) return;

    setText('');
    setPendingAttachment(null);
    setSending(true);
    setTyping(true);

    try {
      let chatId = activeChatId;
      if (!chatId) {
        chatId = await createAIChat(user.uid, trimmed || attachment?.name || 'New chat');
        setActiveChatId(chatId);
      }

      if (attachment) {
        await sendAttachmentMessage(chatId, attachment, trimmed);
      } else {
        await sendTextMessage(chatId, trimmed);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not send message');
    } finally {
      setSending(false);
      setTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // Long-press → Edit on one of your own text bubbles (see MessageBubble)
  // drops its text into the input bar for editing instead of sending fresh.
  const handleEditMessage = (message) => {
    if (sending) return;
    setPendingAttachment(null);
    setEditingMessageId(message.id);
    setText(message.text || '');
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setText('');
  };

  // Saving an edit updates the message in place, wipes out everything that
  // came after it (the old AI reply no longer matches the edited text), and
  // regenerates a fresh reply — matching how editing works in most AI chat
  // apps, instead of leaving a stale/mismatched answer sitting below it.
  const handleSaveEdit = async (messageId, trimmed) => {
    const chatId = activeChatId;
    if (!chatId) return;

    setText('');
    setEditingMessageId(null);
    setSending(true);
    setTyping(true);

    try {
      const idx = messages.findIndex((m) => m.id === messageId);
      const staleIds =
        idx >= 0
          ? messages.slice(idx + 1).filter((m) => m.id !== 'welcome' && m.id !== 'typing').map((m) => m.id)
          : [];

      await updateAIChatMessage(user.uid, chatId, messageId, { text: trimmed, edited: true });
      if (staleIds.length) {
        await deleteAIChatMessages(user.uid, chatId, staleIds);
      }
      await generateAndSendReply(chatId, trimmed);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save your edit');
    } finally {
      setSending(false);
      setTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleAttach = () => {
    if (sending) return;
    Alert.alert('Attach', 'Send a photo or a document to HiveAI', [
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

      // Actual resize/compression (needed to reliably fit under
      // MAX_FILE_BYTES and to keep the vision API payload small) happens at
      // send time in uploadAIChatFile — see storage.js:compressChatImage.
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

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([WELCOME_MESSAGE]);
    setHistoryVisible(false);
    setPendingAttachment(null);
    setEditingMessageId(null);
    setText('');
  };

  const handleOpenChat = (chat) => {
    setActiveChatId(chat.id);
    setHistoryVisible(false);
    setPendingAttachment(null);
    setEditingMessageId(null);
    setText('');
  };

  const handleDeleteChat = (chat) => {
    Alert.alert('Delete chat?', `Delete "${chat.title || 'this chat'}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(chat.id);
          try {
            await deleteAIChat(user.uid, chat.id);
            if (activeChatId === chat.id) handleNewChat();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not delete chat');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={24} color={colors.aiAccent} />
        <Text style={[typography.h3, { color: colors.textPrimary, marginLeft: 10, flex: 1 }]}>
          AI Assistant
        </Text>
        <Pressable onPress={() => setHistoryVisible(true)} hitSlop={10} style={{ marginRight: 18 }}>
          <Ionicons name="time-outline" size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={handleNewChat} hitSlop={10}>
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <FlatList
          ref={listRef}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: spacing.md, flexGrow: 1 }}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.senderId === user?.uid} onEdit={handleEditMessage} />
          )}
        />

        {!!editingMessageId && (
          <View
            style={[
              styles.attachmentPreview,
              { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
          >
            <Ionicons name="pencil" size={18} color={colors.primary} />
            <Text style={[typography.caption, { color: colors.textPrimary, flex: 1, marginLeft: 10 }]}>
              Editing message
            </Text>
            <Pressable onPress={handleCancelEdit} disabled={sending} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

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

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable onPress={handleAttach} disabled={sending || !!editingMessageId} hitSlop={8} style={{ marginRight: 6 }}>
            <Ionicons name="attach" size={24} color={sending || editingMessageId ? colors.textMuted : colors.primary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              editingMessageId
                ? 'Edit your message...'
                : pendingAttachment
                ? 'Add a prompt (optional)...'
                : 'Ask HiveAI anything...'
            }
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
              <Ionicons name={editingMessageId ? 'checkmark' : 'send'} size={18} color={colors.textOnPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={historyVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={[typography.h3, { color: colors.textPrimary }]}>Chat History</Text>
              <Pressable onPress={() => setHistoryVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              onPress={handleNewChat}
              style={[styles.newChatRow, { borderColor: colors.primary, borderRadius: radius.md }]}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={[typography.bodyBold, { color: colors.primary, marginLeft: 6 }]}>New Chat</Text>
            </Pressable>

            {chats.length === 0 ? (
              <Text style={[typography.caption, { color: colors.textMuted, paddingVertical: 16, textAlign: 'center' }]}>
                No previous chats yet.
              </Text>
            ) : (
              <FlatList
                data={chats}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 320 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.chatRow,
                      {
                        backgroundColor: item.id === activeChatId ? colors.surfaceAlt : 'transparent',
                        borderColor: colors.border,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Pressable onPress={() => handleOpenChat(item)} style={{ flex: 1 }}>
                      <Text style={[typography.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.title || 'New chat'}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                        {item.lastMessage ? `${item.lastMessage} · ` : ''}
                        {formatRelativeTime(item.updatedAt)}
                      </Text>
                    </Pressable>
                    {deletingId === item.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Pressable onPress={() => handleDeleteChat(item)} hitSlop={10} style={{ paddingLeft: 10 }}>
                        <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                )}
              />
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
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentThumb: { width: 40, height: 40 },
  attachmentFileIcon: { alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    marginRight: 8,
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
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
  modalCard: { padding: 20, maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingVertical: 10,
    marginBottom: 12,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
});