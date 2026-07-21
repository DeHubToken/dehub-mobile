import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Share,
  Dimensions,
  Image,
  StatusBar,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";
import type { SpaceParticipant, RaiseHandRequest, FloatingReaction } from "../../hooks/useStages";
import { VOICE_EFFECTS } from "../../hooks/useStages";

const { width: SW, height: SH } = Dimensions.get("window");

const REACTIONS = ["👍", "👎", "🔥", "💩", "🚀", "🎉", "🥶", "❤️", "👏"];

// ── FloatingEmoji ──────────────────────────────────────────────────────────

interface FloatingEmojiProps {
  reaction: FloatingReaction;
  onDone: (id: number) => void;
}

const FloatingEmoji: React.FC<FloatingEmojiProps> = ({ reaction, onDone }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const duration = 2000 + Math.random() * 600;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -(SH * 0.45),
        duration,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 100, useNativeDriver: true }),
        Animated.delay(duration - 700),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start(() => onDone(reaction.id));
  }, []);

  return (
    <Animated.Text
      style={{
        position: "absolute",
        bottom: 140,
        left: (reaction.x / 100) * (SW - 40),
        fontSize: 28,
        transform: [{ translateY }, { scale }],
        opacity,
        pointerEvents: "none",
      } as any}
    >
      {reaction.emoji}
    </Animated.Text>
  );
};

// ── SpeakerCard ────────────────────────────────────────────────────────────

interface SpeakerCardProps {
  participant: SpaceParticipant;
  isHost: boolean;
  isSpeaking: boolean;
  onRemove?: (addr: string) => void;
}

const SpeakerCard: React.FC<SpeakerCardProps> = ({ participant, isHost, isSpeaking, onRemove }) => {
  const name = participant.username || `${participant.wallet_address.slice(0, 6)}...`;
  const isParticipantHost = participant.role === "host";
  const speakingAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isSpeaking && !participant.is_muted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(speakingAnim, { toValue: 1.12, duration: 400, useNativeDriver: true }),
          Animated.timing(speakingAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      speakingAnim.stopAnimation();
      speakingAnim.setValue(1);
    }
  }, [isSpeaking, participant.is_muted]);

  return (
    <View style={{ alignItems: "center", width: SW / 3 - 16, marginBottom: 20 }}>
      <Animated.View style={{ transform: [{ scale: speakingAnim }] }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: (isSpeaking && !participant.is_muted) ? 2 : 0,
          borderColor: "#22C55E",
          overflow: "hidden",
        }}
      >
        {participant.avatar ? (
          <Image source={{ uri: participant.avatar }} style={{ width: 64, height: 64 }} />
        ) : (
          <Icon name="User" size={28} color="rgba(255,255,255,0.6)" />
        )}
        {participant.is_muted && (
          <View
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#1f2937",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="MicOff" size={10} color="#9ca3af" />
          </View>
        )}
      </View>
      </Animated.View>
      <Text style={{ color: "#fff", fontSize: 12, marginTop: 6, textAlign: "center" }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
        {isParticipantHost ? "Host" : "Speaker"}
      </Text>
      {isHost && !isParticipantHost && onRemove && (
        <TouchableOpacity
          onPress={() => onRemove(participant.wallet_address)}
          style={{
            marginTop: 4,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: "rgba(239,68,68,0.2)",
          }}
        >
          <Text style={{ color: "#f87171", fontSize: 10 }}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── HandRequestRow ─────────────────────────────────────────────────────────

interface HandRequestRowProps {
  request: RaiseHandRequest;
  onApprove: (addr: string) => void;
}

const HandRequestRow: React.FC<HandRequestRowProps> = ({ request, onApprove }) => {
  const name = request.username || `${request.wallet_address.slice(0, 8)}...`;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 4,
        gap: 10,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {request.avatar ? (
          <Image source={{ uri: request.avatar }} style={{ width: 36, height: 36 }} />
        ) : (
          <Icon name="User" size={16} color="rgba(255,255,255,0.6)" />
        )}
      </View>
      <Text style={{ color: "#fff", flex: 1, fontSize: 13 }} numberOfLines={1}>{name}</Text>
      <TouchableOpacity
        onPress={() => onApprove(request.wallet_address)}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 14,
          backgroundColor: "#22C55E",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Let Speak</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── LiveStageModal ─────────────────────────────────────────────────────────

const LiveStageModal: React.FC = () => {
  const {
    isModalOpen,
    initialModalView,
    currentSpace,
    participants,
    handRequests,
    isMuted,
    myRole,
    hasRaisedHand,
    isConnected,
    isRecording,
    floatingReactions,
    voiceEffect,
    ttsVoices,
    isTtsVoicesLoading,
    isTtsGenerating,
    endSpace,
    leaveSpace,
    toggleMute,
    raiseHand,
    lowerHand,
    approveSpeaker,
    removeSpeaker,
    sendReaction,
    dismissFloatingReaction,
    applyVoiceEffect,
    fetchTtsVoices,
    generateTts,
    closeModal,
  } = useStages();

  const [ttsText, setTtsText] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");

  const spaceTitle = currentSpace?.title ?? "";
  const handleShare = useCallback(() => {
    Share.share({ message: `Join me on DeHub Stages: "${spaceTitle}"`, title: spaceTitle });
  }, [spaceTitle]);

  if (!isModalOpen || initialModalView !== "live" || !currentSpace) return null;

  const isHostRole = myRole === "host";
  const isSpeakerRole = myRole === "speaker";
  const isListenerRole = myRole === "listener";
  const canSpeak = isHostRole || isSpeakerRole;

  const speakers = participants.filter(p => p.role === "host" || p.role === "speaker");
  const listenerCount = participants.filter(p => p.role === "listener").length;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0a0a0f" }}>
        {/* Edge-to-edge Android doesn't resize for the keyboard — without this
            the TTS input at the bottom gets covered while typing. */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {/* Floating reactions overlay */}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} pointerEvents="none">
          {floatingReactions.map(r => (
            <FloatingEmoji key={r.id} reaction={r} onDone={dismissFloatingReaction} />
          ))}
        </View>

        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
              {currentSpace.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3, gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(239,68,68,0.15)",
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  gap: 4,
                }}
              >
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#ef4444" }} />
                <Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "700" }}>LIVE</Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                {speakers.length} speaker{speakers.length !== 1 ? "s" : ""} · {listenerCount} listener{listenerCount !== 1 ? "s" : ""}
              </Text>
              {isRecording && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "rgba(239,68,68,0.15)",
                    paddingHorizontal: 5,
                    paddingVertical: 2,
                    borderRadius: 6,
                    gap: 3,
                  }}
                >
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#ef4444" }} />
                  <Text style={{ color: "#ef4444", fontSize: 10, fontWeight: "700" }}>REC</Text>
                </View>
              )}
              {!isConnected && (
                <Text style={{ color: "#f59e0b", fontSize: 11 }}>Connecting...</Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleShare}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(255,255,255,0.07)",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 8,
            }}
          >
            <Icon name="Share2" size={17} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={closeModal}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(255,255,255,0.07)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="ChevronDown" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 20, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Speakers grid */}
          <Text
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 12,
              marginLeft: 4,
            }}
          >
            On Stage
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {speakers.map(p => (
              <SpeakerCard
                key={p.wallet_address}
                participant={p}
                isHost={isHostRole}
                isSpeaking={false}
                onRemove={isHostRole ? removeSpeaker : undefined}
              />
            ))}
            {speakers.length === 0 && (
              <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginBottom: 16, marginLeft: 4 }}>
                No speakers yet
              </Text>
            )}
          </View>

          {/* Hand raise queue (host only) */}
          {isHostRole && handRequests.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 11,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 8,
                  marginLeft: 4,
                }}
              >
                Raised Hands ({handRequests.length})
              </Text>
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}
              >
                {handRequests.map(r => (
                  <HandRequestRow key={r.id} request={r} onApprove={approveSpeaker} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Reactions bar */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
            paddingVertical: 10,
            paddingHorizontal: 8,
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
            {REACTIONS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                onPress={() => sendReaction(emoji)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                activeOpacity={0.6}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Voice Effects (host/speaker only) */}
        {canSpeak && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingBottom: 8,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.06)",
              paddingTop: 10,
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              🎭 Voice Effect
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
              {VOICE_EFFECTS.map(effect => (
                <TouchableOpacity
                  key={effect.id}
                  onPress={() => applyVoiceEffect(effect.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 20,
                    backgroundColor: voiceEffect === effect.id ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: voiceEffect === effect.id ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>{effect.emoji}</Text>
                  <Text style={{ color: voiceEffect === effect.id ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500" }}>
                    {effect.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* TTS (host/speaker only) */}
        {canSpeak && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingBottom: 10,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.06)",
              paddingTop: 10,
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              🔊 Text-to-Speech
            </Text>
            {/* Voice picker */}
            {isTtsVoicesLoading ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" style={{ marginBottom: 8 }} />
            ) : ttsVoices.length === 0 ? (
              <TouchableOpacity
                onPress={fetchTtsVoices}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
                  backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
                  marginBottom: 8, alignSelf: "flex-start",
                }}
              >
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Load voices</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
                {ttsVoices.map(v => {
                  const label = [v.labels?.descriptive, v.labels?.accent, v.labels?.gender].filter(Boolean).join(" · ");
                  return (
                    <TouchableOpacity
                      key={v.voice_id}
                      onPress={() => setSelectedVoiceId(v.voice_id)}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                        backgroundColor: selectedVoiceId === v.voice_id ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                        borderWidth: 1, borderColor: selectedVoiceId === v.voice_id ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)",
                      }}
                    >
                      <Text style={{ color: selectedVoiceId === v.voice_id ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 12 }}>
                        {v.name}
                      </Text>
                      {label ? <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{label}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {/* Text input + send */}
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={ttsText}
                  onChangeText={t => setTtsText(t.slice(0, 500))}
                  placeholder="Type a message to speak…"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  multiline
                  style={{
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    color: "#fff",
                    fontSize: 13,
                    maxHeight: 80,
                  }}
                />
                <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 2, alignSelf: "flex-end" }}>
                  {ttsText.length}/500
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (ttsVoices.length === 0) { fetchTtsVoices(); return; }
                  const vid = selectedVoiceId || ttsVoices[0]?.voice_id;
                  if (vid) generateTts(ttsText, vid);
                }}
                disabled={isTtsGenerating || !ttsText.trim()}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: ttsText.trim() ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
                  marginBottom: 18,
                }}
              >
                {isTtsGenerating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Icon name="Send" size={18} color={ttsText.trim() ? "#fff" : "rgba(255,255,255,0.3)"} />
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Controls */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingBottom: 24,
            paddingTop: 12,
            gap: 16,
          }}
        >
          {canSpeak && (
            <TouchableOpacity
              onPress={toggleMute}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: isMuted ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                borderWidth: 1,
                borderColor: isMuted ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={isMuted ? "MicOff" : "Mic"} size={22} color={isMuted ? "#f87171" : "#4ade80"} />
            </TouchableOpacity>
          )}

          {isListenerRole && (
            <TouchableOpacity
              onPress={hasRaisedHand ? lowerHand : raiseHand}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: hasRaisedHand ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: hasRaisedHand ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="Hand" size={22} color={hasRaisedHand ? "#fbbf24" : "rgba(255,255,255,0.7)"} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={isHostRole ? endSpace : leaveSpace}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 24,
              height: 56,
              borderRadius: 28,
              backgroundColor: isHostRole ? "#ef4444" : "rgba(239,68,68,0.15)",
              borderWidth: isHostRole ? 0 : 1,
              borderColor: "rgba(239,68,68,0.4)",
            }}
          >
            <Icon name={isHostRole ? "X" : "LogOut"} size={18} color={isHostRole ? "#fff" : "#f87171"} />
            <Text style={{ color: isHostRole ? "#fff" : "#f87171", fontWeight: "600", fontSize: 14 }}>
              {isHostRole ? "End Stage" : "Leave"}
            </Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export default LiveStageModal;
