import { useEffect, useRef, useState } from "react";
import { requestDesignPagePreview } from "./designPagePreviews";
import { putMockupTemplate, type MockupTemplateId } from "./mockupTemplates";
import type { MediaClip, ProjectSnapshot, ProjectSettings } from "./types";
export interface MockupPreviewContent { body: string; edge: string; caption: string; usePhoto: boolean; size?: number; rotation?: number; screen?: string; fit?: "fill" | "fit"; fontFamily?: string }
export type MockupMediaReader = (id: string) => Promise<{ width?: number; height?: number } | null | undefined>;
export function useMockupPreview(projectId: string, settings: ProjectSettings, source: MediaClip | null, preset: MockupTemplateId, value: MockupPreviewContent | null, readMedia: MockupMediaReader, enabled: boolean) {
  const [result, setResult] = useState<{ image: string | null; busy: boolean; unavailable: boolean }>({ image: null, busy: false, unavailable: false });
  const dimensions = useRef(new Map<string, { width: number; height: number }>());
  useEffect(() => {
    if (!enabled || !value) { setResult({ image: null, busy: false, unavailable: false }); return; }
    const controller = new AbortController(); setResult(previous => ({ ...previous, busy: true, unavailable: false }));
    const timeout = setTimeout(() => { controller.abort(); setResult({ image: null, busy: false, unavailable: true }); }, 10000);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const photo = value.usePhoto ? source : null;
          let size = photo ? dimensions.current.get(photo.mediaId) : undefined;
          if (photo && !size) { const media = await readMedia(photo.mediaId); if (controller.signal.aborted) return; if (!media?.width || !media.height) throw new Error("Photo dimensions are unavailable"); size = { width: media.width, height: media.height }; if (dimensions.current.size >= 8) dimensions.current.clear(); dimensions.current.set(photo.mediaId, size); }
          const snapshot: ProjectSnapshot = { id: projectId, title: "Mockup preview", updatedAt: 0, settings: { ...settings, pages: [0], pageEnd: 5 }, tracks: photo ? [{ id: photo.trackId, kind: "video", name: "Photo source", muted: false, hidden: false }] : [], clips: photo ? [{ ...photo, start: 0, duration: 5, locked: false, hidden: false }] : [] };
          const used = new Set([...(photo ? [photo.id, photo.trackId, photo.groupId ?? ""] : [])]); let serial = 0;
          const makeId = () => { let id: string; do { id = "mockup-preview-" + (++serial); } while (used.has(id)); used.add(id); return id; };
          const mockup = putMockupTemplate(snapshot, 0, preset, { body: value.body, edge: value.edge, caption: value.caption, size: value.size, rotation: value.rotation, screen: value.screen, fit: value.fit, fontFamily: value.fontFamily, photo: photo && size ? { clipId: photo.id, mediaId: photo.mediaId, ...size } : undefined }, makeId);
          const clips = mockup.project.clips.filter(clip => !photo || clip.id !== photo.id), tracks = new Set(clips.map(clip => clip.trackId)), preview = { ...mockup.project, clips, tracks: mockup.project.tracks.filter(track => tracks.has(track.id)) };
          const image = await requestDesignPagePreview(preview, 0, 512, controller.signal);
          if (!controller.signal.aborted) setResult({ image, busy: false, unavailable: false });
        } catch { if (!controller.signal.aborted) setResult({ image: null, busy: false, unavailable: true }); }
        finally { clearTimeout(timeout); }
      })();
    }, 350);
    return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [projectId, settings, source, preset, value, readMedia, enabled]);
  return result;
}
