/**
 * Timeline handoff to Premiere Pro, Final Cut Pro and DaVinci Resolve.
 * Writes FCPXML 1.10 (Final Cut, Resolve) and XMEML v4 (Premiere, Resolve)
 * that point at the media files bundled beside them in media/.
 * Text and shapes travel as timeline markers; effects stay in DeHub.
 */
import type { Clip, MediaClip, ProjectSnapshot } from "./types";

export interface NleMedia { id: string; name: string; kind: "video" | "audio" | "image"; duration?: number; width?: number; height?: number }
export interface NleFiles { fcpxml: string; premiere: string; mediaNames: Record<string, string> }

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STILL_SECONDS = 3600;

/** Unique, path-safe file names, keeping each original extension. */
export function nleMediaNames(media: NleMedia[]): Record<string, string> {
  const used = new Set<string>(), names: Record<string, string> = {};
  for (const item of media) {
    const clean = item.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || `${item.kind}-${item.id}`;
    const dot = clean.lastIndexOf(".");
    const stem = dot > 0 ? clean.slice(0, dot) : clean, ext = dot > 0 ? clean.slice(dot) : "";
    let name = clean, n = 2;
    while (used.has(name.toLowerCase())) name = `${stem} (${n++})${ext}`;
    used.add(name.toLowerCase()); names[item.id] = name;
  }
  return names;
}

function textOf(clip: Clip) {
  if (clip.kind === "text") return clip.text.replace(/\s+/g, " ").trim();
  return clip.label || clip.kind;
}

export function nleExport(snapshot: ProjectSnapshot, media: NleMedia[]): NleFiles {
  const fps = Math.max(1, Math.round(snapshot.settings.fps || 30));
  const frames = (seconds: number) => Math.max(0, Math.round(seconds * fps));
  const rt = (seconds: number) => `${frames(seconds) * 100}/${fps * 100}s`;
  const byId = new Map(media.map(m => [m.id, m]));
  const used = media.filter(m => snapshot.clips.some(c => "mediaId" in c && c.mediaId === m.id));
  const names = nleMediaNames(used);
  const hidden = new Set(snapshot.tracks.filter(t => t.hidden).map(t => t.id));
  const mutedTracks = new Set(snapshot.tracks.filter(t => t.muted).map(t => t.id));
  const mediaClips = snapshot.clips.filter((c): c is MediaClip => "mediaId" in c && byId.has(c.mediaId) && !hidden.has(c.trackId) && !c.hidden);
  const notes = snapshot.clips.filter(c => (c.kind === "text" || c.kind === "shape") && !hidden.has(c.trackId) && !c.hidden);
  const total = snapshot.clips.reduce((end, c) => Math.max(end, c.start + c.duration), 0);
  const { width, height } = snapshot.settings;
  const speedOf = (c: MediaClip) => (c.kind !== "image" && c.speed && c.speed > 0 ? c.speed : 1);
  const sourceLength = (m: NleMedia) => m.kind === "image" ? STILL_SECONDS : Math.max(m.duration ?? 0, 0.04);
  const visualTracks = snapshot.tracks.filter(t => t.kind !== "audio").map(t => t.id);
  const audioTracks = snapshot.tracks.filter(t => t.kind === "audio").map(t => t.id);
  const isAudio = (c: MediaClip) => c.kind === "audio" || audioTracks.includes(c.trackId);

  // ── FCPXML ──
  const assetIds = new Map(used.map((m, i) => [m.id, `a${i + 2}`]));
  const assets = used.map(m => `    <asset id="${assetIds.get(m.id)}" name="${esc(m.name)}" start="0s" duration="${rt(sourceLength(m))}" hasVideo="${m.kind === "audio" ? 0 : 1}" hasAudio="${m.kind === "image" ? 0 : 1}" format="r1"${m.kind === "image" ? "" : ` audioSources="1" audioChannels="2"`}>\n      <media-rep kind="original-media" src="./media/${encodeURI(names[m.id])}"/>\n    </asset>`).join("\n");
  const connected = mediaClips.map(c => {
    const lane = isAudio(c) ? -(audioTracks.indexOf(c.trackId) + 1 || 1) : visualTracks.indexOf(c.trackId) + 1 || 1;
    const speed = speedOf(c);
    const timeMap = speed !== 1 ? `\n          <timeMap><timept time="0s" value="${rt(c.trimIn)}" interp="linear"/><timept time="${rt(c.duration)}" value="${rt(c.trimIn + c.duration * speed)}" interp="linear"/></timeMap>` : "";
    const volume = c.audio && c.audio.volume !== undefined && c.audio.volume !== 1 ? `\n          <adjust-volume amount="${(c.audio.volume <= 0 ? -96 : 20 * Math.log10(c.audio.volume)).toFixed(1)}dB"/>` : "";
    const muted = mutedTracks.has(c.trackId) ? `\n          <adjust-volume amount="-96dB"/>` : "";
    const body = timeMap + (muted || volume);
    return `        <asset-clip ref="${assetIds.get(c.mediaId)}" lane="${lane}" offset="${rt(c.start)}" name="${esc(byId.get(c.mediaId)!.name)}" start="${rt(speed === 1 ? c.trimIn : 0)}" duration="${rt(c.duration)}"${body ? `>${body}\n        </asset-clip>` : "/>"}`;
  }).join("\n");
  const markers = notes.map(c => `        <marker start="${rt(c.start)}" duration="${rt(Math.max(c.duration, 1 / fps))}" value="${esc(textOf(c).slice(0, 200))}"/>`).join("\n");
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormatRateUndefined" frameDuration="100/${fps * 100}s" width="${width}" height="${height}"/>
${assets}
  </resources>
  <library>
    <event name="DeHub">
      <project name="${esc(snapshot.title || "DeHub project")}">
        <sequence format="r1" duration="${rt(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <gap name="Timeline" offset="0s" start="0s" duration="${rt(total)}">
${[connected, markers].filter(Boolean).join("\n").replace(/^ {8}/gm, "              ")}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;

  // ── XMEML (Premiere) ──
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const declared = new Set<string>();
  const fileXml = (m: NleMedia) => {
    const id = `file-${assetIds.get(m.id)}`;
    if (declared.has(id)) return `<file id="${id}"/>`;
    declared.add(id);
    const tracks = `${m.kind !== "audio" ? `<video><samplecharacteristics><width>${m.width ?? width}</width><height>${m.height ?? height}</height></samplecharacteristics></video>` : ""}${m.kind !== "image" ? "<audio><channelcount>2</channelcount></audio>" : ""}`;
    return `<file id="${id}"><name>${esc(names[m.id])}</name><pathurl>media/${encodeURI(names[m.id])}</pathurl>${rate}<duration>${frames(sourceLength(m))}</duration><media>${tracks}</media></file>`;
  };
  let item = 0;
  const clipItem = (c: MediaClip) => {
    const m = byId.get(c.mediaId)!, speed = speedOf(c);
    const filter = speed !== 1 ? `<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>speed</parameterid><name>speed</name><value>${(speed * 100).toFixed(2)}</value></parameter></effect></filter>` : "";
    return `<clipitem id="clipitem-${++item}"><name>${esc(m.name)}</name><enabled>TRUE</enabled><duration>${frames(sourceLength(m))}</duration>${rate}<start>${frames(c.start)}</start><end>${frames(c.start + c.duration)}</end><in>${frames(c.trimIn)}</in><out>${frames(c.trimIn + c.duration * speed)}</out>${fileXml(m)}${filter}</clipitem>`;
  };
  const trackXml = (ids: string[], audio: boolean) => ids.map(id => {
    const clips = mediaClips.filter(c => c.trackId === id && isAudio(c) === audio).sort((a, b) => a.start - b.start);
    return clips.length ? `<track>${clips.map(clipItem).join("")}</track>` : "";
  }).filter(Boolean).join("\n");
  const premiereMarkers = notes.map(c => `<marker><name>${esc(textOf(c).slice(0, 200))}</name><in>${frames(c.start)}</in><out>${frames(c.start + c.duration)}</out></marker>`).join("");
  const premiere = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1"><name>${esc(snapshot.title || "DeHub project")}</name><duration>${frames(total)}</duration>${rate}
<media>
<video><format><samplecharacteristics>${rate}<width>${width}</width><height>${height}</height></samplecharacteristics></format>
${trackXml(visualTracks, false) || "<track/>"}
</video>
<audio>
${trackXml([...audioTracks, ...visualTracks], true) || "<track/>"}
</audio>
</media>
${premiereMarkers}
</sequence>
</xmeml>
`;
  return { fcpxml, premiere, mediaNames: names };
}
