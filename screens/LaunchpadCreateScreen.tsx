import { tokenLabel } from '../libs/token-label';
/**
 * LaunchpadCreateScreen
 * =====================
 * The three-step "Create a coin" flow (dehub.io/launchpad/create): name,
 * ticker, image and links; chain and curve; review and launch.
 *
 * Launching a token is exactly what the App Store build leaves out, so the
 * screen sends the viewer home there even when a link reaches it directly
 * (config/storefront).
 */
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { DeHubLoader } from "../components/DeHubLoader";
import { CURVE_KEYS } from "../components/Launchpad/parts";
import { useUser } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { useGateToHome } from "../hooks/useGateToHome";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { FIELD_TEXT } from "../theme/inputs";
import { localFileSize } from "../libs/storage-upload";
import { toastError, toastSuccess } from "../libs/toast";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  LAUNCHPAD_CHAINS,
  chainLabel,
  createLaunchpadToken,
  uploadLaunchpadImage,
  type LaunchpadCurve,
} from "../services/launchpad.service";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CURVES: LaunchpadCurve[] = ["standard", "fair", "stealth"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowValue}>{v}</Text>
    </View>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, active && styles.choiceActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function LaunchpadCreateScreen() {
  useGateToHome(DIGITAL_PURCHASES_ENABLED);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const keyboardOffset = useKeyboardOffset();
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const wallet = user?.walletAddress || user?.address || null;

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [chainId, setChainId] = useState<8453 | 56>(8453);
  const [curveType, setCurveType] = useState<LaunchpadCurve>("standard");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canNext1 = name.trim().length >= 2 && /^[A-Z0-9]{2,8}$/.test(symbol);

  const pickImage = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return;
    if (asset.mimeType && !asset.mimeType.startsWith("image/")) {
      toastError(t("launchpad.imageFilesOnly"));
      return;
    }
    const size = asset.fileSize ?? (await localFileSize(asset.uri)) ?? 0;
    if (size > MAX_IMAGE_BYTES) {
      toastError(t("launchpad.max5mb"));
      return;
    }
    setUploading(true);
    try {
      setImageUrl(await uploadLaunchpadImage(wallet, asset));
    } catch (e) {
      toastError((e as Error)?.message || t("launchpad.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!wallet) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    setSubmitting(true);
    try {
      const token = await createLaunchpadToken({
        walletAddress: wallet,
        chainId,
        name,
        symbol,
        description,
        imageUrl,
        website,
        twitter,
        telegram,
        curveType,
      });
      toastSuccess(t("launchpad.launched", { symbol }));
      queryClient.invalidateQueries({ queryKey: ["launchpad-tokens"] });
      navigation.replace(ScreenNames.LaunchpadCoin, { mintId: token.id });
    } catch (e) {
      toastError((e as Error)?.message || t("launchpad.createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!DIGITAL_PURCHASES_ENABLED) return null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScreenHeader title={t("launchpad.createTitle")} subtitle={t("launchpad.stepOf", { step })} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 32, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <>
            <Field label={t("launchpad.fieldName")}>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={48}
                placeholder={t("launchpad.namePlaceholder")}
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={[styles.input, FIELD_TEXT]}
              />
            </Field>
            <Field label={t("launchpad.fieldTicker")} hint={t("launchpad.tickerHint")}>
              <TextInput
                value={symbol}
                onChangeText={(v) => setSymbol(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="PEPE"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={[styles.input, FIELD_TEXT]}
              />
            </Field>
            <Field label={t("launchpad.fieldDescription")}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={280}
                multiline
                placeholder={t("launchpad.descriptionPlaceholder")}
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={[styles.input, styles.textarea, FIELD_TEXT]}
              />
            </Field>
            <Field label={t("launchpad.fieldImage")}>
              <Pressable
                onPress={pickImage}
                disabled={uploading}
                style={[styles.imagePicker, uploading && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                {imageUrl ? (
                  <Image source={imageUrl} style={styles.imagePreview} contentFit="cover" />
                ) : (
                  <View style={[styles.imagePreview, styles.imagePlaceholder]}>
                    {uploading ? <DeHubLoader size={22} /> : <Icon name="Upload" size={20} color="rgba(255,255,255,0.5)" />}
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.imageTitle}>{t(imageUrl ? "launchpad.replaceImage" : "launchpad.uploadImage")}</Text>
                  <Text style={styles.fieldHint}>{t("launchpad.imageHint")}</Text>
                </View>
                {!!imageUrl && (
                  <Pressable
                    onPress={() => setImageUrl("")}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("launchpad.close")}
                  >
                    <Icon name="X" size={16} color="rgba(255,255,255,0.6)" />
                  </Pressable>
                )}
              </Pressable>
            </Field>
            <TextInput
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={t("launchpad.website")}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={[styles.input, FIELD_TEXT]}
            />
            <TextInput
              value={twitter}
              onChangeText={setTwitter}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t("launchpad.twitter")}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={[styles.input, FIELD_TEXT]}
            />
            <TextInput
              value={telegram}
              onChangeText={setTelegram}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t("launchpad.telegram")}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={[styles.input, FIELD_TEXT]}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Field label={t("launchpad.fieldChain")}>
              <View style={styles.choiceRow}>
                {LAUNCHPAD_CHAINS.map((c) => (
                  <Choice key={c.id} label={c.label} active={chainId === c.id} onPress={() => setChainId(c.id)} />
                ))}
              </View>
            </Field>
            <Field label={t("launchpad.fieldCurve")}>
              <View style={styles.choiceRow}>
                {CURVES.map((c) => (
                  <Choice key={c} label={t(CURVE_KEYS[c])} active={curveType === c} onPress={() => setCurveType(c)} />
                ))}
              </View>
            </Field>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                {`${t("launchpad.basePair")} `}
                <Text style={styles.infoStrong}>{tokenLabel()}</Text>
              </Text>
              <Text style={styles.infoText}>
                {`${t("launchpad.graduationTarget")} `}
                <Text style={styles.infoStrong}>{t("launchpad.graduationTargetValue")}</Text>
              </Text>
              <Text style={styles.infoText}>
                {`${t("launchpad.fee")} `}
                <Text style={styles.infoStrong}>{t("launchpad.feePerTrade")}</Text>
                {` ${t("launchpad.feeSplitInline")}`}
              </Text>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.reviewTitle}>{t("launchpad.review")}</Text>
            <View style={[styles.infoBox, { gap: 8 }]}>
              <Row k={t("launchpad.fieldName")} v={name} />
              <Row k={t("launchpad.fieldTicker")} v={`$${symbol}`} />
              <Row k={t("launchpad.fieldChain")} v={chainLabel(chainId)} />
              <Row k={t("launchpad.fieldCurve")} v={t(CURVE_KEYS[curveType])} />
              <Row k={t("launchpad.pair")} v={tokenLabel()} />
              <Row k={t("launchpad.graduatesAt")} v={t("launchpad.graduatesAtValue")} />
            </View>
            <Text style={styles.note}>{t("launchpad.mockNote")}</Text>
          </>
        )}

        <View style={styles.navRow}>
          <Pressable
            onPress={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            style={[styles.navBtn, step === 1 && { opacity: 0.4 }]}
            accessibilityRole="button"
          >
            <Icon name="ChevronLeft" size={16} color="#FFFFFF" />
            <Text style={styles.navText}>{t("launchpad.back")}</Text>
          </Pressable>
          {step < 3 ? (
            <Pressable
              onPress={() => setStep((s) => s + 1)}
              disabled={step === 1 && !canNext1}
              style={[styles.navBtn, styles.navBtnPrimary, step === 1 && !canNext1 && { opacity: 0.4 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.navText, styles.navTextPrimary]}>{t("launchpad.next")}</Text>
              <Icon name="ChevronRight" size={16} color="#000000" />
            </Pressable>
          ) : (
            <Pressable
              onPress={submit}
              disabled={!canNext1 || submitting}
              style={[styles.navBtn, styles.navBtnPrimary, (!canNext1 || submitting) && { opacity: 0.5 }]}
              accessibilityRole="button"
            >
              {submitting && <DeHubLoader size={16} />}
              <Text style={[styles.navText, styles.navTextPrimary]}>
                {submitting ? t("launchpad.launching") : t("launchpad.launch")}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  fieldHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, textTransform: "uppercase" },
  fieldHint: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#FFFFFF",
    fontSize: 14,
  },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  imagePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  imagePreview: { width: 48, height: 48, borderRadius: 10 },
  imagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  imageTitle: { color: "#FFFFFF", fontSize: 14 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  choiceActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  choiceText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },
  choiceTextActive: { color: "#000000" },
  infoBox: {
    padding: 12,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  infoText: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 18 },
  infoStrong: { color: "#FFFFFF" },
  reviewTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowKey: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  rowValue: { color: "#FFFFFF", fontSize: 14, flexShrink: 1, textAlign: "right" },
  note: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  navRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 4 },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  navBtnPrimary: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  navText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  navTextPrimary: { color: "#000000" },
});
