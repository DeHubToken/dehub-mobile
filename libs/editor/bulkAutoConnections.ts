import type { BulkConnections, BulkField } from "./bulkCreate";
import type { MediaClip, ShapeClip } from "./types";
export interface BulkConnectionProposal { id: string; name: string; column: string; image: boolean }
export function proposeBulkConnections(headers: readonly string[], fields: readonly BulkField[], images: readonly (MediaClip | ShapeClip)[], connections: BulkConnections, imageConnections: BulkConnections, includePhotos: boolean, matchText: boolean): { proposals: BulkConnectionProposal[]; ambiguous: number } {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  const columns = new Map<string, string[]>();
  for (const header of headers) { const key = normalize(header), previous = columns.get(key) ?? []; columns.set(key, [...previous, header]); }
  const proposals: BulkConnectionProposal[] = [];
  let ambiguous = 0;
  const add = (field: BulkField | MediaClip | ShapeClip, image: boolean) => {
    const current = (image ? imageConnections : connections)[field.id];
    if (current && headers.includes(current)) return;
    if (!image && field.kind === "text" && /\{\{[^{}]+\}\}/.test(field.text)) return;
    if (!image && field.kind === "shape" && field.qr && /\{\{[^{}]+\}\}/.test(field.qr.content)) return;
    const candidates = [field.label ?? "", ...(!image && matchText && field.kind === "text" ? [field.text] : [])].filter(value => value.trim());
    const matches = [...new Set(candidates.flatMap(value => columns.get(normalize(value)) ?? []))];
    if (matches.length > 1) { ambiguous++; return; }
    if (matches.length === 1) proposals.push({ id: field.id, name: field.label || (field.kind === "text" ? field.text : image ? "Photo frame" : "QR code"), column: matches[0], image });
  };
  fields.forEach(field => add(field, false));
  if (includePhotos) images.forEach(field => add(field, true));
  return { proposals, ambiguous };
}

export function applyBulkConnectionProposals(proposals: readonly BulkConnectionProposal[], connections: BulkConnections, images: BulkConnections): { connections: BulkConnections; images: BulkConnections } {
  const next = { ...connections }, imageConnections = { ...images };
  for (const proposal of proposals) (proposal.image ? imageConnections : next)[proposal.id] = proposal.column;
  return { connections: next, images: imageConnections };
}
