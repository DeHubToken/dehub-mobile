import type { BulkConnections, BulkField, BulkPageFields } from "./bulkCreate";
import type { Clip, MediaClip, ShapeClip } from "./types";
type Target = "text" | "image" | "link";
interface Binding { target: Target; name: string; column: string }
export interface BulkConnectionProfile { kind: "dehub-bulk-connections"; version: 1; name: string; bindings: Binding[]; pageFields: BulkPageFields }
export interface BulkConnectionContext {
  headers: readonly string[]; fields: readonly BulkField[]; images: readonly (MediaClip | ShapeClip)[]; links: readonly Clip[];
  connections: BulkConnections; imageConnections: BulkConnections; linkConnections: BulkConnections; pageFields: BulkPageFields;
}
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, " ");
const layerName = (clip: Clip) => clip.label?.trim() || (clip.kind === "text" && !/\{\{/.test(clip.text) ? clip.text.trim() : "");
const boundedName = (value: unknown, maximum: number): value is string => typeof value === "string" && !!value.trim() && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
export function captureBulkConnectionProfile(context: BulkConnectionContext, name: string): BulkConnectionProfile {
  const bindings: Binding[] = [], seen = new Set<string>();
  for (const [target, fields, connections] of [["text", context.fields, context.connections], ["image", context.images, context.imageConnections], ["link", context.links, context.linkConnections]] as const) {
    for (const clip of fields) {
      const column = connections[clip.id]; if (!context.headers.includes(column)) continue;
      const label = layerName(clip);
      if (!boundedName(label, 200)) throw new Error("Name each connected layer with up to 200 printable characters before saving its setup");
      const key = target + ":" + normalize(label);
      if (seen.has(key)) throw new Error("Give connected layers unique names before saving their connection setup");
      seen.add(key); bindings.push({ target, name: label, column });
    }
  }
  const pageFields: BulkPageFields = {};
  for (const key of ["titleColumn", "notesColumn", "sectionColumn"] as const) { const column = context.pageFields[key]; if (column && context.headers.includes(column)) pageFields[key] = column; }
  if (!bindings.length && !Object.keys(pageFields).length) throw new Error("Connect named layers or page fields before saving a setup");
  if (bindings.length > 600) throw new Error("Save up to 600 layer connections in one setup");
  return { kind: "dehub-bulk-connections", version: 1, name: name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || "Bulk connections", bindings, pageFields };
}
export function bulkConnectionProfileFile(context: BulkConnectionContext, name: string): string {
  const source = JSON.stringify(captureBulkConnectionProfile(context, name), null, 2) + "\n";
  let bytes = 0;
  for (const character of source) { const point = character.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4; }
  if (bytes > 131072) throw new Error("Keep the connection setup within 128 KB");
  return source;
}
export function parseBulkConnectionProfile(source: string): BulkConnectionProfile {
  if (source.length > 131072) throw new Error("Choose a connection setup smaller than 128 KB");
  let value: unknown; try { value = JSON.parse(source.replace(/^\uFEFF/, "")); } catch { throw new Error("Choose an exported bulk connection JSON file"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose an exported bulk connection setup");
  const profile = value as BulkConnectionProfile;
  if (profile.kind !== "dehub-bulk-connections" || profile.version !== 1 || !boundedName(profile.name, 80) || !Array.isArray(profile.bindings) || profile.bindings.length > 600 || !profile.pageFields || typeof profile.pageFields !== "object" || Array.isArray(profile.pageFields)) throw new Error("Choose a supported bulk connection setup");
  const seen = new Set<string>();
  const bindings = profile.bindings.map(binding => {
    if (!binding || !["text", "image", "link"].includes(binding.target) || !boundedName(binding.name, 200) || !boundedName(binding.column, 100)) throw new Error("This setup contains invalid layer or column names");
    const key = binding.target + ":" + normalize(binding.name); if (seen.has(key)) throw new Error("This setup contains duplicate layer bindings"); seen.add(key);
    return { target: binding.target, name: binding.name, column: binding.column };
  });
  const pageFields: BulkPageFields = {};
  for (const key of ["titleColumn", "notesColumn", "sectionColumn"] as const) { const column = profile.pageFields[key]; if (column !== undefined) { if (!boundedName(column, 100)) throw new Error("This setup contains an invalid page-field column"); pageFields[key] = column; } }
  return { kind: "dehub-bulk-connections", version: 1, name: profile.name, bindings, pageFields };
}
export function planBulkConnectionProfile(profile: BulkConnectionProfile, context: BulkConnectionContext) {
  const connections = { ...context.connections }, imageConnections = { ...context.imageConnections }, linkConnections = { ...context.linkConnections }, pageFields = { ...context.pageFields };
  let matched = 0, missingLayers = 0, missingColumns = 0, ambiguous = 0;
  const columnFor = (name: string): string | undefined => {
    if (context.headers.includes(name)) return name;
    const matches = context.headers.filter(header => normalize(header) === normalize(name));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) ambiguous++; else missingColumns++;
    return undefined;
  };
  for (const binding of profile.bindings) {
    const column = columnFor(binding.column); if (!column) continue;
    const fields = binding.target === "text" ? context.fields : binding.target === "image" ? context.images : context.links;
    const layers = fields.filter(clip => normalize(layerName(clip)) === normalize(binding.name));
    if (layers.length !== 1) { if (layers.length) ambiguous++; else missingLayers++; continue; }
    (binding.target === "text" ? connections : binding.target === "image" ? imageConnections : linkConnections)[layers[0].id] = column; matched++;
  }
  for (const key of ["titleColumn", "notesColumn", "sectionColumn"] as const) { const name = profile.pageFields[key]; if (name) { const column = columnFor(name); if (column) { pageFields[key] = column; matched++; } } }
  return { connections, imageConnections, linkConnections, pageFields, matched, missingLayers, missingColumns, ambiguous };
}
