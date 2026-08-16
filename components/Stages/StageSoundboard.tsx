/**
 * StageSoundboard — host/speaker soundboard for Stages, ported from web's
 * StageSoundboard.
 *
 * Every clip is injected into the Agora channel (see `playSoundEffect` in
 * useStages) rather than played locally, so listeners hear it even while the
 * host is muted — a phone has no speaker loopback to fall back on.
 *
 * Two deliberate differences from web:
 *
 * - Only the file-backed effects are here. Web has four more (buzzer, ding,
 *   boo, countdown) synthesised live through Web Audio oscillators, which has
 *   no React Native equivalent; the remaining twelve are real files and are
 *   the ones anyone actually presses.
 * - The pads are a horizontal strip rather than web's grid, matching the
 *   reaction and voice-effect strips this sits beside in the live room.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import Icon from "../ui/Icon";
import { supabase } from "../../services/supabase";
import { useStages } from "../../context/StageContext";
import { useAuth } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs";
import { createLogger } from "../../libs/logger";
import { WEBSITE_LINK } from "../../config/links";

const log = createLogger("StageSoundboard");

interface BuiltInSound {
  id: string;
  label: string;
  emoji: string;
  file: string;
}

/**
 * Filenames must track web's AUDIO_FILE_EFFECTS map — these are fetched
 * straight from the web origin's public dir, so a rename there breaks them
 * here.
 */
const BUILT_IN_SOUNDS: BuiltInSound[] = [
  { id: "airhorn", label: "Air Horn", emoji: "📣", file: "airhorn.wav" },
  { id: "applause", label: "Applause", emoji: "🎉", file: "applause.wav" },
  { id: "drumroll", label: "Drum Roll", emoji: "🥁", file: "drumroll.wav" },
  { id: "ba-dum-tish", label: "Ba Dum Tish", emoji: "🥁", file: "ba-dum-tish.wav" },
  { id: "lol", label: "LOL", emoji: "😂", file: "lol.wav" },
  { id: "cricket", label: "Crickets", emoji: "🦗", file: "crickets.wav" },
  { id: "spooky", label: "Spooky", emoji: "👻", file: "spooky.wav" },
  { id: "magic-spell", label: "Magic Spell", emoji: "🪄", file: "magic-spell.m4a" },
  { id: "shhh", label: "Shhh", emoji: "🤫", file: "shhh.m4a" },
  { id: "ooh-ahh", label: "Ooh Ahh", emoji: "✨", file: "ooh-ahh.wav" },
  { id: "ooh-man", label: "Ooh (Man)", emoji: "🙎", file: "ooh-man.wav" },
  { id: "ohh-girl", label: "Ohh (Girl)", emoji: "🙍", file: "ohh-girl.ogg" },
];

const SOUND_BASE = `${WEBSITE_LINK}/sounds`;
const BUCKET = "soundboard-sounds";
const MAX_CUSTOM_SOUNDS = 8;
const MAX_FILE_SIZE_MB = 2;

interface CustomSound {
  name: string;
  url: string;
  path: string;
}

const StageSoundboard: React.FC = () => {
  const { playingSoundId, playSoundEffect, stopSoundEffect } = useStages();
  const { user } = useAuth();
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Custom sounds live in a per-wallet folder in the bucket, as on web.
  const folder = (user?.walletAddress || user?.address || "").toLowerCase() || undefined;

  const loadCustomSounds = useCallback(async () => {
    if (!folder) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, { limit: MAX_CUSTOM_SOUNDS, sortBy: { column: "created_at", order: "asc" } });
    if (error || !data) return;

    setCustomSounds(
      data
        .filter((f) => f.name !== ".emptyFolderPlaceholder")
        .map((f) => {
          const path = `${folder}/${f.name}`;
          return {
            name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
            url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
            path,
          };
        }),
    );
  }, [folder]);

  useEffect(() => {
    void loadCustomSounds();
  }, [loadCustomSounds]);

  const play = useCallback(
    async (url: string, id: string) => {
      try {
        await playSoundEffect(url, id);
      } catch {
        toastError("Could not play that on stage");
      }
    },
    [playSoundEffect],
  );

  const handleUpload = useCallback(async () => {
    if (!folder) return;
    if (customSounds.length >= MAX_CUSTOM_SOUNDS) {
      toastError(`Max ${MAX_CUSTOM_SOUNDS} custom sounds — delete one first`);
      return;
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      if ((asset.size ?? 0) > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toastError(`File must be under ${MAX_FILE_SIZE_MB}MB`);
        return;
      }

      setIsUploading(true);
      const safeName = (asset.name || "sound").replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
      const path = `${folder}/${Date.now()}-${safeName}`;
      const blob = await (await fetch(asset.uri)).blob();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: false, contentType: asset.mimeType || blob.type || "audio/mpeg" });
      if (error) throw error;

      toastSuccess("Sound uploaded");
      await loadCustomSounds();
    } catch (err) {
      log.error("Custom sound upload failed:", err);
      toastError("Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, [folder, customSounds.length, loadCustomSounds]);

  const handleDelete = useCallback(
    (sound: CustomSound) => {
      Alert.alert("Delete sound?", `"${sound.name}" will be removed from your soundboard.`, [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.storage.from(BUCKET).remove([sound.path]);
            if (error) {
              toastError("Failed to delete");
              return;
            }
            setCustomSounds((prev) => prev.filter((s) => s.path !== sound.path));
          },
        },
      ]);
    },
    [],
  );

  const padStyle = (active: boolean) => ({
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  });

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingBottom: 8,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.06)",
        paddingTop: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: 10,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          🎛️ Soundboard
        </Text>
        {!!playingSoundId && (
          <TouchableOpacity
            onPress={stopSoundEffect}
            hitSlop={8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: "rgba(239,68,68,0.2)",
            }}
            accessibilityRole="button"
            accessibilityLabel="Stop sound"
          >
            <Icon name="Square" size={11} color="#F87171" />
            <Text style={{ color: "#F87171", fontSize: 11, fontWeight: "600" }}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
        {BUILT_IN_SOUNDS.map((sound) => {
          const active = playingSoundId === sound.id;
          return (
            <TouchableOpacity
              key={sound.id}
              onPress={() => play(`${SOUND_BASE}/${sound.file}`, sound.id)}
              style={padStyle(active)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={sound.label}
            >
              <Text style={{ fontSize: 13 }}>{sound.emoji}</Text>
              <Text
                style={{
                  color: active ? "#fff" : "rgba(255,255,255,0.6)",
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                {sound.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!!folder && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 2, marginTop: 6 }}
        >
          {customSounds.map((sound) => {
            const id = `custom-${sound.path}`;
            const active = playingSoundId === id;
            return (
              <TouchableOpacity
                key={sound.path}
                onPress={() => play(sound.url, id)}
                onLongPress={() => handleDelete(sound)}
                style={padStyle(active)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${sound.name}. Long press to delete.`}
              >
                <Icon name="Music" size={12} color={active ? "#fff" : "rgba(255,255,255,0.6)"} />
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.6)",
                    fontSize: 12,
                    fontWeight: "500",
                    maxWidth: 120,
                  }}
                >
                  {sound.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            onPress={handleUpload}
            disabled={isUploading}
            style={[padStyle(false), { opacity: isUploading ? 0.5 : 1 }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Upload a custom sound"
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
            ) : (
              <Icon name="Plus" size={12} color="rgba(255,255,255,0.6)" />
            )}
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500" }}>
              {isUploading ? "Uploading…" : `Add (${customSounds.length}/${MAX_CUSTOM_SOUNDS})`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

export default StageSoundboard;
