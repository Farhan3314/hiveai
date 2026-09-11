import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Linking, Image, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export default function MessageBubble({ message, isOwn }) {
  const { colors, typography, radius, spacing } = useTheme();
  const isAI = message.senderId === 'hiveai' || message.type === 'ai';
  const isTyping = message.type === 'ai_typing';
  const [previewVisible, setPreviewVisible] = useState(false);

  if (isTyping) {
    return (
      <View style={[styles.row, styles.rowLeft]}>
        <View style={[styles.bubble, { backgroundColor: colors.bubbleAI, borderRadius: radius.lg }]}>
          <View style={styles.typingRow}>
            <Ionicons name="sparkles" size={14} color={colors.aiAccent} />
            <Text style={[typography.caption, { color: colors.aiAccent, marginLeft: 6 }]}>
              HiveAI is typing
            </Text>
            <ActivityIndicator size="small" color={colors.aiAccent} style={{ marginLeft: 8 }} />
          </View>
        </View>
      </View>
    );
  }

  const bubbleBg = isAI ? colors.bubbleAI : isOwn ? colors.bubbleUser : colors.surfaceAlt;
  const textColor = isAI ? colors.bubbleAIText : isOwn ? colors.bubbleUserText : colors.textPrimary;

  // Attachments are stored as base64 "data:" URIs on the Firestore doc itself
  // (see services/storage.js — Firebase Storage/paid plan was removed).
  // Linking.openURL only works for URL schemes some app on the device has
  // registered a handler for (http, mailto, etc.) — there is no such handler
  // for a raw "data:" URI, so calling it here used to fail silently (or with
  // an unhandled promise rejection) every single time someone tapped a file
  // attachment. Documents can't be usefully "opened" without adding a
  // file-writing/sharing dependency, so we tell the user plainly instead of
  // pretending the tap did something.
  const handleOpenFile = async () => {
    if (!message.fileUrl) return;
    try {
      const canOpen = await Linking.canOpenURL(message.fileUrl);
      if (canOpen) {
        await Linking.openURL(message.fileUrl);
        return;
      }
    } catch (e) {
      // fall through to the friendly message below
    }
    Alert.alert(
      'Preview not available',
      `"${message.fileName || 'This file'}" is stored inside the app and can't be opened by another app from here yet.`
    );
  };

  return (
    <View style={[styles.row, isOwn ? styles.rowRight : styles.rowLeft]}>
      <View style={{ maxWidth: '80%' }}>
        {!isOwn && (
          <Text style={[typography.small, { color: isAI ? colors.aiAccent : colors.textMuted, marginBottom: 4, marginLeft: 4 }]}>
            {message.senderName}
          </Text>
        )}
        <View style={[styles.bubble, { backgroundColor: bubbleBg, borderRadius: radius.lg }]}>
          {isAI && !!message.replyToSenderName && (
            <View
              style={[
                styles.replyToBar,
                { borderLeftColor: colors.aiAccent, marginBottom: 6 },
              ]}
            >
              <Text style={[typography.small, { color: colors.aiAccent }]}>
                Replying to {message.replyToSenderName}
              </Text>
              {!!message.replyToText && (
                <Text style={[typography.small, { color: textColor, opacity: 0.7 }]} numberOfLines={1}>
                  {message.replyToText}
                </Text>
              )}
            </View>
          )}
          {message.type === 'image' ? (
            <>
              <Pressable onPress={() => message.fileUrl && setPreviewVisible(true)}>
                {!!message.fileUrl && (
                  <Image
                    source={{ uri: message.fileUrl }}
                    style={[styles.image, { borderRadius: radius.md }]}
                    resizeMode="cover"
                  />
                )}
                {!!message.text && (
                  <Text style={[typography.body, { color: textColor, marginTop: message.fileUrl ? 8 : 0 }]}>
                    {message.text}
                  </Text>
                )}
              </Pressable>
              {!!message.fileUrl && (
                <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
                  <Pressable style={styles.previewOverlay} onPress={() => setPreviewVisible(false)}>
                    <Image source={{ uri: message.fileUrl }} style={styles.previewImage} resizeMode="contain" />
                    <Pressable style={styles.previewClose} onPress={() => setPreviewVisible(false)} hitSlop={12}>
                      <Ionicons name="close" size={26} color="#fff" />
                    </Pressable>
                  </Pressable>
                </Modal>
              )}
            </>
          ) : message.type === 'file' ? (
            <Pressable onPress={handleOpenFile} style={styles.fileRow}>
              <Ionicons name="document-attach" size={20} color={textColor} />
              <Text style={[typography.body, { color: textColor, marginLeft: 8, flex: 1 }]}>
                {message.fileName || 'Attached file'}
              </Text>
            </Pressable>
          ) : (
            <Text style={[typography.body, { color: textColor }]}>{message.text}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 4, paddingHorizontal: 12 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10 },
  typingRow: { flexDirection: 'row', alignItems: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center' },
  replyToBar: { borderLeftWidth: 2, paddingLeft: 8 },
  image: { width: 220, height: 220 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '80%' },
  previewClose: {
    position: 'absolute',
    top: 50,
    right: 20,
  },
});