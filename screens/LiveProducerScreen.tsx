import React, { useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useNavigation, useRoute } from "@react-navigation/native";
import { useLive } from '../hooks/use-live';
import { useWebSocket } from '../context/WebSocketContext';
import ProducerStatusBar from '../components/LiveProducer/ProducerStatusBar';
import ProducerControlsBar from '../components/LiveProducer/ProducerControlsBar';
import { CameraView, useCameraPermissions } from 'expo-camera';
// NodeMediaCamera removed in WebRTC mode; keeping import commented for potential fallback.
// import NodeMediaCamera from '../components/LiveProducer/NodeMediaCamera';
import WebRTCPublisher from '../components/LiveProducer/WebRTCPublisher';
import { LIVEPEER_WHIP_ENDPOINT } from '../config/constants';
import { ChatMessage } from '../components/LiveProducer/ChatMessageList';
import ExternalStreamingOverlay from '../components/LiveProducer/ExternalStreamingOverlay';
import ChatSidePanel from '../components/LiveProducer/ChatSidePanel';
import MetadataCard from '../components/LiveProducer/MetadataCard';
import StreamDetailsTooltip from '../components/LiveProducer/StreamDetailsTooltip';
import EphemeralMessages from '../components/LiveProducer/EphemeralMessages';
import { useStreamDetails } from '../hooks/useStreamDetails';
import { useEphemeralMessages } from '../hooks/useEphemeralMessages';
import GlassModal from '../components/ui/GlassModal';

type RouteParams = { streamId?: string; tokenId?: number; ingestUrl?: string; streamKey?: string };

const LiveProducerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { streamId, tokenId, ingestUrl, streamKey } = (route.params ||
    {}) as RouteParams;
  const { stage, start, end, bindSocket } = useLive();
  const { on: socketOn } = useWebSocket();
  // Bind socket on() from context directly into live hook
  useEffect(() => {
    bindSocket((evt, handler) => socketOn(evt, handler));
  }, [bindSocket, socketOn]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [hasUnseenChats, setHasUnseenChats] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [externalMode, setExternalMode] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const { streamEntity, streamLoading, streamError, streamKeyValue, streamKeyLoading, streamKeyError } = useStreamDetails(streamId);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const metaCardRef = useRef<View | null>(null);
  const [sourceRect, setSourceRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const uiTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { ephemeral, addEphemeral, fadeAnim } = useEphemeralMessages();
  const [publishStats, setPublishStats] = useState<{ fps?: number; bitrateKbps?: number; dropped?: number }>({});

  const triggerEphemeral = useCallback((msg: ChatMessage) => addEphemeral(msg), [addEphemeral]);

  // (Fetching now handled by useStreamDetails hook)

  // Dummy simulated chat feed (independent of stream fetch)
  useEffect(() => {
    const baseUsers = ["alice", "bob", "charlie", "modJane", "you"];
    const sample = [
      "Hello everyone!",
      "Great stream so far",
      "🔥🔥🔥",
      "Where are you streaming from?",
      "Subscribing now!",
      "This quality is nice.",
      "Can you show setup?",
    ];
    const interval = setInterval(() => {
      setMessages((prev) => {
        const id = (prev.length + 1).toString();
        const user = baseUsers[Math.floor(Math.random() * baseUsers.length)];
        const isOwner = user === "you";
        const isModerator = user.startsWith("mod");
        const msg: ChatMessage = {
          id,
          user,
          message: sample[Math.floor(Math.random() * sample.length)],
          isOwner,
          isModerator,
          createdAt: Date.now(),
        };
        if (!chatVisible && user !== "you") setHasUnseenChats(true);
        if (user !== "you") triggerEphemeral(msg);
        return prev.concat(msg).slice(-200);
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [chatVisible, triggerEphemeral]);

  const onStart = useCallback(() => {
    console.log('[LiveProducer] onStart invoked. Current stage:', stage);
    start()
      .then(() => {
        console.log('[LiveProducer] start() promise resolved. (Stage will likely be starting/live soon)');
        setStartedAt(Date.now());
      })
      .catch((err) => {
        console.log('[LiveProducer] start() promise rejected:', err);
      });
  }, [start, stage]);

  const onEnd = useCallback(() => {
    console.log('[LiveProducer] onEnd invoked. Current stage:', stage);
    end().catch(() => {});
  }, [end, stage]);

  const requestClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const openEndConfirm = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const closeEndConfirm = useCallback(() => setShowEndConfirm(false), []);

  const onSendChat = useCallback(() => {
    if (!input.trim()) return;
    const newMsg: ChatMessage = {
      id: String(Date.now()),
      user: "you",
      message: input.trim(),
      isOwner: true,
      createdAt: Date.now(),
    };
    setMessages((prev) => prev.concat(newMsg));
    triggerEphemeral(newMsg);
    setInput("");
  }, [input, triggerEphemeral]);

  // Gift logic removed (unused) - can be reintroduced via separate modal component

  // camera permission request one-time
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission, requestPermission]);

  const toggleMic = useCallback(() => setMicMuted((m) => !m), []);
  const toggleCamera = useCallback(() => setCameraOff((c) => !c), []);
  const toggleExternal = useCallback(() => {
    setExternalMode((prev) => {
      const next = !prev;
      if (next) {
        setCameraOff(true);
        setMicMuted(true);
      }
      return next;
    });
  }, []);
  const flipCamera = useCallback(() => {
    setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  // Ephemeral messages handled by component

  // reset unseen chats when opening chat
  useEffect(() => {
    if (chatVisible && hasUnseenChats) setHasUnseenChats(false);
  }, [chatVisible, hasUnseenChats]);

  const openDetails = useCallback(() => {
    if (!streamEntity) return;
    if (metaCardRef.current && (metaCardRef.current as any).measureInWindow) {
      (metaCardRef.current as any).measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          setSourceRect({ x, y, width, height });
          setShowDetailsModal(true);
        }
      );
    } else {
      setShowDetailsModal(true);
    }
  }, [streamEntity, streamId, streamKeyValue, streamKeyLoading]);

  const closeDetails = useCallback(() => {
    setShowDetailsModal(false);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  // Auto-dismiss after inactivity (5s) once opened
  useEffect(() => {
    if (showDetailsModal) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        setShowDetailsModal(false);
      }, 3000);
    }
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [showDetailsModal]);

  const registerActivity = useCallback(() => {
    if (!showDetailsModal) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setShowDetailsModal(false);
    }, 3000);
  }, [showDetailsModal]);

  // Copy handlers now internal to tooltip / overlay components

  // positioning now handled inside tooltip component

  // UI inactivity hide (except status bar & ephemeral)
  const bumpUiTimer = useCallback(() => {
    setUiHidden(false);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => {
      setUiHidden(true);
      // close details modal if open
      setShowDetailsModal(false);
    }, 4000);
  }, []);

  useEffect(() => {
    bumpUiTimer();
    return () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); };
  }, [bumpUiTimer]);

  // Debug: log stage transitions
  const prevStageRef = useRef(stage);
  useEffect(() => {
    if (prevStageRef.current !== stage) {
      console.log('[LiveProducer] stage transition:', prevStageRef.current, '->', stage);
      prevStageRef.current = stage;
    }
  }, [stage]);

  // Debug: log when NodeMediaCamera should be active
  const prevCameraActiveRef = useRef<boolean | null>(null);
  const nodeMediaShouldRender = !cameraOff && !externalMode && !!permission?.granted && (stage === 'starting' || stage === 'live' || stage === 'ending');
  useEffect(() => {
    if (prevCameraActiveRef.current !== nodeMediaShouldRender) {
      console.log('[LiveProducer] NodeMediaCamera active condition changed ->', nodeMediaShouldRender, 'stage:', stage, 'cameraOff:', cameraOff, 'externalMode:', externalMode, 'permissionGranted:', permission?.granted);
      prevCameraActiveRef.current = nodeMediaShouldRender;
    }
  }, [nodeMediaShouldRender, stage, cameraOff, externalMode, permission?.granted]);

  // Debug: permission changes
  const prevPermissionRef = useRef(permission?.granted);
  useEffect(() => {
    if (prevPermissionRef.current !== permission?.granted) {
      console.log('[LiveProducer] camera permission changed ->', permission?.granted);
      prevPermissionRef.current = permission?.granted;
    }
  }, [permission?.granted]);

  // Debug: publish stats changes (bitrate/fps/dropped)
  const lastStatsRef = useRef(publishStats);
  useEffect(() => {
    if (publishStats !== lastStatsRef.current) {
      const { fps, bitrateKbps, dropped } = publishStats;
      console.log('[LiveProducer] publish stats update:', { fps, bitrateKbps, dropped });
      lastStatsRef.current = publishStats;
    }
  }, [publishStats]);

  // Debug: details tooltip open/close events
  const prevDetailsVisibleRef = useRef(showDetailsModal);
  useEffect(() => {
    if (prevDetailsVisibleRef.current !== showDetailsModal) {
      console.log('[LiveProducer] stream details tooltip visibility ->', showDetailsModal);
      prevDetailsVisibleRef.current = showDetailsModal;
    }
  }, [showDetailsModal]);

  // Debug: external mode toggles
  const prevExternalModeRef = useRef(externalMode);
  useEffect(() => {
    if (prevExternalModeRef.current !== externalMode) {
      console.log('[LiveProducer] externalMode changed ->', externalMode);
      prevExternalModeRef.current = externalMode;
    }
  }, [externalMode]);

  // Debug: camera facing changes
  const prevFacingRef = useRef(cameraFacing);
  useEffect(() => {
    if (prevFacingRef.current !== cameraFacing) {
      console.log('[LiveProducer] cameraFacing changed ->', cameraFacing);
      prevFacingRef.current = cameraFacing;
    }
  }, [cameraFacing]);

  // Disable swipe/gesture dismiss for this screen
  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: false });
  }, [navigation]);

  const onGlobalPress = useCallback(() => {
    bumpUiTimer();
  }, [bumpUiTimer]);

  return (
    <Pressable onPressIn={onGlobalPress} className="flex-1" android_disableSound>
      <View className="flex-1 bg-black">
      {/* Camera Preview */}
      {!cameraOff && !externalMode && permission?.granted ? (
        stage === 'starting' || stage === 'live' || stage === 'ending' ? (
          <WebRTCPublisher
            whipEndpoint={LIVEPEER_WHIP_ENDPOINT}
            authToken={streamKey || streamKeyValue || ''}
            active={stage === 'starting' || stage === 'live'}
            facing={cameraFacing}
            onStats={(s) => setPublishStats(s)}
            onConnected={() => console.log('[LiveProducer] WebRTC connected')}
            onError={(err) => {
              console.log('[LiveProducer] WebRTCPublisher error:', err);
              setCameraOff(true);
            }}
          />
        ) : (
          <CameraView
            ref={(r) => { cameraRef.current = r; }}
            style={{ flex: 1 }}
            facing={cameraFacing}
          />
        )
      ) : (
        <View className="absolute inset-0 bg-zinc-900 items-center justify-center">
          {externalMode ? (
            <ExternalStreamingOverlay
              streamKeyValue={streamKeyValue}
              streamKeyLoading={streamKeyLoading}
              onExitExternal={() => setExternalMode(false)}
            />
          ) : (
            <>
              {!uiHidden && (
                <Text className="text-zinc-500">
                  {cameraOff ? "Camera Off" : "Requesting Camera..."}
                </Text>
              )}
              {!permission?.granted && !uiHidden && (
                <TouchableOpacity
                  onPress={requestPermission}
                  className="mt-3 px-4 py-2 rounded-full bg-white/10"
                >
                  <Text className="text-white text-xs">Grant Permission</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      <ProducerStatusBar
        stage={stage}
        startTimestamp={startedAt}
  bitrateKbps={publishStats.bitrateKbps || 3200}
        viewers={Math.min(9999, 120 + messages.length)}
        likes={streamEntity?.likes || streamEntity?.likesCount || Math.floor(messages.length / 3)}
        onRequestClose={requestClose}
        onRequestEndConfirmation={openEndConfirm}
      />

      {/* Side chat panel (overlay) */}
      {chatVisible && !uiHidden && (
        <ChatSidePanel
          messages={messages}
            input={input}
            onChangeInput={setInput}
            onSend={onSendChat}
            onClose={() => setChatVisible(false)}
        />
      )}

      {/* Metadata overlay (bottom-left) */}
      {(!uiHidden || externalMode) && (
        <MetadataCard
          ref={metaCardRef}
          loading={streamLoading}
          streamEntity={streamEntity}
          streamId={streamId}
          onPress={openDetails}
        />
      )}

      <StreamDetailsTooltip
        visible={showDetailsModal && !uiHidden}
        sourceRect={sourceRect}
        streamEntity={streamEntity}
        streamKeyValue={streamKeyValue}
        streamKeyLoading={streamKeyLoading}
        streamKeyError={streamKeyError}
        onClose={closeDetails}
        onInteract={registerActivity}
      />

      {!uiHidden && (
      <ProducerControlsBar
        stage={stage}
        onStart={onStart}
        onEnd={onEnd}
        onToggleChat={() => setChatVisible((v) => !v)}
        chatVisible={chatVisible}
        hasUnseenChats={hasUnseenChats}
        micMuted={micMuted}
        cameraOff={cameraOff}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onFlipCamera={flipCamera}
        externalMode={externalMode}
        onToggleExternal={toggleExternal}
      />
      )}

      {/* Close button removed; integrated into status bar as chevron */}
      {/* Users can;t gift themselves
      <GiftModal
        visible={giftModalVisible}
        onClose={() => setGiftModalVisible(false)}
        onSend={handleSendGift}
      /> */}

  <EphemeralMessages
        messages={ephemeral}
        fadeAnim={fadeAnim}
        onPress={() => {
          setChatVisible(true);
          setHasUnseenChats(false);
          bumpUiTimer();
        }}
      />

      <GlassModal
        visible={showEndConfirm}
        onClose={closeEndConfirm}
        backdropScope="full"
      >
        <View className="mx-8 bg-black/60 rounded-2xl p-6 border border-white/10">
          <Text className="text-white font-semibold text-base mb-2">End Stream?</Text>
          <Text className="text-white/70 text-xs leading-5 mb-5">
            Closing now will end your live stream for all viewers. You can continue streaming or end it permanently.
          </Text>
          <View className="flex-row justify-end">
            <TouchableOpacity onPress={closeEndConfirm} className="px-4 h-10 rounded-full items-center justify-center bg-white/10 mr-3" activeOpacity={0.85}>
              <Text className="text-white text-xs font-semibold">Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { closeEndConfirm(); onEnd(); }} className="px-5 h-10 rounded-full items-center justify-center bg-red-600" activeOpacity={0.9}>
              <Text className="text-white text-xs font-semibold">End Stream</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    </View>
    </Pressable>
  );
};

export default LiveProducerScreen;
