/**
 * Create or edit an event: port of dehubweb's CreateEventDrawer and
 * EditEventDrawer in one sheet. Cover photo, name, start and optional end,
 * place and details. A new event can also be private (guests ask to attend)
 * or charge an entry fee in DHB; like web, those two are fixed once created.
 */
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import CustomSwitch from "../ui/CustomSwitch";
import { DhbCoin } from "../common/DhbCoin";
import { useThemeRootStyle } from "../../context/ThemeContext";
import { useUser } from "../../context/AuthContext";
import { useSurfaceDraft } from "../../hooks/useSurfaceDraft";
import { contentTypeForExtension, fileExtension, uploadLocalFileToBucket } from "../../libs/storage-upload";
import { runWithPermissions } from "../../libs/permissions.util";
import { storageImageSource } from "../../libs/cdnImage";
import { appLocale } from "../../libs/date.util";
import { sanitizeAmountInput } from "../../libs/amount-input";
import { toastError, toastSuccess } from "../../libs/toast";
import { createEvent, updateEvent, type CommunityEvent } from "../../services/events.service";

const MAX_COVER_BYTES = 8 * 1024 * 1024;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Editing this event; leave out to create one. */
  event?: CommunityEvent | null;
  communityId?: string;
  onCreated?: (event: CommunityEvent) => void;
}

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d;
}

type Picker = { which: "start" | "end"; mode: "date" | "time" } | null;

export default function EventFormSheet({ visible, onClose, event, communityId, onCreated }: Props) {
  const { t } = useTranslation();
  const rootStyle = useThemeRootStyle();
  const queryClient = useQueryClient();
  const user = useUser() as any;
  const wallet: string | null = user?.walletAddress || user?.address || null;
  const editing = !!event;
  const scope = event?.id ?? communityId ?? "global";

  const [title, setTitle] = useSurfaceDraft("components/Events/EventFormSheet.tsx:title", event?.title ?? "", scope);
  const [description, setDescription] = useSurfaceDraft("components/Events/EventFormSheet.tsx:description", event?.description ?? "", scope);
  const [location, setLocation] = useSurfaceDraft("components/Events/EventFormSheet.tsx:location", event?.location ?? "", scope);
  const [start, setStart] = useState<Date>(() => (event ? new Date(event.starts_at) : defaultStart()));
  const [end, setEnd] = useState<Date | null>(() => (event?.ends_at ? new Date(event.ends_at) : null));
  const [picker, setPicker] = useState<Picker>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [hasFee, setHasFee] = useState(false);
  const [fee, setFee] = useSurfaceDraft("components/Events/EventFormSheet.tsx:fee", "", scope);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const lang = appLocale();
  const dateLabel = (d: Date) => d.toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = (d: Date) => d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });

  const pickCover = () =>
    runWithPermissions(["photos"], async () => {
      const mediaTypes: any = (ImagePicker as any).MediaType ? [(ImagePicker as any).MediaType.image] : ImagePicker.MediaTypeOptions.Images;
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes, allowsEditing: true, aspect: [16, 9], quality: 0.85 });
      const asset = !pick.canceled ? pick.assets?.[0] : null;
      if (!asset?.uri) return;
      if (typeof asset.fileSize === "number" && asset.fileSize > MAX_COVER_BYTES) {
        setError(t("stages.coverTooLarge"));
        return;
      }
      setCoverUri(asset.uri);
      setError("");
    });

  const save = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Not signed in");
      if (editing && event) {
        return updateEvent(
          event.id,
          {
            title: title.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
            starts_at: start.toISOString(),
            ends_at: end ? end.toISOString() : null,
          },
          wallet,
        );
      }
      let cover_image_url: string | undefined;
      if (coverUri) {
        setUploading(true);
        try {
          const ext = fileExtension({ uri: coverUri }, "jpg");
          cover_image_url =
            (await uploadLocalFileToBucket({
              bucket: "community-media",
              path: `events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
              uri: coverUri,
              contentType: contentTypeForExtension(ext, "image/jpeg"),
            })) ?? undefined;
        } catch {
          // Same as web: a failed cover never costs the event.
        } finally {
          setUploading(false);
        }
      }
      const feeAmount = hasFee ? Number(fee) || 0 : 0;
      return createEvent(
        {
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          starts_at: start.toISOString(),
          ends_at: end ? end.toISOString() : undefined,
          cover_image_url,
          community_id: communityId,
          creator_username: user?.username ?? undefined,
          creator_avatar: user?.avatarImageUrl ?? undefined,
          gate_fee: feeAmount > 0 ? feeAmount : undefined,
          is_private: isPrivate || undefined,
        },
        wallet,
      );
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["community-events"] });
      toastSuccess(
        editing
          ? t("copy.1603d5423679", { defaultValue: "Event updated!" })
          : t("copy.0de0253da6f1", { defaultValue: "Event created!" }),
      );
      setTitle.complete(title, "");
      setDescription.complete(description, "");
      setLocation.complete(location, "");
      setFee.complete(fee, "");
      setCoverUri(null);
      onClose();
      if (!editing) onCreated?.(saved);
    },
    onError: () =>
      toastError(
        editing
          ? t("copy.ab77f2abb3ae", { defaultValue: "Failed to update event" })
          : t("copy.d980d2b4ac8b", { defaultValue: "Failed to create event" }),
      ),
  });

  const submit = () => {
    if (!title.trim()) return;
    setError("");
    save.mutate();
  };

  const busy = save.isPending || uploading;
  const valid = title.trim().length > 0 && (!hasFee || Number(fee) > 0);

  const pickerValue = picker?.which === "end" ? end ?? new Date(start.getTime() + 2 * 3600_000) : start;
  const onPicked = (d?: Date) => {
    if (Platform.OS === "android") setPicker(null);
    if (!d || !picker) return;
    const base = new Date(pickerValue);
    if (picker.mode === "date") base.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    else base.setHours(d.getHours(), d.getMinutes(), 0, 0);
    if (picker.which === "start") {
      // Moving the start carries the end along, so the length stays the same.
      if (end) setEnd(new Date(end.getTime() + (base.getTime() - start.getTime())));
      setStart(base);
    } else {
      // An end before the start makes no sense; keep it at least an hour after.
      setEnd(base.getTime() > start.getTime() ? base : new Date(start.getTime() + 3600_000));
    }
  };

  const label = (text: string) => <Text style={styles.label}>{text}</Text>;
  const whenRow = (which: "start" | "end", value: Date | null) => (
    <View style={styles.row}>
      <Pressable style={styles.pickerBtn} onPress={() => setPicker({ which, mode: "date" })}>
        <Icon name="Calendar" size={15} color="#fff" />
        <Text style={[styles.pickerText, !value && styles.placeholder]}>{value ? dateLabel(value) : t("events.pickDate")}</Text>
      </Pressable>
      <Pressable style={styles.pickerBtn} onPress={() => setPicker({ which, mode: "time" })}>
        <Icon name="Clock" size={15} color="#fff" />
        <Text style={[styles.pickerText, !value && styles.placeholder]}>{value ? timeLabel(value) : "--:--"}</Text>
      </Pressable>
      {which === "end" && !!value && (
        <Pressable hitSlop={8} onPress={() => setEnd(null)} accessibilityLabel={t("events.cancel")}>
          <Icon name="X" size={15} color="#A1A1AA" />
        </Pressable>
      )}
    </View>
  );

  return (
    <GlassModal visible={visible} onClose={() => !busy && onClose()} presentation="bottom" maxHeight="92%">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={rootStyle} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{editing ? t("events.editEvent") : t("events.createEvent")}</Text>

          {!editing && (
            <View>
              {label(t("events.coverImage"))}
              <Pressable style={styles.cover} onPress={pickCover}>
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <>
                    <Icon name="ImagePlus" size={22} color="#71717A" />
                    <Text style={styles.faint}>{t("events.addCoverPhoto")}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
          {editing && !!event?.cover_image_url && (
            <Image source={storageImageSource(event.cover_image_url, 600)} style={styles.coverStatic} contentFit="cover" />
          )}

          <View>
            {label(t("events.eventName"))}
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("events.eventNamePlaceholder")}
              placeholderTextColor="#71717A"
              style={styles.input}
              maxLength={120}
            />
          </View>

          <View>
            {label(`${t("events.startDate")} · ${t("events.startTime")}`)}
            {whenRow("start", start)}
          </View>
          <View>
            {label(`${t("events.endDate")} · ${t("events.endTime")} (${t("events.optional")})`)}
            {whenRow("end", end)}
          </View>

          {!!picker && (
            <DateTimePicker
              value={pickerValue}
              mode={picker.mode}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={picker.mode === "date" && !editing ? new Date() : undefined}
              onChange={(_e, d) => onPicked(d)}
            />
          )}
          {Platform.OS === "ios" && !!picker && (
            <Pressable style={styles.doneBtn} onPress={() => setPicker(null)}>
              <Text style={styles.primaryText}>{t("common.done")}</Text>
            </Pressable>
          )}

          <View>
            {label(t("events.location"))}
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder={t("events.locationPlaceholder")}
              placeholderTextColor="#71717A"
              style={styles.input}
              autoCapitalize="none"
            />
          </View>

          <View>
            {label(t("events.description"))}
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("events.descriptionPlaceholder")}
              placeholderTextColor="#71717A"
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
              multiline
              maxLength={2000}
            />
          </View>

          {!editing && (
            <>
              <View style={styles.toggleRow}>
                <Icon name={isPrivate ? "Lock" : "Globe"} size={16} color="#A1A1AA" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>{t("events.privateEvent")}</Text>
                  <Text style={styles.faint}>{t("events.privateEventHint")}</Text>
                </View>
                <CustomSwitch value={isPrivate} onValueChange={setIsPrivate} accessibilityLabel={t("events.privateEvent")} />
              </View>
              <View style={styles.toggleRow}>
                <DhbCoin size={16} />
                <Text style={[styles.toggleTitle, { flex: 1 }]}>{t("events.chargeEntryFee")}</Text>
                <CustomSwitch value={hasFee} onValueChange={setHasFee} accessibilityLabel={t("events.chargeEntryFee")} />
              </View>
              {hasFee && (
                <View>
                  {label(t("events.amount"))}
                  <TextInput
                    value={fee}
                    onChangeText={(v) => setFee(sanitizeAmountInput(v))}
                    placeholder="100"
                    placeholderTextColor="#71717A"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              )}
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.row}>
            <Pressable style={[styles.quietBtn, { flex: 1 }]} onPress={onClose} disabled={busy}>
              <Text style={styles.quietText}>{t("events.cancel")}</Text>
            </Pressable>
            <Pressable style={[styles.primaryBtn, { flex: 1 }, (!valid || busy) && { opacity: 0.45 }]} onPress={submit} disabled={!valid || busy}>
              {busy && <ActivityIndicator size="small" color="#000" />}
              <Text style={styles.primaryText}>
                {uploading ? t("stages.uploadingCover") : editing ? t("events.saveChanges") : t("events.createEvent")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 18, gap: 14, paddingBottom: 30 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  label: { color: "#A1A1AA", fontSize: 12, marginBottom: 6 },
  faint: { color: "#71717A", fontSize: 12 },
  cover: { height: 130, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden" },
  coverStatic: { height: 110, borderRadius: 14 },
  input: { color: "#fff", fontSize: 15, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickerBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)" },
  pickerText: { color: "#fff", fontSize: 14 },
  placeholder: { color: "#71717A" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  toggleTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  error: { color: "#F87171", fontSize: 13 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: "#fff" },
  primaryText: { color: "#000", fontSize: 14, fontWeight: "700" },
  quietBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  quietText: { color: "#D4D4D8", fontSize: 14, fontWeight: "600" },
  doneBtn: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: "#fff" },
});
