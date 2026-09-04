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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useTheme } from '../../theme/ThemeContext';
import MessageBubble from '../../components/MessageBubble';
import { generateAIReply, generateRAGAnswer, analyzeImageContent } from '../../services/ai';
import { retrieveContext, hasReadyDocuments } from '../../services/rag';
import { incrementAIUsage } from '../../services/users';
import { uploadAIChatFile } from '../../services/storage';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeAIChats,
  createAIChat,
  subscribeAIChatMessages,
  addAIChatMessage,
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
  const [uploading, setUploading] = useState(false);

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

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText('');
    setSending(true);
    setTyping(true);

    try {
      let chatId = activeChatId;
      if (!chatId) {
        chatId = await createAIChat(user.uid, trimmed);
        setActiveChatId(chatId);
      }

      await addAIChatMessage(user.uid, chatId, {
        senderId: user.uid,
        senderName: user.name || 'You',
        type: 'text',
        text: trimmed,
      });

      // If this conversation has documents uploaded to it, answer using
      // retrieved passages (FR-019 / FR-024) instead of a generic reply.
      const scopePath = `users/${user.uid}/aiChats/${chatId}`;
      let reply;
      const usesDocs = await hasReadyDocuments(scopePath).catch(() => false);
      if (usesDocs) {
        const chunks = await retrieveContext({ scopePath, question: trimmed, topK: 4 });
        reply = chunks.length ? await generateRAGAnswer(trimmed, chunks) : await generateAIReply(trimmed);
      } else {
        reply = await generateAIReply(trimmed);
      }
      await incrementAIUsage(user.uid, 1);

      await addAIChatMessage(user.uid, chatId, {
        senderId: 'hiveai',
        senderName: 'HiveAI',
        type: 'ai',
        text: reply,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not send message');
    } finally {
      setSending(false);
      setTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const ensureChatId = async (seedText) => {
    if (activeChatId) return activeChatId;
    const chatId = await createAIChat(user.uid, seedText);
    setActiveChatId(chatId);
    return chatId;
  };

  const handleAttach = () => {
    if (uploading || sending) return;
    Alert.alert('Attach', 'Send a photo or a document to HiveAI', [
      { text: 'Photo', onPress: handlePickImage },
      { text: 'Document', onPress: handlePickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      setUploading(true);
      setTyping(true);
      const chatId = await ensureChatId('Photo');
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const { url } = await uploadAIChatFile(user.uid, chatId, asset.uri, fileName);

      await addAIChatMessage(user.uid, chatId, {
        senderId: user.uid,
        senderName: user.name || 'You',
        type: 'image',
        fileUrl: url,
        fileName,
      });

      const mime = asset.mimeType || 'image/jpeg';
      const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : null;
      const reply = dataUrl
        ? await analyzeImageContent(fileName, dataUrl)
        : 'Sorry, I could not read that image.';
      await incrementAIUsage(user.uid, 1);

      await addAIChatMessage(user.uid, chatId, {
        senderId: 'hiveai',
        senderName: 'HiveAI',
        type: 'ai',
        text: reply,
      });
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not send photo');
    } finally {
      setUploading(false);
      setTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];

      setUploading(true);
      setTyping(true);
      const chatId = await ensureChatId(asset.name);
      const { url, fileName } = await uploadAIChatFile(user.uid, chatId, asset.uri, asset.name);

      await addAIChatMessage(user.uid, chatId, {
        senderId: user.uid,
        senderName: user.name || 'You',
        type: 'file',
        fileUrl: url,
        fileName,
      });

      // Full RAG processing (chunking + embeddings + retrieval) happens on
      // the FileAnalysis screen, which also shows upload/processing status
      // and lets the user ask multiple questions about this specific file.
      navigation.navigate('FileAnalysis', { aiChatId: chatId, fileName, fileUrl: url, fileUri: asset.uri });
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not send document');
    } finally {
      setUploading(false);
      setTyping(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([WELCOME_MESSAGE]);
    setHistoryVisible(false);
  };

  const handleOpenChat = (chat) => {
    setActiveChatId(chat.id);
    setHistoryVisible(false);
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
            <MessageBubble message={item} isOwn={item.senderId === user?.uid} />
          )}
        />

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable onPress={handleAttach} disabled={uploading} hitSlop={8} style={{ marginRight: 6 }}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="attach" size={24} color={colors.primary} />
            )}
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask HiveAI anything..."
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
            disabled={!text.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: colors.primary, borderRadius: radius.pill, opacity: text.trim() ? 1 : 0.5 }]}
          >
            {sending ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.textOnPrimary} />
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