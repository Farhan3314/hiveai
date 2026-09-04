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
  const [uploading, setUploading] = useState(false);
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
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(groupId, {
        text: trimmed,
        senderId: user.uid,
        senderName: user.name || 'User',
      });
    } catch (e) {
      Alert.alert('Error', e.message);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleAttach = () => {
    if (uploading || sending) return;
    Alert.alert('Attach', 'Send a photo or a document to the group', [
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
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;

      setUploading(true);
      const { url } = await uploadChatFile(groupId, asset.uri, fileName);
      await sendMessage(groupId, {
        text: 'Shared a photo',
        senderId: user.uid,
        senderName: user.name || 'User',
        type: 'image',
        fileUrl: url,
        fileName,
      });
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploading(true);
      const { url, fileName } = await uploadChatFile(groupId, asset.uri, asset.name);
      await sendMessage(groupId, {
        text: `Shared ${fileName}`,
        senderId: user.uid,
        senderName: user.name || 'User',
        type: 'file',
        fileUrl: url,
        fileName,
      });
      navigation.navigate('FileAnalysis', { groupId, fileName, fileUrl: url, fileUri: asset.uri });
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
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

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable onPress={handleAttach} disabled={uploading} hitSlop={8}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="attach" size={24} color={colors.primary} />
            )}
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
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