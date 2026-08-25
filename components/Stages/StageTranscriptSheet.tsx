import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  StyleSheet,
  Image,
} from "react-native";
import { supabase } from "../../services/supabase";
import { useAuth } from "../../context/AuthContext";
import { toastSuccess, toastError, toastInfo } from "../../libs/toast";
import { copyToClipboard } from "../../libs/clipboard.utils";
import Icon from "../ui/Icon";
import Dropdown from "../ui/Dropdown";
import GlassModal from "../ui/GlassModal";
import StageRecordingPlayer from "./StageRecordingPlayer";
import { seekStageRecordingToTime, useStagePlayback } from "../../libs/stage-playback";
import type { AudioSpace, StageTranscript, Segment, Chapter, SpeakerMapEntry, SpeakerOverride } from "../../hooks/useStages";

interface Props {
  space: AudioSpace | null;
  visible: boolean;
  onClose: () => void;
}

const LANGUAGES = [
  { label: "Original Language", value: "original" },
  { label: "English", value: "en" },
  { label: "Español (Spanish)", value: "es" },
  { label: "Français (French)", value: "fr" },
  { label: "Deutsch (German)", value: "de" },
  { label: "Português (Portuguese)", value: "pt" },
  { label: "Italiano (Italian)", value: "it" },
  { label: "日本語 (Japanese)", value: "ja" },
  { label: "한국어 (Korean)", value: "ko" },
  { label: "中文 (Chinese)", value: "zh" },
  { label: "العربية (Arabic)", value: "ar" },
  { label: "हिन्दी (Hindi)", value: "hi" },
  { label: "Русский (Russian)", value: "ru" },
  { label: "Türkçe (Turkish)", value: "tr" },
  { label: "Bahasa Indonesia", value: "id" },
];

const PRIVACY_OPTIONS = [
  { label: "👁️ Public", value: "public" },
  { label: "👥 Members", value: "members" },
  { label: "🔒 Private", value: "private" },
];

const SPEAKER_COLORS = [
  "text-zinc-100",
  "text-zinc-200",
  "text-zinc-300",
  "text-zinc-400",
  "text-zinc-100",
  "text-zinc-300",
];

const formatTimestamp = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatTxt = (segments: Segment[], getSpeakerLabel: (spk: string) => string): string => {
  return segments
    .map((s) => `[${formatTimestamp(s.start)}] ${getSpeakerLabel(s.speaker)}: ${s.text}`)
    .join("\n");
};

const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const q = query.trim().toLowerCase();
  if (!q) return <Text className="text-white/90 text-sm leading-relaxed">{text}</Text>;

  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <Text className="text-white/90 text-sm leading-relaxed">
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === q;
        return (
          <Text
            key={i}
            className={isMatch ? "bg-white/20 text-white font-semibold rounded px-0.5" : ""}
            style={isMatch ? { backgroundColor: "rgba(255,255,255,0.22)" } : undefined}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
};

export const StageTranscriptSheet: React.FC<Props> = ({ space, visible, onClose }) => {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress || user?.address || "";

  // Playback is the shared engine's (libs/stage-playback), the same one behind
  // the Recorded list and the stage card in the feed. This sheet used to run a
  // second player of its own, so opening it stopped whatever the list was
  // playing and started the same file again from zero.
  const playback = useStagePlayback();
  const isThisLoaded = !!space && playback.spaceId === space.id;
  const playheadSec = isThisLoaded ? playback.position : 0;

  // Transcript state
  const [transcript, setTranscript] = useState<StageTranscript | null>(null);
  const [isTranscriptLoading, setIsTranscriptLoading] = useState(false);
  const [isRequestingTranscribe, setIsRequestingTranscribe] = useState(false);
  const [hasRetriedLegacy, setHasRetriedLegacy] = useState(false);

  // Translation state
  const [language, setLanguage] = useState("original");
  const [translation, setTranslation] = useState<{
    status: "processing" | "ready" | "failed";
    segments: Segment[];
    summary: string | null;
    chapters: Chapter[];
    error: string | null;
  } | null>(null);
  const [isTranslationLoading, setIsTranslationLoading] = useState(false);

  // UI filters & editing states
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingSpeaker, setRenamingSpeaker] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const stageId = space?.id;
  // The translation cache keys on the transcript row, not the stage — one
  // store now serves stages and videos alike.
  const transcriptId = (transcript as any)?.id ?? null;
  const isHost =
    !!walletAddress &&
    !!space?.host_wallet_address &&
    walletAddress.toLowerCase() === space.host_wallet_address.toLowerCase();

  // Load transcription status
  const fetchTranscript = useCallback(async () => {
    if (!stageId) return;
    setIsTranscriptLoading(true);
    try {
      // Stage and video transcripts share one table now. The columns are
      // aliased back to the names this sheet has always used, so only the
      // query moved.
      const { data, error } = await supabase
        .from("transcripts")
        .select(
          "id, stage_id:source_ref, status, source_language:source_lang, full_text, segments, " +
            "speaker_map, speaker_overrides, summary, chapters, summary_status, " +
            "privacy:visibility, attempts, error",
        )
        .eq("source_kind", "stage")
        .eq("source_ref", stageId)
        .maybeSingle();

      if (error) throw error;
      setTranscript(data as StageTranscript | null);
    } catch (e) {
      console.warn("Failed to fetch transcript", e);
    } finally {
      setIsTranscriptLoading(false);
    }
  }, [stageId]);

  // Load translation cache
  const fetchTranslation = useCallback(async () => {
    if (!transcriptId || language === "original") {
      setTranslation(null);
      return;
    }
    setIsTranslationLoading(true);
    try {
      const { data, error } = await supabase
        .from("transcript_translations")
        .select("status, segments, summary, chapters, error")
        .eq("transcript_id", transcriptId)
        .eq("language", language)
        .maybeSingle();

      if (error) throw error;
      setTranslation(data as any);
    } catch (e) {
      console.warn("Failed to fetch translation", e);
    } finally {
      setIsTranslationLoading(false);
    }
  }, [transcriptId, language]);

  // Handle requesting translation edge function
  const triggerTranslation = useCallback(async () => {
    if (!transcriptId || language === "original" || transcript?.status !== "ready") return;
    if (translation?.status === "ready" || translation?.status === "processing") return;

    try {
      // A language somebody already asked for — on any client — is a row read
      // from the shared cache rather than a second bill.
      await supabase.functions.invoke("translate-transcript", {
        body: { transcriptId, lang: language },
      });
      // Refetch after invoking
      fetchTranslation();
    } catch (e) {
      console.warn("Translate function invoke failed", e);
    }
  }, [transcriptId, language, transcript?.status, translation, fetchTranslation]);

  // Request transcription trigger
  const handleTranscribe = useCallback(async (silent = false, force = false) => {
    if (!stageId) return;
    setIsRequestingTranscribe(true);
    try {
      const { error } = await supabase.functions.invoke("transcribe", {
        body: { kind: "stage", ref: stageId, action: "start", force },
      });
      if (error) throw error;
      if (!silent) toastSuccess("Transcribing — this may take a moment");
      fetchTranscript();
    } catch (e) {
      if (!silent) toastError(e, "Failed to start transcription");
    } finally {
      setIsRequestingTranscribe(false);
    }
  }, [stageId, fetchTranscript]);

  /**
   * A chapter or a transcript line is a timestamp, so tapping one jumps there —
   * starting the recording if it was not already the one loaded. Recordings
   * whose container carries no index cannot be seeked at all (see
   * libs/stage-playback); the lines stay tappable and simply start playback,
   * because refusing the tap outright reads as a dead transcript.
   */
  const seekTo = useCallback(
    (seconds: number) => {
      if (!space) return;
      seekStageRecordingToTime(space, seconds);
    },
    [space],
  );

  // Closing the sheet resets what belongs to the sheet. Playback is no longer
  // one of those things: a recording carried out to the corner player keeps
  // going, and StageRecordingPlayer's own unmount stops one that was not.
  useEffect(() => {
    if (!visible) {
      setTranscript(null);
      setTranslation(null);
      setLanguage("original");
      setSearchQuery("");
      setRenamingSpeaker(null);
      setHasRetriedLegacy(false);
    } else {
      fetchTranscript();
    }
  }, [visible, space?.recording_url, fetchTranscript]);

  // Realtime subscriptions
  useEffect(() => {
    if (!visible || !stageId) return;

    const transcriptChan = supabase
      .channel(`mobile-stage-transcript-${stageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transcripts",
          filter: `source_ref=eq.${stageId}`,
        },
        () => {
          fetchTranscript();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transcript_translations",
          filter: `transcript_id=eq.${transcriptId ?? stageId}`,
        },
        () => {
          fetchTranslation();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(transcriptChan);
    };
  }, [visible, stageId, fetchTranscript, fetchTranslation]);

  // Trigger translation when selection changes
  useEffect(() => {
    if (language !== "original" && visible) {
      fetchTranslation();
    }
  }, [language, visible, fetchTranslation]);

  useEffect(() => {
    if (language !== "original" && translation === undefined) {
      triggerTranslation();
    }
  }, [language, translation, triggerTranslation]);

  // Auto-transcribe legacy or missing transcripts
  useEffect(() => {
    if (!visible || !stageId || !space?.recording_url || isTranscriptLoading) return;
    if (transcript === null) {
      handleTranscribe(true, false);
      return;
    }
    if (transcript && transcript.status === "failed") {
      handleTranscribe(true, false);
      return;
    }
    // Retry if speakers mapping is missing
    const hasMap = transcript.speaker_map && Object.keys(transcript.speaker_map).length > 0;
    if (transcript.status === "ready" && !hasMap && !hasRetriedLegacy) {
      setHasRetriedLegacy(true);
      handleTranscribe(true, true);
    }
  }, [visible, stageId, transcript, space?.recording_url, isTranscriptLoading, hasRetriedLegacy, handleTranscribe]);

  // Derived variables
  const status = transcript?.status || "pending";
  const useTranslated = language !== "original" && translation?.status === "ready";
  const segments: Segment[] = useTranslated
    ? translation!.segments
    : transcript?.segments || [];
  const summary: string | null = useTranslated ? translation!.summary : transcript?.summary || null;
  const chapters: Chapter[] = useTranslated ? translation!.chapters || [] : transcript?.chapters || [];
  const overrides = transcript?.speaker_overrides || {};

  const fallbackSpeakerMap = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((s) => {
      if (!map.has(s.speaker)) {
        map.set(s.speaker, map.size);
      }
    });
    return map;
  }, [segments]);

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, searchQuery]);

  const getSpeakerLabel = useCallback(
    (speakerId: string): string => {
      const ov = overrides[speakerId];
      if (ov?.username) return `@${ov.username}`;
      const entry = transcript?.speaker_map?.[speakerId];
      if (entry?.type === "ai") return entry.label || "AI Voice";
      if (entry?.type === "user" && entry.wallet) {
        return `${entry.wallet.slice(0, 6)}…${entry.wallet.slice(-4)}`;
      }
      const idx = fallbackSpeakerMap.get(speakerId) ?? 0;
      return `Speaker ${idx + 1}`;
    },
    [overrides, transcript?.speaker_map, fallbackSpeakerMap]
  );

  const activeSegmentIndex = useMemo(() => {
    if (!isThisLoaded) return -1;
    return segments.findIndex(
      (s) => playheadSec >= s.start && playheadSec < (s.end || s.start + 2),
    );
  }, [segments, playheadSec, isThisLoaded]);

  // Actions
  const handleCopy = () => {
    const formatted = formatTxt(segments, getSpeakerLabel);
    copyToClipboard(formatted);
    toastSuccess("Transcript copied to clipboard");
  };

  const handleShare = () => {
    const url = `https://dehub.io/stages/${stageId}`;
    Share.share({
      message: `Check out this Stage transcript: "${space?.title || "Audio Stage"}"\n\nLink: ${url}`,
      title: space?.title || "Audio Stage Transcript",
    });
  };

  const handleQuote = (segmentText: string, speakerLabel: string) => {
    const quote = `> "${segmentText}"\n— ${speakerLabel} on Stage: "${space?.title || "Audio Space"}"`;
    copyToClipboard(quote);
    toastSuccess("Quote copied! Paste it in the composer.");
  };

  // Host operations
  const setPrivacy = async (next: "public" | "members" | "private") => {
    if (!stageId) return;
    const { error } = await supabase
      .from("transcripts")
      .update({ visibility: next })
      .eq("source_kind", "stage")
      .eq("source_ref", stageId);

    if (error) {
      toastError(error, "Could not update privacy");
    } else {
      toastSuccess(`Transcript privacy set to ${next}`);
      fetchTranscript();
    }
  };

  const saveRename = async () => {
    if (!renamingSpeaker || !transcript) return;
    const username = renameText.trim().replace(/^@/, "");
    const nextOverrides = { ...overrides };
    if (username) {
      nextOverrides[renamingSpeaker] = { username };
    } else {
      delete nextOverrides[renamingSpeaker];
    }

    const { error } = await supabase
      .from("transcripts")
      .update({ speaker_overrides: nextOverrides as any })
      .eq("source_kind", "stage")
      .eq("source_ref", stageId!);

    if (error) {
      toastError(error, "Could not save label");
    } else {
      toastSuccess("Speaker renamed successfully");
      setRenamingSpeaker(null);
      fetchTranscript();
    }
  };

  const openRenamePrompt = (speakerId: string) => {
    setRenamingSpeaker(speakerId);
    setRenameText(overrides[speakerId]?.username || "");
  };

  if (!visible) return null;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="90%">
      <View className="flex-1 w-full rounded-t-3xl p-4 relative">
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-white/10 pb-3 mb-3">
          <View className="flex-row items-center gap-2">
            <Icon name="FileText" size={20} color="#D4D4D8" />
            <View>
              <Text className="text-white font-bold text-base" numberOfLines={1}>
                Transcript
              </Text>
              {space?.title && (
                <Text className="text-theme-neutrals-400 text-xs" numberOfLines={1}>
                  {space.title}
                </Text>
              )}
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {isHost && transcript && (
              <View className="w-28 mr-1">
                <Dropdown
                  options={PRIVACY_OPTIONS}
                  value={transcript.privacy}
                  onChange={(val) => setPrivacy(val as any)}
                />
              </View>
            )}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="X" size={16} color="#A6A9AC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Loading / Status overlay */}
        {isTranscriptLoading && !transcript ? (
          <View className="flex-1 items-center justify-center py-20 gap-3">
            <ActivityIndicator size="large" color="#D4D4D8" />
            <Text className="text-theme-neutrals-400 text-sm">Loading transcript...</Text>
          </View>
        ) : !space?.recording_url ? (
          <View className="flex-1 items-center justify-center py-20 gap-3">
            <Icon name="FileText" size={40} color="rgba(255,255,255,0.2)" />
            <Text className="text-theme-neutrals-400 text-sm">No audio recording available</Text>
          </View>
        ) : status === "pending" || status === "processing" ? (
          <View className="flex-1 items-center justify-center py-20 gap-3">
            <ActivityIndicator size="large" color="#D4D4D8" />
            <Text className="text-white font-semibold">Generating AI Transcript</Text>
            <Text className="text-theme-neutrals-400 text-xs text-center px-6">
              This process may take a minute depending on the length of the stage recording.
            </Text>
          </View>
        ) : status === "failed" ? (
          <View className="flex-1 items-center justify-center py-20 gap-4">
            <Icon name="RefreshCw" size={32} color="#EF4444" />
            <Text className="text-theme-neutrals-400 text-sm">Transcription failed</Text>
            {transcript?.error && <Text className="text-red-400 text-xs px-6 text-center">{transcript.error}</Text>}
            <TouchableOpacity
              onPress={() => handleTranscribe(false, true)}
              disabled={isRequestingTranscribe}
              className="px-4 py-2 bg-white/10 rounded-xl border border-white/15 flex-row items-center gap-2"
            >
              {isRequestingTranscribe ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white text-xs font-semibold">Retry Transcription</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View className="flex-1">
            {/* The same player as the Recorded list and the feed card, on the
                same audio — opening this sheet over a playing recording now
                picks it up where it is instead of restarting it. */}
            {!!space && (
              <View className="mb-3">
                <StageRecordingPlayer
                  spaceId={space.id}
                  recordingUrl={space.recording_url}
                  title={space.title}
                  startedAt={space.started_at}
                  endedAt={space.ended_at}
                />
              </View>
            )}

            {/* AI Summary and chapters panel */}
            {(summary || chapters.length > 0 || transcript?.summary_status === "processing") && (
              <View className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3 gap-2">
                <View className="flex-row items-center gap-2">
                  <Icon name="Sparkles" size={13} color="#D4D4D8" />
                  <Text className="text-purple-300 font-bold text-xs uppercase tracking-wider">AI Summary</Text>
                  {transcript?.summary_status === "processing" && (
                    <Text className="text-[10px] text-zinc-400 font-medium italic">generating summary...</Text>
                  )}
                </View>
                {summary ? (
                  <Text className="text-white/80 text-xs leading-relaxed">{summary}</Text>
                ) : null}
                {chapters.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2 mt-1">
                    {chapters.map((chapter, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => seekTo(chapter.start)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 flex-row items-center mr-2"
                      >
                        <Text className="text-purple-300 font-mono text-[10px] mr-1.5">
                          {formatTimestamp(chapter.start)}
                        </Text>
                        <Text className="text-white text-[11px] font-medium">{chapter.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            )}

            {/* Toolbar: Search & Language & Actions */}
            <View className="flex-row items-center gap-2 mb-3">
              {/* Search bar */}
              <View className="flex-1 flex-row items-center bg-white/5 border border-white/10 rounded-xl h-10 px-2.5">
                <Icon name="Search" size={14} color="#A6A9AC" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search transcript..."
                  placeholderTextColor="#8B8D90"
                  className="flex-1 ml-2 text-white text-xs"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Icon name="X" size={12} color="#A6A9AC" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Language Selector */}
              <View className="w-36">
                <Dropdown
                  options={LANGUAGES}
                  value={language}
                  onChange={setLanguage}
                  placeholder="Language"
                />
              </View>

              {/* Toolbar Buttons */}
              <TouchableOpacity
                onPress={handleCopy}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center"
              >
                <Icon name="Copy" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShare}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center"
              >
                <Icon name="Share2" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Loading/Error for Translation */}
            {language !== "original" && translation?.status === "processing" && (
              <View className="flex-row items-center gap-2 mb-2 ml-1">
                <ActivityIndicator size="small" color="#D4D4D8" />
                <Text className="text-xs text-purple-300 italic">Translating transcript...</Text>
              </View>
            )}
            {language !== "original" && translation?.status === "failed" && (
              <Text className="text-xs text-red-400 mb-2 ml-1">Translation failed. Try another language.</Text>
            )}

            {/* Transcript scrollable segments list */}
            <ScrollView className="flex-1 pr-1" showsVerticalScrollIndicator={true}>
              {transcript?.source_language && language === "original" && (
                <Text className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2 ml-1">
                  Detected language: {transcript.source_language}
                </Text>
              )}
              {filteredSegments.length > 0 ? (
                filteredSegments.map((segment, i) => {
                  const speakerLabel = getSpeakerLabel(segment.speaker);
                  const isSegmentActive = i === activeSegmentIndex;
                  const colorIdx = fallbackSpeakerMap.get(segment.speaker) ?? 0;
                  const textColClass = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length];

                  return (
                    <View
                      key={i}
                      className={`border rounded-xl p-3 mb-2 transition ${
                        isSegmentActive
                          ? "bg-zinc-800/50 border-purple-500/40"
                          : "bg-zinc-900/20 border-zinc-900/40"
                      }`}
                      style={
                        isSegmentActive
                          ? { backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.3)" }
                          : { backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.05)" }
                      }
                    >
                      {/* Segment Header */}
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2 flex-1">
                          <View className="w-5 h-5 rounded-full bg-white/10 items-center justify-center">
                            <Icon name="User" size={11} color="#D4D4D8" />
                          </View>
                          <Text
                            className={`text-xs font-bold ${textColClass} flex-1`}
                            numberOfLines={1}
                          >
                            {speakerLabel}
                          </Text>
                          {isHost && transcript?.speaker_map?.[segment.speaker]?.type !== "ai" && (
                            <TouchableOpacity
                              onPress={() => openRenamePrompt(segment.speaker)}
                              className="p-1 rounded bg-white/10 mr-1"
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="Pencil" size={10} color="#A6A9AC" />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View className="flex-row items-center gap-2">
                          <TouchableOpacity
                            onPress={() => handleQuote(segment.text, speakerLabel)}
                            className="p-1 rounded bg-white/10"
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text className="text-[10px] text-purple-300 font-semibold px-1">Quote</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => seekTo(segment.start)}
                            className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5"
                          >
                            <Text className="text-theme-neutrals-400 text-[10px] font-mono font-medium">
                              {formatTimestamp(segment.start)}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Segment Text */}
                      <HighlightText text={segment.text} query={searchQuery} />
                    </View>
                  );
                })
              ) : (
                <View className="py-12 items-center justify-center">
                  <Text className="text-zinc-400 text-sm">
                    {searchQuery ? "No matching segments" : "No transcript segments found"}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Rename Speaker Overlay Popover */}
        {renamingSpeaker && (
          <View
            style={StyleSheet.absoluteFillObject}
            className="bg-black/70 items-center justify-center p-4 z-50 rounded-xl"
          >
            <View
              className="border border-white/10 rounded-xl p-4 w-full max-w-xs shadow-2xl"
              style={{ backgroundColor: "#0C0C0E" }}
            >
              <Text className="text-white font-bold text-sm mb-1">Rename Speaker</Text>
              <Text className="text-theme-neutrals-400 text-[11px] mb-3">
                Change speaker label globally across this transcript.
              </Text>
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Enter speaker name or handle"
                placeholderTextColor="#8B8D90"
                className="bg-black/50 border border-white/10 rounded-xl h-10 px-3 text-white text-xs mb-4"
                autoFocus
              />
              <View className="flex-row justify-end gap-2">
                <TouchableOpacity
                  onPress={() => setRenamingSpeaker(null)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15"
                >
                  <Text className="text-white text-xs font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveRename}
                  className="px-4 py-2 rounded-xl bg-purple-600"
                >
                  <Text className="text-white text-xs font-semibold">Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </GlassModal>
  );
};
