import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Linking,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import ChatModal from '../components/ChatModal';
import StatusOverlay from '../components/StatusOverlay';
import { API_BASE_URL } from '../constants/api';

const CALL_NUMBER = '+278600010111';

export default function HomeScreen() {
  const [textMessage, setTextMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingText, setIsSendingText] = useState(false);
  const [isSendingAudio, setIsSendingAudio] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');
  const [statusVisible, setStatusVisible] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rippleAnim = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0.6)).current;
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const inputFade = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const recordBtnScale = useRef(new Animated.Value(0.8)).current;

  const runEntryAnimation = useCallback(() => {
    headerFade.setValue(0);
    headerSlide.setValue(-20);
    inputFade.setValue(0);
    footerFade.setValue(0);
    recordBtnScale.setValue(0.8);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(recordBtnScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
        Animated.timing(inputFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(footerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    runEntryAnimation();
    startIdlePulse();
  }, []);

  const startIdlePulse = () => {
    pulseAnim.stopAnimation();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  };

  const startRecordingAnimation = () => {
    pulseAnim.stopAnimation();
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(rippleAnim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(rippleAnim, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.96, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopRecordingAnimation = () => {
    rippleAnim.stopAnimation();
    pulseAnim.stopAnimation();
    rippleAnim.setValue(1);
    rippleOpacity.setValue(0);
    startIdlePulse();
  };

  const showStatus = (msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000) => {
    setStatusMsg(msg);
    setStatusType(type);
    setStatusVisible(true);
    setTimeout(() => setStatusVisible(false), duration);
  };

  // Pull-to-refresh: reset form and replay entry animation
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTextMessage('');
    setStatusVisible(false);
    runEntryAnimation();
    startIdlePulse();
    setTimeout(() => setRefreshing(false), 600);
  }, [runEntryAnimation]);

  const handleRecordStart = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        showStatus('Microphone permission denied', 'error');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      startRecordingAnimation();
    } catch (e: any) {
      showStatus(`Recording failed: ${e?.message ?? 'unknown error'}`, 'error');
    }
  };

  const handleRecordStop = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    stopRecordingAnimation();
    setIsSendingAudio(true);
    showStatus('Uploading audio…', 'info');

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error('No recording URI returned');

      // Step 1: upload audio file
      let uploadResult: FileSystem.FileSystemUploadResult;
      try {
        uploadResult = await FileSystem.uploadAsync(
          `${API_BASE_URL}/api/upload-audio`,
          uri,
          {
            fieldName: 'audio',
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          }
        );
      } catch (uploadErr: any) {
        throw new Error(`Upload failed — is the server running? (${uploadErr?.message ?? uploadErr})`);
      }

      if (uploadResult.status !== 200) {
        throw new Error(`Server upload error ${uploadResult.status}: ${uploadResult.body}`);
      }

      const parsed = JSON.parse(uploadResult.body);
      if (!parsed.url) throw new Error(`No URL in response: ${uploadResult.body}`);

      // Step 2: save to DB
      const reportRes = await fetch(`${API_BASE_URL}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'audio', content: parsed.url, is_anonymous: true }),
      });
      if (!reportRes.ok) {
        const body = await reportRes.text();
        throw new Error(`DB save failed ${reportRes.status}: ${body}`);
      }

      showStatus('Audio report submitted anonymously ✓', 'success');
    } catch (e: any) {
      showStatus(e?.message ?? 'Failed to send audio report', 'error', 6000);
    } finally {
      setIsSendingAudio(false);
    }
  };

  const handleSendText = async () => {
    const msg = textMessage.trim();
    if (!msg) return;
    setIsSendingText(true);
    showStatus('Sending report…', 'info');

    try {
      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}/api/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'text', content: msg, is_anonymous: true }),
        });
      } catch (netErr: any) {
        throw new Error(`Cannot reach server — is it running? (${netErr?.message ?? netErr})`);
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Server error ${res.status}: ${body}`);
      }

      setTextMessage('');
      showStatus('Report submitted anonymously ✓', 'success');
    } catch (e: any) {
      showStatus(e?.message ?? 'Failed to send report', 'error', 6000);
    } finally {
      setIsSendingText(false);
    }
  };

  const handleCall = () => {
    Linking.openURL(`tel:${CALL_NUMBER}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#E53E3E"
              colors={['#E53E3E']}
            />
          }
        >
          {/* Header */}
          <Animated.View
            style={[
              styles.header,
              { opacity: headerFade, transform: [{ translateY: headerSlide }] },
            ]}
          >
            <Image source={require('../assets/mira-logo.png')} style={styles.logo} />
            <Text style={styles.title}>Malicious Intent{'\n'}Reporting App</Text>
            <Text style={styles.subtitle}>Report malicious activity anonymously</Text>
          </Animated.View>

          {/* Record Button */}
          <Animated.View
            style={[styles.recordArea, { transform: [{ scale: recordBtnScale }] }]}
          >
            <Animated.View
              style={[
                styles.ripple,
                { transform: [{ scale: rippleAnim }], opacity: rippleOpacity },
              ]}
            />
            <Pressable
              onPressIn={handleRecordStart}
              onPressOut={handleRecordStop}
              disabled={isSendingAudio}
            >
              <Animated.View
                style={[
                  styles.recordBtn,
                  isRecording && styles.recordBtnActive,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <MaterialIcons
                  name={isRecording ? 'stop' : 'mic'}
                  size={64}
                  color="#fff"
                />
              </Animated.View>
            </Pressable>
          </Animated.View>

          <Text style={styles.recordHint}>
            {isRecording
              ? 'Recording… release to send'
              : isSendingAudio
              ? 'Uploading…'
              : 'Tap & hold to record, release to send'}
          </Text>

          {/* Text Input */}
          <Animated.View style={[styles.inputRow, { opacity: inputFade }]}>
            <TextInput
              style={styles.textInput}
              placeholder="Type the message here..."
              placeholderTextColor="#aaa"
              value={textMessage}
              onChangeText={setTextMessage}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={handleSendText}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!textMessage.trim() || isSendingText) && styles.sendBtnDisabled]}
              onPress={handleSendText}
              disabled={!textMessage.trim() || isSendingText}
            >
              <Feather name="send" size={20} color={textMessage.trim() ? '#E53E3E' : '#ccc'} />
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: footerFade }]}>
          <TouchableOpacity style={styles.footerBtn} onPress={handleCall}>
            <View style={styles.footerIconCircle}>
              <Feather name="phone-call" size={26} color="#E53E3E" />
            </View>
            <Text style={styles.footerLabel}>Call</Text>
          </TouchableOpacity>

          <View style={styles.footerDivider} />

          <TouchableOpacity style={styles.footerBtn} onPress={() => setChatVisible(true)}>
            <View style={styles.footerIconCircle}>
              <MaterialIcons name="chat-bubble-outline" size={26} color="#E53E3E" />
            </View>
            <Text style={styles.footerLabel}>Chat</Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>

      <ChatModal visible={chatVisible} onClose={() => setChatVisible(false)} />
      <StatusOverlay visible={statusVisible} message={statusMsg} type={statusType} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 90,
    height: 90,
    resizeMode: 'contain',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111',
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    color: '#2563EB',
    marginTop: 8,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  recordArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: 200,
    height: 200,
  },
  ripple: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#E53E3E',
  },
  recordBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E53E3E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E53E3E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  recordBtnActive: {
    backgroundColor: '#C53030',
    shadowOpacity: 0.6,
  },
  recordHint: {
    fontSize: 15,
    color: '#555',
    marginBottom: 28,
    textAlign: 'center',
    fontWeight: '400',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#F7F7F7',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    paddingHorizontal: 20,
    paddingVertical: 2,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 14,
  },
  sendBtn: {
    padding: 8,
    marginLeft: 4,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  footerBtn: {
    alignItems: 'center',
    gap: 4,
  },
  footerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: {
    fontSize: 12,
    color: '#E53E3E',
    fontWeight: '600',
    marginTop: 2,
  },
  footerDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#F0F0F0',
  },
});
