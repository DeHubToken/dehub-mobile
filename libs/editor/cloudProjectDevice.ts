import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { cloudProjectApi } from "./cloudProjectApi";
import { cloudProjectSession, type CloudProjectLink } from "./cloudProjectSession";
import { getMedia, mediaFileUri, saveProject, MAX_MEDIA_BYTES } from "./storage";
import type { CloudProjectMedia } from "./cloudProjectFormat";

const root = () => `${FileSystem.documentDirectory}editor/`;
async function ensure(dir: string) { if (!(await FileSystem.getInfoAsync(dir)).exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); }
function extension(name: string, mime: string): string {
  return /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase()
    || ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" }[mime]) || "mp4";
}
export function nativeCloudProjectSession(address: string, check: () => void) {
  const wallet = address.toLowerCase(), api = cloudProjectApi(wallet);
  const linkDir = () => `${root()}cloud/${wallet}/`;
  const linkPath = (id: string) => { if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid local project ID"); return `${linkDir()}${id}.json`; };
  return { api, uuid: () => Crypto.randomUUID(), session: cloudProjectSession({ wallet, check, api, uuid: () => Crypto.randomUUID(), saveLocal: saveProject,
    readLink: async id => { try { return JSON.parse(await FileSystem.readAsStringAsync(linkPath(id))) as CloudProjectLink; } catch { return null; } },
    writeLink: async (id, link) => {
      await ensure(linkDir());
      await FileSystem.writeAsStringAsync(linkPath(id), JSON.stringify(link));
    },
    upload: async (localId, cloudId, guard, shared) => {
      const meta = await getMedia(localId); guard();
      if (!meta) throw new Error("A project source is missing from this device");
      const uri = mediaFileUri(meta), info = await FileSystem.getInfoAsync(uri); guard();
      if (!info.exists || info.isDirectory || !info.size) throw new Error("A project source is missing from this device");
      const slot = await (shared ? api.editing.prepareMedia(shared.owner, shared.projectId, cloudId, info.size, extension(meta.file || meta.name, meta.mimeType)) : api.prepareMedia(cloudId, info.size, extension(meta.file || meta.name, meta.mimeType))); guard();
      // Stream disk bytes to the signed endpoint; images and masks retain their exact pixels.
      const response = await FileSystem.uploadAsync(slot.signedUrl, uri, { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": meta.mimeType, "x-upsert": "false" } }); guard();
      if (response.status < 200 || response.status >= 300) throw new Error("A project source could not be uploaded");
      const source: CloudProjectMedia = { id: cloudId, storagePath: slot.path, name: meta.name, kind: meta.kind, mimeType: meta.mimeType, size: info.size, provenance: meta.provenance };
      for (const field of ["width", "height", "duration"] as const) if ((meta[field] || 0) > 0) source[field] = meta[field];
      return source;
    },
    hydrate: async (source, guard, sourceOwner = wallet) => {
      if (source.size > MAX_MEDIA_BYTES) throw new Error("This project source exceeds the phone editor's file limit");
      const meta = await getMedia(source.id); guard();
      if (meta) { const info = await FileSystem.getInfoAsync(mediaFileUri(meta)); guard(); if (info.exists && !info.isDirectory && info.size === source.size) return; }
      const dir = `${root()}media/`; await ensure(dir); guard();
      const ext = source.storagePath.split(".").pop()!, file = `${source.id}.${ext}`;
      const temp = `${dir}${Crypto.randomUUID()}.tmp`;
      try {
        const url = await api.sourceUrl(source.storagePath, sourceOwner); guard();
        const result = await FileSystem.downloadAsync(url, temp); guard();
        const info = await FileSystem.getInfoAsync(temp); guard();
        if (result.status !== 200 || !info.exists || info.isDirectory || info.size !== source.size) throw new Error("A saved project source is incomplete");
        await FileSystem.moveAsync({ from: temp, to: `${dir}${file}` }); guard();
        const { storagePath: _path, ...fields } = source;
        await FileSystem.writeAsStringAsync(`${dir}${source.id}.json`, JSON.stringify({ ...fields, width: source.width || 0, height: source.height || 0, file, createdAt: Date.now() })); guard();
      } finally { await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {}); }
    },
  }) };
}
