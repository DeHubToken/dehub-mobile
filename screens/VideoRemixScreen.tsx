import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { useIsFocused, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { useUser } from "../context/AuthContext";
import { runWithPermissions } from "../libs/permissions.util";
import { videoNeedsAccess } from "../libs/video-access";
import { getNFT } from "../services/nft.service";
import { buildRemixStudioHtml } from "../libs/editor/remixStudioHtml";
import { MAX_REMIX_RECORDING_BYTES, readRemixRecording } from "../libs/editor/remixRecording";
import { importClipFile, saveProject } from "../libs/editor/storage";
import { newProject } from "../libs/editor/project";
import { addClip } from "../libs/editor/timeline";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";

export default function VideoRemixScreen() {
  const user = useUser();
  return <VideoRemixForAccount key={user?.walletAddress || user?.address || "guest"} />;
}

function VideoRemixForAccount() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.VideoRemix>>();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [allowed, setAllowed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const webview = useRef<WebView>(null);
  const savingRef = useRef(false);
  const openingRef = useRef(false);
  const generation = useRef(0);
  const bridgeKey = useMemo(() => Crypto.randomUUID(), [attempt]);
  const currentBridgeKey = useRef(bridgeKey); currentBridgeKey.current = bridgeKey;
  const params = route.params;
  const validSource = /^https:\/\//i.test(params.videoUrl) && /^https:\/\/dehub\.io\/(?:app\/post|newpost)\/[^/?#]+(?:[?#].*)?$/.test(params.sourceUrl);
  const html = useMemo(() => validSource ? buildRemixStudioHtml({ ...params, bridgeKey }) : "", [params, bridgeKey, validSource]);
  const sourceAvailable = async () => {
    const { result } = await getNFT(params.tokenId);
    return !!result && !videoNeedsAccess(result) && !result.isHidden && !result.deleted && !result.streamInfo?.isLive && result.status !== "live" &&
      !String(result.contentRating || "").includes("mature") && !result.spoilerText && (!result.quotePolicy || result.quotePolicy === "public" || result.isOwner === true);
  };
  const saveFailed = (text: string) => {
    setError(text);
    webview.current?.postMessage(JSON.stringify({ key: bridgeKey, type: "save-failed", error: text }));
  };
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", state => {
      setActive(state === "active");
      if (state !== "active") { webview.current?.postMessage(JSON.stringify({ key: currentBridgeKey.current, type: "dispose" })); setAllowed(false); generation.current++; }
    });
    return () => { webview.current?.postMessage(JSON.stringify({ key: currentBridgeKey.current, type: "dispose" })); mounted.current = false; generation.current++; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!focused) { webview.current?.postMessage(JSON.stringify({ key: currentBridgeKey.current, type: "dispose" })); setAllowed(false); generation.current++; }
  }, [focused]);
  const begin = async () => {
    if (!validSource || savingRef.current || openingRef.current) return;
    openingRef.current = true; setOpening(true);
    setError(null);
    const current = generation.current;
    try {
      if (!await sourceAvailable()) { setError(t("remix.unavailable", { defaultValue: "This video is unavailable for remixing." })); return; }
      await runWithPermissions(["camera", "microphone"], async () => {
        if (!mounted.current || current !== generation.current || AppState.currentState !== "active") return;
        setAttempt(value => value + 1);
        setAllowed(true);
      });
    } catch { if (mounted.current) setError(t("remix.openFailed", { defaultValue: "The remix could not be opened. Check your connection and camera permissions, then try again." })); }
    finally { openingRef.current = false; if (mounted.current) setOpening(false); }
  };
  const receive = async (event: WebViewMessageEvent) => {
    if (!mounted.current || !focused || !active || savingRef.current) return;
    if (event.nativeEvent.data.length > Math.ceil(MAX_REMIX_RECORDING_BYTES * 4 / 3) + 2048) { saveFailed(t("remix.tooLarge", { defaultValue: "This recording is too large. Record a shorter take." })); return; }
    let message: { key?: string; type?: string; error?: string; dataUrl?: string; duration?: number; mime?: string; width?: number; height?: number };
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.key !== bridgeKey) return;
    if (message.type === "cancel") { navigation.goBack(); return; }
    if (message.type === "error") { setError(String(message.error || t("common.somethingWentWrong")).slice(0, 500)); return; }
    if (message.type !== "recorded") return;
    const recording = readRemixRecording(message);
    if (!recording || !FileSystem.cacheDirectory) {
      saveFailed(t("remix.invalidRecording", { defaultValue: "The recording could not be read. Please record another take." })); return;
    }
    savingRef.current = true; setSaving(true); setError(null);
    const current = generation.current;
    const temporary = `${FileSystem.cacheDirectory}remix-${bridgeKey}.${recording.extension}`;
    try {
      if (!await sourceAvailable()) { setAllowed(false); setError(t("remix.unavailable", { defaultValue: "This video is unavailable for remixing." })); return; }
      await FileSystem.writeAsStringAsync(temporary, recording.base64, { encoding: FileSystem.EncodingType.Base64 });
      if (!mounted.current || current !== generation.current) return;
      const attributionText = `Remix of ${params.creator ? `@${params.creator.replace(/^@/, "")} · ` : ""}${params.sourceUrl}`;
      const media = await importClipFile({ uri: temporary, kind: "video", fileName: `remix-${params.mode}.${recording.extension}`, mimeType: recording.mime, width: recording.width, height: recording.height, duration: recording.duration,
        provenance: { source: "dehub-remix", sourceUrl: params.sourceUrl, creator: params.creator, license: "Creator rights retained", attributionRequired: true, attributionText } });
      const result = addClip(newProject(recording.height === recording.width ? "1:1" : "9:16", params.title || "Remix"), { id: media.id, kind: "video", duration: recording.duration });
      const project = { ...result.project, clips: result.project.clips.map(clip => clip.id === result.clipId ? { ...clip, label: attributionText, href: params.sourceUrl } : clip) };
      await saveProject(project);
      if (mounted.current && current === generation.current) navigation.replace(ScreenNames.MediaEditor, { projectId: project.id });
    } catch { if (mounted.current) saveFailed(t("remix.saveFailed", { defaultValue: "The remix could not be saved. Please try again." })); }
    finally {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return <View style={{ flex: 1, backgroundColor: "#080808", paddingTop: insets.top, paddingBottom: insets.bottom }}>
    <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => navigation.goBack()}><Text style={{ color: "white", padding: 8 }}>{t("common.cancel")}</Text></Pressable>
      <Text style={{ color: "white", fontWeight: "600", flex: 1 }}>{t("remix.title", { defaultValue: "Remix" })}</Text>
      {(saving || opening) && <ActivityIndicator color="white" />}
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: "#fca5a5", paddingHorizontal: 16, paddingBottom: 10 }}>{error}</Text>}
    {!validSource ? <Text style={{ color: "white", padding: 16 }}>{t("remix.unavailable", { defaultValue: "This video is unavailable for remixing." })}</Text>
      : allowed && active && focused ? <WebView ref={webview} key={bridgeKey} source={{ html, baseUrl: "https://dehub.io/" }} originWhitelist={["https://dehub.io"]}
        onShouldStartLoadWithRequest={request => request.url === "about:blank" || request.url === "https://dehub.io/"}
        javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt" setSupportMultipleWindows={false}
        onMessage={event => { void receive(event); }} onContentProcessDidTerminate={() => { setAllowed(false); setError(t("common.somethingWentWrong")); }}
        onRenderProcessGone={() => { setAllowed(false); setError(t("common.somethingWentWrong")); }} style={{ flex: 1, backgroundColor: "#080808" }} />
      : <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 20 }}>
        <Text style={{ color: "white", textAlign: "center" }}>{t("remix.startHint", { defaultValue: "Preview your camera over this video, then record your remix. Leaving this screen stops the camera." })}</Text>
        <Pressable accessibilityRole="button" disabled={saving || opening || !active} onPress={() => { void begin(); }} style={{ backgroundColor: "white", borderRadius: 20, padding: 16 }}><Text style={{ color: "black", fontWeight: "600" }}>{t("remix.openCamera", { defaultValue: "Open camera" })}</Text></Pressable>
      </View>}
  </View>;
}
