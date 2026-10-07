import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { useTranslation } from "react-i18next";
import type { EditorCanvasHandle } from "../components/editor/EditorCanvas";
import { downloadProject, type VideoDownloadRequest } from "../libs/editor/downloadProject";
import type { ProjectSnapshot } from "../libs/editor/types";
import { toastError, toastSuccess } from "../libs/toast";

const DownloadCanvas = lazy(() => import("../components/editor/EditorCanvas"));
const Context = createContext<(request: VideoDownloadRequest) => Promise<void>>(async () => { throw new Error("Video download renderer unavailable"); });
const noop = () => undefined;
const fontCss: string[] = [];
type SourceInfo = { duration?: number; width?: number; height?: number };

export function VideoDownloadProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const renderer = useRef<EditorCanvasHandle>(null);
  const active = useRef<AbortController | null>(null);
  const ready = useRef<{ id: string; resolve: (info: SourceInfo) => void; reject: (error: Error) => void } | null>(null);
  const transfer = useRef<ReturnType<typeof FileSystem.createDownloadResumable> | null>(null);
  const mounted = useRef(true);
  const cancel = useCallback(() => {
    active.current?.abort();
    void transfer.current?.cancelAsync().catch(() => undefined);
    renderer.current?.cancelExport();
    ready.current?.reject(Object.assign(new Error("Download cancelled"), { name: "AbortError" }));
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);

  const download = useCallback(async (request: VideoDownloadRequest) => {
    if (active.current || !request.url) return;
    const controller = new AbortController();
    active.current = controller;
    const cached = (FileSystem.cacheDirectory || "") + "video-download-" + Date.now() + ".mp4";
    let mediaId: string | null = null;
    let releaseMedia: ((id: string) => void) | null = null;
    let output: string | null = null;
    const check = () => { if (controller.signal.aborted) throw Object.assign(new Error("Download cancelled"), { name: "AbortError" }); };
    try {
      setProgress(0);
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      check();
      if (permission.status !== "granted") { toastError(t("editor.app.photosPermission")); return; }
      let source = request.url;
      let mime = "video/mp4";
      if (!source.startsWith("file://")) {
        const job = FileSystem.createDownloadResumable(source, cached, {}, (p) => {
          if (mounted.current && !controller.signal.aborted) setProgress(p.totalBytesExpectedToWrite > 0 ? 0.15 * p.totalBytesWritten / p.totalBytesExpectedToWrite : 0);
        });
        transfer.current = job;
        const result = await job.downloadAsync();
        check();
        if (!result || result.status < 200 || result.status >= 300) throw new Error("Video download failed");
        source = result.uri;
        mime = result.headers?.["Content-Type"] || result.headers?.["content-type"] || mime;
      }
      const { registerDownloadMedia, releaseDownloadMedia } = await import("../libs/editor/storage");
      releaseMedia = releaseDownloadMedia;
      check();
      const meta = registerDownloadMedia(source, request.title || "video", mime);
      mediaId = meta.id;
      const info = await new Promise<SourceInfo>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("Video metadata did not load")), 300000);
        const abort = () => finish(Object.assign(new Error("Download cancelled"), { name: "AbortError" }));
        const finish = (error?: Error, value?: SourceInfo) => {
          clearTimeout(timer); controller.signal.removeEventListener("abort", abort);
          ready.current = null;
          error ? reject(error) : resolve(value || {});
        };
        ready.current = { id: meta.id, resolve: (value) => finish(undefined, value), reject: (error) => finish(error) };
        controller.signal.addEventListener("abort", abort, { once: true });
        setProject(downloadProject(meta.id, { duration: 1, width: 2, height: 2 }, request.title));
        if (controller.signal.aborted) abort();
      });
      check();
      const snapshot = downloadProject(meta.id, info, request.title);
      if (!renderer.current) throw new Error("Video renderer unavailable");
      const out = await renderer.current.exportVideo({
        width: snapshot.settings.width, height: snapshot.settings.height, bitrate: 8_000_000,
        title: snapshot.title, username: request.username || "", snapshot, replaceEnding: true,
      }, (p) => { if (mounted.current && !controller.signal.aborted) setProgress(0.15 + p * 0.85); });
      output = out.uri;
      check();
      await MediaLibrary.saveToLibraryAsync(out.uri);
      toastSuccess(t("editor.app.savedToPhotos"));
    } catch (error) {
      if (!controller.signal.aborted && (error as Error).name !== "AbortError") toastError(t("editor.app.exportFailed"));
    } finally {
      ready.current = null; transfer.current = null;
      if (mediaId) releaseMedia?.(mediaId);
      if (active.current === controller) active.current = null;
      if (mounted.current) { setProject(null); setProgress(null); }
      await FileSystem.deleteAsync(cached, { idempotent: true }).catch(() => undefined);
      if (output) await FileSystem.deleteAsync(output, { idempotent: true }).catch(() => undefined);
    }
  }, [t]);
  return <Context.Provider value={download}>
    {children}
    {project && <View pointerEvents="none" style={styles.renderer}>
      <Suspense fallback={null}>
        <DownloadCanvas ref={renderer} project={project} time={0} fontCss={fontCss} selectedId={null}
          onSelect={noop} onLiveChange={noop} onGestureEnd={noop} onEditText={noop}
          onMediaReady={(id, info) => { if (ready.current?.id === id) ready.current.resolve(info); }}
          onMissingMedia={(ids) => { if (ready.current && ids.includes(ready.current.id)) ready.current.reject(new Error("Video source missing")); }} />
      </Suspense>
    </View>}
    <Modal visible={progress !== null} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}><View style={styles.panel}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.text}>{t("editor.video.rendering", { percent: Math.round((progress || 0) * 100) })}</Text>
        <Pressable onPress={cancel} accessibilityRole="button" style={styles.button}>
          <Text style={styles.text}>{t("common.cancel")}</Text>
        </Pressable>
      </View></View>
    </Modal>
  </Context.Provider>;
}
export const useVideoDownload = () => useContext(Context);
const styles = StyleSheet.create({
  renderer: { position: "absolute", left: -100, top: 0, width: 2, height: 2, opacity: 0 },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)" },
  panel: { padding: 24, gap: 18, alignItems: "center", backgroundColor: "#111", borderRadius: 20 },
  text: { color: "#fff", fontSize: 15 },
  button: { borderWidth: 1, borderColor: "#555", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
});
