import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Platform, ScrollView, Share } from "react-native";
import { TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";
import { supabase } from "../../services/supabase";
import { ShareLinks } from "../../navigation/linking.config";
import { ScreenNames } from "../../navigation/ScreenNames";
import { navigationRef } from "../../App";
import { runWithPermissions } from "../../libs/permissions.util";
import { createLogger } from "../../libs/logger";

const log = createLogger("CreateStageModal");

/** 8 MB — a cover is decoration, not an upload feature. */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

type Mode = "now" | "later";

const CreateStageModal: React.FC = () => {
  const {
    isModalOpen,
    initialModalView,
    isLoading,
    createSpace,
    scheduleSpace,
    openModal,
    closeModal,
  } = useStages();

  const [mode, setMode] = useState<Mode>("now");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // Default to an hour out, rounded to the next half hour — far enough ahead to
  // be plausible, close enough that most hosts only adjust the time.
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scheduledLink, setScheduledLink] = useState<string | null>(null);

  if (!isModalOpen || initialModalView !== "create") return null;

  const handleBack = () => openModal("browse");

  const reset = () => {
    setTitle("");
    setDescription("");
    setCoverUri(null);
    setScheduledLink(null);
    setMode("now");
    setError("");
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setError("");
    const space = await createSpace(title.trim(), description.trim() || undefined);
    if (space) {
      reset();
      openModal("live");
    } else {
      setError("Failed to start stage. Please try again.");
    }
  };

  const pickCover = async () => {
    await runWithPermissions(["photos"], async () => {
      const mediaTypesCompat: any = (ImagePicker as any).MediaType
        ? [(ImagePicker as any).MediaType.image]
        : ImagePicker.MediaTypeOptions.Images;
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypesCompat,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (!pick.canceled && pick.assets?.[0]?.uri) {
        const asset = pick.assets[0];
        if (typeof asset.fileSize === "number" && asset.fileSize > MAX_COVER_BYTES) {
          setError("Cover must be under 8 MB");
          return;
        }
        setCoverUri(asset.uri);
        setError("");
      }
    });
  };

  const uploadCover = async (localUri: string): Promise<string | null> => {
    try {
      const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
      // Timestamped path: storage RLS here is insert-only by design, so a
      // unique name is what keeps one upload from clobbering another.
      const path = `stages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const response = await fetch(localUri);
      const blob = await response.blob();
      const { error: uploadErr } = await supabase.storage
        .from("community-media")
        .upload(path, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
      if (uploadErr) throw uploadErr;
      return supabase.storage.from("community-media").getPublicUrl(path).data.publicUrl;
    } catch (err) {
      log.error("Cover upload failed:", err);
      return null;
    }
  };

  const handleSchedule = async () => {
    if (!title.trim()) return;
    if (when.getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }
    setError("");

    let coverImageUrl: string | null = null;
    if (coverUri) {
      setUploading(true);
      coverImageUrl = await uploadCover(coverUri);
      setUploading(false);
      // A failed graphic must not cost the host the stage — carry on without it
      // and say so, rather than throwing the whole form away.
      if (!coverImageUrl) setError("Cover image failed to upload — scheduling without it");
    }

    const space = await scheduleSpace({
      title: title.trim(),
      description: description.trim() || undefined,
      scheduledAt: when.toISOString(),
      coverImageUrl,
    });

    if (space) {
      setScheduledLink(ShareLinks.stage(space.id));
    } else {
      setError("Failed to schedule stage. Please try again.");
    }
  };

  const whenLabel = when.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // ── Scheduled: hand over the link ────────────────────────────────────────
  //
  // Deliberately no auto-post. Publishing on DeHub is an on-chain mint from the
  // host's wallet, so firing one as a side effect of a form would spend gas they
  // never agreed to. Sharing the link is the cheap path, and pasting it into a
  // post renders the same card.
  if (scheduledLink) {
    return (
      <GlassModal visible onClose={() => { reset(); closeModal(); }} presentation="bottom">
        <View style={styles.container}>
          <View style={styles.successIcon}>
            <Icon name="Check" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.successTitle}>Stage scheduled</Text>
          <Text style={styles.successWhen}>{whenLabel} · {timeLabel}</Text>
          <Text style={styles.successHint}>
            It's on the Upcoming shelf now. Share the link and it opens as a card
            wherever you paste it.
          </Text>

          <TouchableOpacity
            style={styles.goLiveBtn}
            onPress={() => {
              // Pre-filled, not published: the composer still runs the mint.
              // Routed through navigationRef because this modal host is a
              // sibling of the navigator, not a screen inside it.
              const announcement = `🎙️ ${title.trim()} — live on Stages ${whenLabel}, ${timeLabel}\n\n${scheduledLink}`;
              reset();
              closeModal();
              if (navigationRef.isReady()) {
                navigationRef.navigate(
                  ScreenNames.Upload as never,
                  { initialText: announcement } as never,
                );
              }
            }}
          >
            <Icon name="Send" size={18} color="#09090B" />
            <Text style={styles.goLiveText}>Post about it</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              Share.share({
                message: `🎙️ ${title.trim()} — live on Stages ${whenLabel}, ${timeLabel}\n\n${scheduledLink}`,
              }).catch(() => {});
            }}
          >
            <Text style={styles.secondaryText}>Share link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => { reset(); openModal("browse"); }}
          >
            <Text style={styles.secondaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </GlassModal>
    );
  }

  const busy = isLoading || uploading;

  return (
    <GlassModal visible onClose={closeModal} presentation="bottom">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon name="ArrowLeft" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>
            {mode === "now" ? "Start a Stage" : "Schedule a Stage"}
          </Text>
          <View style={{ width: 20 }} />
        </View>

        {/* Now / later. Title and description carry across both. */}
        <View style={styles.segment}>
          {(["now", "later"] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => { setMode(m); setError(""); }}
              style={[styles.segmentBtn, mode === m && styles.segmentBtnActive]}
            >
              <Icon
                name={m === "now" ? "Radio" : "Calendar"}
                size={14}
                color={mode === m ? "#FFFFFF" : "#8B8D90"}
              />
              <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                {m === "now" ? "Go live now" : "Schedule"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Stage title..."
          placeholderTextColor="#8B8D90"
          value={title}
          onChangeText={setTitle}
          autoFocus
          maxLength={100}
        />

        {/* Web has always had a description on this form; mobile did not, so the
            same stage created from a phone lost its subtitle everywhere. */}
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Description (optional)"
          placeholderTextColor="#8B8D90"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={2}
          maxLength={280}
        />

        {mode === "later" && (
          <>
            <View style={styles.row}>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                <Icon name="Calendar" size={16} color="#FFFFFF" />
                <Text style={styles.pickerText}>{whenLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
                <Icon name="Clock" size={16} color="#FFFFFF" />
                <Text style={styles.pickerText}>{timeLabel}</Text>
              </TouchableOpacity>
            </View>

            {(showDatePicker || Platform.OS === "ios") && (
              <DateTimePicker
                value={when}
                mode="date"
                display={Platform.OS === "ios" ? "compact" : "default"}
                minimumDate={new Date()}
                onChange={(_e, d) => {
                  if (Platform.OS === "android") setShowDatePicker(false);
                  if (d) {
                    // Keep the time already chosen — the date picker only moves the day.
                    const next = new Date(when);
                    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    setWhen(next);
                  }
                }}
              />
            )}

            {(showTimePicker || Platform.OS === "ios") && (
              <DateTimePicker
                value={when}
                mode="time"
                display={Platform.OS === "ios" ? "compact" : "default"}
                onChange={(_e, d) => {
                  if (Platform.OS === "android") setShowTimePicker(false);
                  if (d) {
                    const next = new Date(when);
                    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                    setWhen(next);
                  }
                }}
              />
            )}

            {/* Cover graphic */}
            {coverUri ? (
              <View style={styles.coverWrap}>
                <Image source={{ uri: coverUri }} style={styles.coverImg} contentFit="cover" />
                {/* The same scrim the card and the live room use, so what the
                    host sees here is what the graphic will look like in use. */}
                <View style={styles.coverScrim} />
                <Text style={styles.coverTitle} numberOfLines={1}>
                  {title.trim() || "Your stage title"}
                </Text>
                <TouchableOpacity
                  style={styles.coverRemove}
                  onPress={() => setCoverUri(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove cover graphic"
                >
                  <Icon name="X" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.coverAdd} onPress={pickCover}>
                <Icon name="ImagePlus" size={20} color="#8B8D90" />
                <Text style={styles.coverAddText}>Add a graphic</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          onPress={mode === "now" ? handleCreate : handleSchedule}
          disabled={!title.trim() || busy}
          style={[styles.goLiveBtn, (!title.trim() || busy) && styles.disabled]}
        >
          <Icon name={mode === "now" ? "Radio" : "Calendar"} size={18} color="#09090B" />
          <Text style={styles.goLiveText}>
            {uploading
              ? "Uploading cover..."
              : busy
                ? mode === "now" ? "Starting..." : "Scheduling..."
                : mode === "now" ? "Go Live" : "Schedule stage"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  scroll: { maxHeight: 560 },
  container: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  segment: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentBtnActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#8B8D90", fontSize: 13, fontWeight: "500" },
  segmentTextActive: { color: "#FFFFFF" },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 12,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: "top", fontSize: 14 },
  row: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pickerText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  coverWrap: {
    height: 110,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    justifyContent: "flex-end",
  },
  coverImg: { ...StyleSheet.absoluteFillObject },
  coverScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  coverTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", padding: 12 },
  coverRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverAdd: {
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 12,
  },
  coverAddText: { color: "#8B8D90", fontSize: 12 },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F4F4F5",
    paddingVertical: 14,
    borderRadius: 12,
  },
  goLiveText: {
    color: "#09090B",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  secondaryText: { color: "#8B8D90", fontSize: 15, fontWeight: "500" },
  disabled: {
    opacity: 0.5,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  successTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  successWhen: {
    color: "#D4D4D8",
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
  successHint: {
    color: "#8B8D90",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
});

export default CreateStageModal;
