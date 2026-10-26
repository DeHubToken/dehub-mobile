import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useWebSocket } from "../context/WebSocketContext";
import { useLiveAudience } from "./useLiveAudience";
import { useStreamOverlay } from "./useStreamOverlay";
import { getMyOverlay, saveMyOverlay, type CreatorOverlay } from "../services/live.service";
import { optionalSkia } from "../libs/skia";
import { storage } from "../libs/storage";
import { toastError } from "../libs/toast";
import {
  DEFAULT_FRAME,
  backgroundRemovalSupported,
  getFrameSize,
  phoneStudioSupported,
  resetStudio,
  setBackground as nativeSetBackground,
  setCard as nativeSetCard,
  setOverlay as nativeSetOverlay,
  type FrameSize,
} from "../libs/phoneStudio";
import { bindRoomEvents, roomUser } from "../libs/live-overlay/roomEvents";
import {
  DEFAULT_COUNTDOWN_MINUTES,
  SCENES,
  cardForScene,
  cardKey,
  parseBackground,
  parseImageSource,
  placeSource,
  type BackgroundConfig,
  type BackgroundModeId,
  type ImageSourceConfig,
  type SceneId,
  type SourcePosition,
  type SourceSize,
} from "../libs/phone-studio/scenes";
import { WidgetBoard, drawingsKey, type ChatLine } from "../libs/phone-studio/widgets";
import { StreamActivityType } from "../services/enums/livestream.enum";

type Painter = typeof import("../libs/phone-studio/paint");

/** Loaded only where Skia is in the binary; null leaves cards and overlays off. */
const painter: Painter | null = optionalSkia(() => require("../libs/phone-studio/paint") as Painter);

const STORAGE_KEY = "phone-studio:v1";
const MY_OVERLAY_KEY = ["my-overlay"] as const;

/** The painted overlay is re-sent at most this often, and only when it changed. */
const OVERLAY_INTERVAL_MS = 250;
/** How often the camera's frame size is re-read while the studio is in use (a flip can change it). */
const FRAME_POLL_MS = 3000;

interface Saved {
  background: BackgroundConfig;
  image: ImageSourceConfig | null;
  countdownMinutes: number;
}

function loadSaved(): Saved {
  try {
    const raw = storage.getString(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const minutes = Number(parsed?.countdownMinutes);
    return {
      background: parseBackground(parsed?.background),
      image: parseImageSource(parsed?.image),
      countdownMinutes: Number.isFinite(minutes) && minutes >= 0 ? Math.min(60, minutes) : DEFAULT_COUNTDOWN_MINUTES,
    };
  } catch {
    return { background: parseBackground(null), image: null, countdownMinutes: DEFAULT_COUNTDOWN_MINUTES };
  }
}

/** Copies a picked file out of the picker's cache, so it is still there next stream. */
async function keepFile(uri: string, name: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory ?? ""}phone-studio/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Already there.
  }
  const ext = (uri.split("?")[0].match(/\.(png|jpe?g|webp|heic)$/i)?.[1] || "jpg").toLowerCase();
  const target = `${dir}${name}-${Date.now().toString(36)}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

async function dropFile(uri: string | null | undefined): Promise<void> {
  if (!uri || !uri.includes("/phone-studio/")) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Nothing to clean up.
  }
}

interface Options {
  streamId: string | null | undefined;
  /** False while streaming from an encoder: no camera, so no studio. */
  enabled: boolean;
  /** When the broadcast went live, for the stream timer widget. */
  startedAt: number | null;
  micMuted: boolean;
  setMicMuted: (muted: boolean) => void;
  /** The producer's chat log, for the chat box widget. */
  chatActivities: Array<{ status: any; address?: string; createdAt?: number; meta?: any; user?: any }>;
}

/**
 * The phone studio: scenes, background removal, a placed image, and the
 * creator's widgets burned into the outgoing video. Everything here drives
 * the native processors through libs/phoneStudio.ts; this hook owns the
 * state, draws the pictures, and decides what goes in the effect chain.
 */
export function usePhoneStudio({ streamId, enabled, startedAt, micMuted, setMicMuted, chatActivities }: Options) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { on } = useWebSocket();
  const supported = useMemo(() => phoneStudioSupported() && painter != null, []);
  const backgroundSupported = useMemo(() => backgroundRemovalSupported(), []);
  const saved = useMemo(loadSaved, []);
  const active = supported && enabled;

  const [scene, setSceneState] = useState<SceneId>("chatting");
  const [sceneStartedAt, setSceneStartedAt] = useState(() => Date.now());
  const [countdownMinutes, setCountdownMinutes] = useState(saved.countdownMinutes);
  const [background, setBackgroundState] = useState<BackgroundConfig>(saved.background);
  const [image, setImage] = useState<ImageSourceConfig | null>(saved.image);
  const [frame, setFrame] = useState<FrameSize>(DEFAULT_FRAME);
  const [widgetsBusy, setWidgetsBusy] = useState(false);

  useEffect(() => {
    try {
      storage.set(STORAGE_KEY, JSON.stringify({ background, image, countdownMinutes }));
    } catch {
      // A setting that does not persist is still applied for this stream.
    }
  }, [background, image, countdownMinutes]);

  // ── Widgets: the creator's own overlay, and whether it is in the video ──

  const { data: myOverlay } = useQuery<CreatorOverlay>({
    queryKey: MY_OVERLAY_KEY,
    queryFn: getMyOverlay,
    enabled: active,
    staleTime: 30_000,
  });
  const widgetsInVideo = active && myOverlay?.renderIn === "video";
  const { data: streamOverlay } = useStreamOverlay(streamId, widgetsInVideo);
  const { data: audience } = useLiveAudience(streamId, { enabled: widgetsInVideo });

  /**
   * "Show widgets in my video" is the same switch an OBS creator flips: while
   * it is on, DeHub viewers' apps stop drawing their own copy, so nobody sees
   * an alert twice.
   */
  const setWidgetsInVideo = useCallback(
    async (on: boolean) => {
      if (!myOverlay || widgetsBusy) return;
      setWidgetsBusy(true);
      try {
        const next = await saveMyOverlay({ renderIn: on ? "video" : "app", widgets: myOverlay.widgets });
        queryClient.setQueryData(MY_OVERLAY_KEY, next);
      } catch {
        toastError(t("studioDeck.widgets.failed"));
      } finally {
        setWidgetsBusy(false);
      }
    },
    [myOverlay, widgetsBusy, queryClient, t],
  );

  const boardRef = useRef<WidgetBoard | null>(null);
  if (!boardRef.current) boardRef.current = new WidgetBoard((key, opts) => String(t(key, opts as any)), Date.now());
  const board = boardRef.current;

  useEffect(() => {
    board.setTranslate((key, opts) => String(t(key, opts as any)));
  }, [board, t, i18n.language]);

  useEffect(() => {
    board.setOverlay(
      myOverlay?.widgets ?? streamOverlay?.widgets ?? [],
      streamOverlay?.stats,
      streamOverlay?.controls ?? myOverlay?.controls,
    );
  }, [board, myOverlay, streamOverlay]);

  useEffect(() => board.setStreamStartedAt(startedAt), [board, startedAt]);

  useEffect(() => {
    board.setSupporters(
      (audience?.topTippers ?? []).map((r: any) => ({
        address: String(r.address),
        displayName: r.displayName,
        username: r.username,
        total: Number(r.total) || 0,
      })),
    );
  }, [board, audience]);

  useEffect(() => {
    const lines: ChatLine[] = [];
    for (const [i, a] of chatActivities.slice(-24).entries()) {
      if (a?.status !== StreamActivityType.MESSAGE) continue;
      const text = typeof a?.meta?.content === "string" ? a.meta.content.trim() : "";
      if (!text) continue;
      lines.push({
        id: `${a.createdAt ?? 0}-${i}`,
        text,
        user: roomUser({
          address: a.address || a.user?.address,
          username: a.meta?.username || a.user?.username,
          displayName: a.meta?.displayName || a.user?.displayName,
        }),
      });
    }
    board.setChat(lines.slice(-12));
  }, [board, chatActivities]);

  useEffect(() => {
    if (!widgetsInVideo || !streamId) return;
    const offs = bindRoomEvents(on, String(streamId), (event) => board.publish(event as any, Date.now()));
    return () => offs.forEach((off) => off());
  }, [widgetsInVideo, streamId, on, board]);

  // ── Frame size ──

  const cardOn = active && SCENES[scene].kind === "card";
  const imageOn = active && !!image?.visible;
  const backgroundOn = active && backgroundSupported && background.mode !== "none";
  const overlayOn = imageOn || widgetsInVideo;
  const anyOn = cardOn || overlayOn || backgroundOn;

  useEffect(() => {
    if (!anyOn) return;
    let cancelled = false;
    const read = async () => {
      const size = await getFrameSize();
      if (!cancelled && size) {
        setFrame((prev) => (prev.width === size.width && prev.height === size.height ? prev : size));
      }
    };
    void read();
    const id = setInterval(read, FRAME_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [anyOn]);

  // ── Scenes ──

  const mutedByScene = useRef(false);
  const setScene = useCallback(
    (next: SceneId) => {
      if (next === scene) return;
      setSceneState(next);
      setSceneStartedAt(Date.now());
      // "Be right back" takes the mic down and gives it back on the way out,
      // unless the creator had muted it themselves.
      if (SCENES[next].muteMic) {
        if (!micMuted) {
          mutedByScene.current = true;
          setMicMuted(true);
        }
      } else if (mutedByScene.current) {
        mutedByScene.current = false;
        setMicMuted(false);
      }
    },
    [scene, micMuted, setMicMuted],
  );

  // A creator who unmutes by hand during a card owns the mic again.
  useEffect(() => {
    if (!micMuted) mutedByScene.current = false;
  }, [micMuted]);

  const sceneCopy = useCallback(
    (id: SceneId) => ({
      title: t(`studioDeck.scenes.names.${id}`),
      subtitle: id === "chatting" ? undefined : t(`studioDeck.scenes.subtitles.${id}`),
    }),
    [t],
  );

  const card = useMemo(
    () => (cardOn ? cardForScene(scene, sceneCopy(scene), { countdownMinutes, startedAt: sceneStartedAt }) : null),
    [cardOn, scene, sceneCopy, countdownMinutes, sceneStartedAt],
  );

  const lastCard = useRef<{ key: string; scene: SceneId | null; frame: string }>({ key: "", scene: null, frame: "" });
  const cardSeq = useRef(0);
  const pushCard = useCallback(async () => {
    if (!supported || !painter) return;
    const now = Date.now();
    const key = cardKey(card, now);
    const frameKey = `${frame.width}x${frame.height}`;
    const prev = lastCard.current;
    if (key === prev.key && frameKey === prev.frame) return;
    const fade = (card ? scene : null) !== prev.scene;
    lastCard.current = { key, scene: card ? scene : null, frame: frameKey };
    const seq = ++cardSeq.current;
    try {
      if (!card) {
        await nativeSetCard(null, { fade: true });
        return;
      }
      const path = await painter.renderCard(card, frame, now);
      // A newer card was asked for while this one rendered.
      if (seq !== cardSeq.current) {
        void painter.deleteStudioFile(path);
        return;
      }
      await nativeSetCard(path, { fade });
      void painter.deleteStudioFile(path);
    } catch {
      lastCard.current = { key: "", scene: prev.scene, frame: "" };
    }
  }, [supported, card, frame, scene]);

  useEffect(() => {
    void pushCard();
    if (!card?.countdownTo) return;
    const id = setInterval(() => void pushCard(), 1000);
    return () => clearInterval(id);
  }, [pushCard, card]);

  // ── Background ──

  useEffect(() => {
    if (!supported || !backgroundSupported) return;
    const mode = active ? background.mode : "none";
    nativeSetBackground(mode, background.color, mode === "image" ? background.imageUri : null).catch(() => {
      if (mode !== "none") toastError(t("studioDeck.background.failed"));
    });
  }, [supported, backgroundSupported, active, background, t]);

  const pickBackground = useCallback(async () => {
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      const asset = pick.canceled ? null : pick.assets?.[0];
      if (!asset?.uri) return;
      const kept = await keepFile(asset.uri, "background");
      setBackgroundState((b) => {
        void dropFile(b.imageUri);
        return { ...b, mode: "image", imageUri: kept };
      });
    } catch {
      toastError(t("studioDeck.sources.failed"));
    }
  }, [t]);

  /** Picture with no picture yet opens the picker first. */
  const setBackgroundMode = useCallback(
    async (mode: BackgroundModeId) => {
      if (mode !== "image" || background.imageUri) {
        setBackgroundState((b) => ({ ...b, mode }));
        return;
      }
      await pickBackground();
    },
    [background.imageUri, pickBackground],
  );

  const setBackgroundColor = useCallback((color: string) => {
    setBackgroundState((b) => ({ ...b, mode: "color", color }));
  }, []);

  // ── Image or logo ──

  const pickImage = useCallback(async () => {
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      const asset = pick.canceled ? null : pick.assets?.[0];
      if (!asset?.uri) return;
      const kept = await keepFile(asset.uri, "source");
      const aspect = asset.width && asset.height ? asset.width / asset.height : 1;
      setImage((prev) => {
        void dropFile(prev?.uri);
        return { uri: kept, aspect, position: prev?.position ?? "top-right", size: prev?.size ?? "small", visible: true };
      });
    } catch {
      toastError(t("studioDeck.sources.failed"));
    }
  }, [t]);

  const updateImage = useCallback((change: Partial<Pick<ImageSourceConfig, "position" | "size" | "visible">>) => {
    setImage((prev) => (prev ? { ...prev, ...change } : prev));
  }, []);
  const setImagePosition = useCallback((position: SourcePosition) => updateImage({ position }), [updateImage]);
  const setImageSize = useCallback((size: SourceSize) => updateImage({ size }), [updateImage]);
  const setImageVisible = useCallback((visible: boolean) => updateImage({ visible }), [updateImage]);
  const removeImage = useCallback(() => {
    setImage((prev) => {
      void dropFile(prev?.uri);
      return null;
    });
  }, []);

  // ── Overlay: the placed image and the widgets, painted together ──

  const overlayState = useRef({ key: "", busy: false, shown: false });
  useEffect(() => {
    if (!supported || !painter) return;
    const paint = painter;
    if (!overlayOn) {
      if (overlayState.current.shown) {
        overlayState.current = { key: "", busy: false, shown: false };
        void nativeSetOverlay(null).catch(() => undefined);
      }
      return;
    }
    let cancelled = false;
    const portrait = frame.height > frame.width;
    const rect = image ? placeSource(image.position, image.size, image.aspect, frame.width / frame.height) : null;

    const tick = async () => {
      const state = overlayState.current;
      if (state.busy || cancelled) return;
      const now = Date.now();
      const drawings = widgetsInVideo ? board.frame(now, portrait) : [];
      const key = `${frame.width}x${frame.height}|${imageOn && image ? `${image.uri}|${JSON.stringify(rect)}` : ""}|${drawingsKey(drawings)}`;
      if (key === state.key) return;
      state.busy = true;
      try {
        const img = imageOn && image && rect ? await paint.loadImage(image.uri) : null;
        const path = await paint.renderOverlay({ image: img && rect ? { image: img, rect } : null, drawings }, frame);
        if (cancelled) {
          void paint.deleteStudioFile(path);
          return;
        }
        await nativeSetOverlay(path);
        void paint.deleteStudioFile(path);
        state.key = key;
        state.shown = path != null;
      } catch {
        // Try again on the next tick.
      } finally {
        state.busy = false;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), OVERLAY_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      overlayState.current.key = "";
    };
  }, [supported, overlayOn, frame, image, imageOn, widgetsInVideo, board]);

  // Nothing outlives the producer.
  useEffect(
    () => () => {
      void resetStudio().catch(() => undefined);
    },
    [],
  );

  const chain = useMemo(
    () => ({ supported, background: backgroundOn, overlay: cardOn || overlayOn }),
    [supported, backgroundOn, cardOn, overlayOn],
  );

  return {
    supported,
    backgroundSupported,
    chain,
    /** A card or an overlay is being drawn into the picture: the preview must not be mirrored. */
    compositing: cardOn || overlayOn,
    /** Anything the studio does is on, for the toolbar button's state. */
    anyOn,
    scene,
    setScene,
    countdownMinutes,
    setCountdownMinutes,
    background,
    setBackgroundMode,
    setBackgroundColor,
    pickBackground,
    image,
    pickImage,
    setImagePosition,
    setImageSize,
    setImageVisible,
    removeImage,
    widgetsAvailable: !!myOverlay,
    widgetsInVideo,
    widgetsBusy,
    setWidgetsInVideo,
  };
}

export type PhoneStudio = ReturnType<typeof usePhoneStudio>;
