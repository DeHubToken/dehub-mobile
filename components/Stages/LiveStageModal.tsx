import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Share,
  useWindowDimensions,
  StatusBar,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import SmartImage from "../common/SmartImage";
import { storageImage } from "../../libs/cdnImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TVChatPanel from "../TV/TVChatPanel";
import StageCaptions from "./StageCaptions";
import StageRadioNowPlaying from "./StageRadioNowPlaying";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { useStages } from "../../context/StageContext";
import { useAuth, useAuthActions } from "../../context/AuthContext";
import { storedAvatarSources } from "../../libs/misc";
import type { SpaceParticipant, RaiseHandRequest, FloatingReaction } from "../../hooks/useStages";
import { VOICE_EFFECTS, sameWallet } from "../../hooks/useStages";
import { ShareLinks } from "../../navigation/linking.config";
import StageSoundboard from "./StageSoundboard";
import StageScreenShare from "./StageScreenShare";
import { useBookBoost, useSuperpowers } from "../../hooks/useSuperpowers";
import { toastError, toastSuccess } from "../../libs";
import { useTranslation } from "react-i18next";
import { confirmEndStage } from "./confirmEndStage";
import { useStageReminderFaces } from "../../hooks/useStageReminder";

/**
 * Ceiling for a shared screen inside the sheet. A 16:9 box off the full width
 * is fine held upright, but the same box on a phone turned landscape is taller
 * than the sheet itself and would hand the entire room over to it. Takes the
 * live window height, so it follows rotation, split-screen and folds.
 */
const screenShareMaxH = (windowHeight: number) => Math.round(windowHeight * 0.4);

const REACTIONS = ["👍", "👎", "🔥", "💩", "🚀", "🎉", "🥶", "❤️", "👏"];

// ── FloatingEmoji ──────────────────────────────────────────────────────────

interface FloatingEmojiProps {
  reaction: FloatingReaction;
  onDone: (id: number) => void;
}

const FloatingEmoji: React.FC<FloatingEmojiProps> = ({ reaction, onDone }) => {
  const { width: SW, height: SH } = useWindowDimensions();
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

/** The last emoji someone sent, pinned to their avatar while it floats (web does the same). */
const AvatarReaction: React.FC<{ emoji?: string; size: number }> = ({ emoji, size }) =>
  emoji ? (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#18181B",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  ) : null;

interface SpeakerCardProps {
  participant: SpaceParticipant;
  isHost: boolean;
  isSpeaking: boolean;
  onRemove?: (addr: string) => void;
  reaction?: string;
}

const SpeakerCard: React.FC<SpeakerCardProps> = ({ participant, isHost, isSpeaking, onRemove, reaction }) => {
  const { t } = useTranslation();
  const { width: SW } = useWindowDimensions();
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
          borderRadius: 16,
          backgroundColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: (isSpeaking && !participant.is_muted) ? 2 : 0,
          borderColor: "#F4F4F5",
          overflow: "hidden",
        }}
      >
        {/* Avatar, not a bare <Image>: a raw Image has no error path, so one
            unfetchable avatar — a dead `blob:` row, a transform the device
            refuses, no signal — left an empty circle with nothing in it. This
            falls back to the initial, the same as every other avatar in the
            app, and covers the no-avatar case in the same breath. */}
        <Avatar
          {...storedAvatarSources(participant.avatar, participant.wallet_address, 64)}
          size={64}
          name={participant.username || participant.wallet_address}
        />
        {participant.is_muted && (
          <View
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#383A3D",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="MicOff" size={10} color="#A6A9AC" />
          </View>
        )}
      </View>
      <AvatarReaction emoji={reaction} size={26} />
      </Animated.View>
      <Text style={{ color: "#fff", fontSize: 12, marginTop: 6, textAlign: "center" }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>
        {isParticipantHost ? t("stages.roleHost") : t("stages.roleStageSpeaker")}
      </Text>
      {isHost && !isParticipantHost && onRemove && (
        <TouchableOpacity
          onPress={() => onRemove(participant.wallet_address)}
          style={{
            marginTop: 4,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.2)",
          }}
        >
          <Text style={{ color: "#F4F4F5", fontSize: 10 }}>{t("stages.removeSpeaker")}</Text>
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
  const { t } = useTranslation();
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
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Avatar
          {...storedAvatarSources(request.avatar, request.wallet_address, 36)}
          size={36}
          name={request.username || request.wallet_address}
        />
      </View>
      <Text style={{ color: "#fff", flex: 1, fontSize: 13 }} numberOfLines={1}>{name}</Text>
      <TouchableOpacity
        onPress={() => onApprove(request.wallet_address)}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,0.15)",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{t("stages.inviteToSpeak")}</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── ListenerCard ───────────────────────────────────────────────────────────

/** Listeners shown by face; the rest are a count, the way web does it. */
const LISTENERS_SHOWN = 12;

interface ListenerCardProps {
  participant: SpaceParticipant;
  /** Host only: bring this listener up on stage. */
  onInvite?: (addr: string) => void;
  reaction?: string;
}

const ListenerCard: React.FC<ListenerCardProps> = ({ participant, onInvite, reaction }) => {
  const { t } = useTranslation();
  const { width: SW } = useWindowDimensions();
  const name = participant.username || `${participant.wallet_address.slice(0, 6)}...`;
  return (
    <View style={{ alignItems: "center", width: SW / 3 - 16, marginBottom: 16 }}>
      <View>
        <Avatar
          {...storedAvatarSources(participant.avatar, participant.wallet_address, 48)}
          size={48}
          name={participant.username || participant.wallet_address}
        />
        <AvatarReaction emoji={reaction} size={22} />
      </View>
      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 5, textAlign: "center" }} numberOfLines={1}>
        {name}
      </Text>
      {onInvite && (
        <TouchableOpacity
          onPress={() => onInvite(participant.wallet_address)}
          accessibilityRole="button"
          style={{
            marginTop: 4,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.15)",
          }}
        >
          <Text style={{ color: "#F4F4F5", fontSize: 10 }} numberOfLines={1}>{t("stages.inviteToSpeak")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── LiveStageModal ─────────────────────────────────────────────────────────

const LiveStageModal: React.FC = () => {
  const { t: _copy } = _useCopy();
  const { height: windowHeight } = useWindowDimensions();
  // Insets from the app's root provider. A SafeAreaView inside this
  // statusBarTranslucent full-screen Modal measured 0 on both iPhone and
  // Android, so the title ran under the clock and the status icons.
  const insets = useSafeAreaInsets();
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
    activeSpeakerUids,
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
    inviteSpeaker,
    sendReaction,
    dismissFloatingReaction,
    applyVoiceEffect,
    fetchTtsVoices,
    generateTts,
    closeModal,
    joinSpace,
  } = useStages();
  const { requireAuth } = useAuthActions();
  const { user } = useAuth();
  const myWallet = user?.walletAddress || user?.address || "";

  const [ttsText, setTtsText] = useSurfaceDraft("components/Stages/LiveStageModal.tsx:ttsText", "");
  const [selectedVoiceId, setSelectedVoiceId] = useState("");

  const spaceTitle = currentSpace?.title ?? "";
  const { t } = useTranslation();
  const handleShare = useCallback(() => {
    if (!currentSpace) return;
    // The link is the point. This used to send "Join me on DeHub Stages" and
    // nothing to tap; it is the same link the stage cards share.
    Share.share({
      message: `${t("stages.joinMe", { title: spaceTitle })}\n\n${ShareLinks.stage(currentSpace)}`,
    }).catch(() => {});
  }, [currentSpace, spaceTitle, t]);

  // Front Row is the Blue Whale rung. `status.powers` decides whether this
  // account has it — the badge the client draws from a live wallet read
  // deliberately over-reports, so a local answer would offer a control the
  // server refuses.
  const { data: superpowerStatus } = useSuperpowers();
  // People who set a reminder, shown behind the listeners like web does.
  const { faces: reminderFaces, total: reminderTotal } = useStageReminderFaces(currentSpace?.id);
  const bookFrontRow = useBookBoost();

  if (!isModalOpen || initialModalView !== "live" || !currentSpace) return null;

  const isHostRole = myRole === "host";
  const isSpeakerRole = myRole === "speaker";
  const isListenerRole = myRole === "listener";
  // Connected with no participant row at all — guestListenSpace's signature.
  const isGuest = myRole === null;
  const canFrontRow =
    isHostRole &&
    !!currentSpace?.id &&
    !!superpowerStatus?.powers.some(p => p.key === "front_row" && p.unlocked && p.available) &&
    (superpowerStatus?.boostsLeft ?? 0) > 0;

  const handleFrontRow = () => {
    if (!currentSpace?.id) return;
    bookFrontRow.mutate(
      { tokenId: 0, power: "front_row", stageId: currentSpace.id },
      {
        onSuccess: booking => toastSuccess(t("stages.frontRowBooked", { count: booking.minutes })),
        // The server writes these sentences for a person to read.
        onError: (error: any) => toastError(error?.message || t("stages.frontRowFailed")),
      },
    );
  };

  const canSpeak = isHostRole || isSpeakerRole;

  const speakers = participants.filter(p => p.role === "host" || p.role === "speaker");
  const listeners = participants.filter(p => p.role === "listener");
  // Latest emoji per sender among the ones still floating.
  const avatarReactions: Record<string, string> = {};
  for (const r of floatingReactions) if (r.wallet) avatarReactions[r.wallet] = r.emoji;
  const listenerCount = listeners.length;
  const moreListeners = listenerCount - LISTENERS_SHOWN;
  const inRoom = new Set(participants.map(p => p.wallet_address.toLowerCase()));
  const waitingFaces = reminderFaces.filter(f => !inRoom.has(f.address.toLowerCase()));

  // Who is talking. Agora reports levels by uid, and stages join with uid 0 so
  // the server hands each client a random one: a remote uid cannot be traced
  // back to a person. Two cases are certain anyway: uid 0 is this phone, and
  // when only one other person on stage is unmuted, any remote voice is
  // theirs (a muted mic sends nothing). Otherwise nobody is lit, rather than
  // the wrong person.
  const remoteVoice = activeSpeakerUids.some(uid => uid !== 0);
  const unmutedOthers = speakers.filter(p => !p.is_muted && !sameWallet(p.wallet_address, myWallet));
  const isSpeaking = (p: SpaceParticipant) =>
    sameWallet(p.wallet_address, myWallet)
      ? !isMuted && activeSpeakerUids.includes(0)
      : remoteVoice && unmutedOthers.length === 1 && unmutedOthers[0].wallet_address === p.wallet_address;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      // Without this Android swallowed the hardware/gesture back inside the room.
      onRequestClose={closeModal}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {/* The room is a live surface and always dark. Without dark-surface,
          System Light turned every white label in it to ink on this black
          backdrop, and the whole room went unreadable. */}
      <View
        className="dark-surface"
        style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Host's cover graphic, behind the room.
            Deliberately faint and heavily scrimmed: this is a listening surface
            with avatars, controls and a TTS input stacked over it, and a
            graphic bright enough to admire is one that makes the speaker names
            hard to read. Only rendered when the host set one. */}
        {!!currentSpace.cover_image_url && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <SmartImage
              // A 16:9 cover set to fill the screen's height is this wide.
              source={{ uri: storageImage(currentSpace.cover_image_url, (windowHeight * 16) / 9) }}
              recyclingKey={currentSpace.cover_image_url}
              style={{ width: "100%", height: "100%", opacity: 0.22 }}
              contentFit="cover"
            />
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            />
          </View>
        )}
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
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3, columnGap: 8, rowGap: 4 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.15)",
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  gap: 4,
                }}
              >
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#FAFAFA" }} />
                <Text style={{ color: "#F4F4F5", fontSize: 10, fontWeight: "700" }}>{t("stages.live")}</Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                {t("stages.speakers", { count: speakers.length })} · {t("stages.listeners", { count: listenerCount })}
              </Text>
              {isRecording && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.15)",
                    paddingHorizontal: 5,
                    paddingVertical: 2,
                    borderRadius: 6,
                    gap: 3,
                  }}
                >
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#FAFAFA" }} />
                  <Text style={{ color: "#F4F4F5", fontSize: 10, fontWeight: "700" }}>{_copy("copy.50a45e647dbb", { defaultValue: "REC" })}</Text>
                </View>
              )}
              {!isConnected && (
                <Text style={{ color: "#D4D4D8", fontSize: 11 }}>{t("stages.connecting")}</Text>
              )}
            </View>
          </View>
          {/*
            Front Row — the stage you host takes the top of the stages rail.
            Offered to the host and nobody else, which is also the only account
            the server accepts one from. Here rather than on the SuperPowers
            screen because a stage is a live thing: the moment worth buying the
            top of the rail is while the room is running.
          */}
          {canFrontRow && (
            <TouchableOpacity
              onPress={handleFrontRow}
              disabled={bookFrontRow.isPending}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t("stages.frontRow")}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.07)",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8,
                opacity: bookFrontRow.isPending ? 0.4 : 1,
              }}
            >
              <Icon name="Crown" size={17} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleShare}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t("stages.share")}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
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
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t("stages.minimize")}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.07)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="ChevronDown" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Raised Hands (host only) — pinned right under the header instead of
            living inside the scrollable body below, so a request to speak
            can't sit unnoticed just because the host hasn't scrolled past the
            speaker grid yet. Capped at ~3 rows with its own scroll so a flood
            of requests can't push the reactions bar and controls off-screen. */}
        {isHostRole && handRequests.length > 0 && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingTop: 10,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.06)",
            }}
          >
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
              {t("stages.raisedHands", { count: handRequests.length })}
            </Text>
            <ScrollView
              style={{ maxHeight: 3 * 52 }}
              contentContainerStyle={{
                backgroundColor: "rgba(255,255,255,0.04)",
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
              showsVerticalScrollIndicator={false}
            >
              {handRequests.map(r => (
                <HandRequestRow key={r.id} request={r} onApprove={approveSpeaker} />
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 20, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* A screen the host is sharing from the web app. Renders nothing
              when nobody is — this app can watch a share but never send one. */}
          <StageScreenShare
            sharerName={currentSpace.host_username}
            maxHeight={screenShareMaxH(windowHeight)}
          />

          {/* What the host is airing on the room's radio (set from web). */}
          <StageRadioNowPlaying spaceId={currentSpace.id} />

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
            {t("stages.onStage")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {speakers.map(p => (
              <SpeakerCard
                key={p.wallet_address}
                participant={p}
                isHost={isHostRole}
                isSpeaking={isSpeaking(p)}
                onRemove={isHostRole ? removeSpeaker : undefined}
                reaction={avatarReactions[p.wallet_address.toLowerCase()]}
              />
            ))}
            {speakers.length === 0 && (
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 16, marginLeft: 4 }}>
                {t("stages.noSpeakers")}
              </Text>
            )}
          </View>

          {/* Listeners. A host had no way to see who was in the room, or to
              bring anyone up who had not raised a hand; web shows both. */}
          {(listeners.length > 0 || waitingFaces.length > 0) && (
            <>
              <Text
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 11,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginTop: 4,
                  marginBottom: 12,
                  marginLeft: 4,
                }}
              >
                {t("stages.listeners", { count: listeners.length })}
                {reminderTotal > 0 ? ` · ${t("events.goingCount", { count: reminderTotal })}` : ""}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {listeners.slice(0, LISTENERS_SHOWN).map(p => (
                  <ListenerCard
                    key={p.wallet_address}
                    participant={p}
                    onInvite={isHostRole ? inviteSpeaker : undefined}
                    reaction={avatarReactions[p.wallet_address.toLowerCase()]}
                  />
                ))}
              </View>
              {moreListeners > 0 && (
                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginLeft: 4 }}>
                  +{moreListeners}
                </Text>
              )}
              {/* Reminder holders who haven't arrived: dimmed, with a bell, so
                  the room never claims they can hear it. */}
              {waitingFaces.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, opacity: 0.45 }}>
                  {waitingFaces.map(face => (
                    <View key={face.address} style={{ alignItems: "center", width: "33.33%", marginBottom: 16 }}>
                      <View>
                        <Avatar {...storedAvatarSources(face.avatarUrl, face.address, 48)} size={48} name={face.username || face.address} />
                        <View style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#27272A", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="Bell" size={10} color="#D4D4D8" />
                        </View>
                      </View>
                      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 5 }} numberOfLines={1}>
                        {face.username || `${face.address.slice(0, 6)}...`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Live subtitles, right above the chat and controls as on web. */}
        <StageCaptions
          spaceId={currentSpace.id}
          speakerWallets={[currentSpace.host_wallet_address, ...speakers.map(p => p.wallet_address)]}
        />

        {/* The audience's own channel, as on web: a listener can say something
            without asking for the mic. Same table as web's StageChat, so
            messages cross both ways. A fixed share of the screen so the
            speakers above keep their place as the conversation runs on; the
            keyboard squeezes the speaker list, not the chat. */}
        <View
          style={{
            height: Math.max(180, Math.round(windowHeight * 0.28)),
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
          }}
        >
          <TVChatPanel
            channelId={currentSpace.id}
            room={{
              table: "stage_chat_messages",
              column: "space_id",
              id: currentSpace.id,
              hostWallet: currentSpace.host_wallet_address,
            }}
            onClosePlayer={closeModal}
            transparent
          />
        </View>

        {/* Reactions slider — fade masks on both edges hint that it scrolls,
            since a flat row of circles otherwise reads as a fixed toolbar
            that happens to clip rather than an intentionally swipeable strip. */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
            paddingVertical: 10,
          }}
        >
          <View style={{ position: "relative" }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              decelerationRate="fast"
              snapToInterval={48}
            >
              {REACTIONS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => sendReaction(emoji)}
                  hitSlop={4}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
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
            <LinearGradient
              colors={["#000", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 20 }}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["transparent", "#000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 20 }}
              pointerEvents="none"
            />
          </View>
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
              {t("stages.voiceEffect")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
              {VOICE_EFFECTS.map(effect => (
                <TouchableOpacity
                  key={effect.id}
                  onPress={() => applyVoiceEffect(effect.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
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

        {/* Soundboard (host/speaker only) — clips ride the same channel
            injection TTS uses, so listeners hear them even while muted. */}
        {canSpeak && <StageSoundboard />}

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
              {t("stages.textToSpeech")}
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
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{t("stages.loadVoices")}</Text>
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
                  placeholder={t("stages.ttsPlaceholder")}
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
                  width: 44, height: 44, borderRadius: 12,
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

        {/* Controls. Wraps so a long guest sign-in label drops above Leave
            instead of pushing both buttons off the screen edges. */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
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
              accessibilityRole="button"
              accessibilityLabel={isMuted ? t("live.unmuteMic") : t("live.muteMic")}
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                // Both states were the same key with a different glyph, so
                // nothing at a glance said whether the room could hear you.
                // Muted is now red, as on web; live keeps the theme's control
                // material. Any grey here is repainted with that material
                // (libs/jsx/controls.js), so the difference has to be a colour.
                backgroundColor: isMuted ? "rgba(239,68,68,0.85)" : "rgba(255,255,255,0.15)",
                borderWidth: 1,
                borderColor: isMuted ? "rgba(239,68,68,0.95)" : "rgba(255,255,255,0.35)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={isMuted ? "MicOff" : "Mic"} size={22} color="#F4F4F5" />
            </TouchableOpacity>
          )}

          {isGuest && (
            <TouchableOpacity
              onPress={() => requireAuth(() => { void joinSpace(currentSpace.id); })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 20,
                minHeight: 56,
                flexShrink: 1,
                borderRadius: 16,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Icon name="LogIn" size={18} color="rgba(255,255,255,0.85)" />
              <Text
                numberOfLines={2}
                style={{ color: "rgba(255,255,255,0.85)", fontWeight: "600", fontSize: 14, flexShrink: 1, textAlign: "center" }}
              >
                {t("stages.signInToJoin")}
              </Text>
            </TouchableOpacity>
          )}

          {isListenerRole && (
            <TouchableOpacity
              onPress={hasRaisedHand ? lowerHand : raiseHand}
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: hasRaisedHand ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: hasRaisedHand ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="Hand" size={22} color={hasRaisedHand ? "#D4D4D8" : "rgba(255,255,255,0.7)"} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={isHostRole ? () => confirmEndStage(t, spaceTitle, endSpace) : leaveSpace}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 24,
              height: 56,
              borderRadius: 16,
              backgroundColor: isHostRole ? "#F4F4F5" : "rgba(255,255,255,0.15)",
              borderWidth: isHostRole ? 0 : 1,
              borderColor: "rgba(255,255,255,0.4)",
            }}
          >
            <Icon name={isHostRole ? "X" : "LogOut"} size={18} color={isHostRole ? "#09090B" : "#F4F4F5"} />
            <Text style={{ color: isHostRole ? "#09090B" : "#F4F4F5", fontWeight: "600", fontSize: 14 }}>
              {isHostRole ? t("stages.endStage") : t("stages.leaveStage")}
            </Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export default LiveStageModal;
