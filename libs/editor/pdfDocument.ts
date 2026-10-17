import { designPrintDpi } from "./documentDimensions";
import { designPageLinkIndex, normaliseDesignLink, type DesignPdfLink } from "./designLinks";
/** Image-backed PDF pages preserve the editor's composited appearance without external services. */
export interface PdfPage { cropMarks?: boolean; dpi?: number; jpeg: Uint8Array; width: number; height: number; designWidth?: number; designHeight?: number; links?: DesignPdfLink[] }
export const PDF_DOCUMENT_LIMIT = 256 * 1024 * 1024;
export interface PdfDocumentOptions { title?: string; pageTitles?: readonly string[]; pageSections?: readonly string[]; pageLabels?: readonly string[]; bookmarks?: boolean }
const bytes = (text: string) => Uint8Array.from(text, c => c.charCodeAt(0) & 255);
function pdfUnicode(value: string, limit = 500): string {
  let result = "<FEFF";
  let count = 0;
  for (const character of typeof value === "string" ? value : "") {
    if (count++ >= limit) break;
    if (character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff) { result += "FFFD"; continue; }
    for (let index = 0; index < character.length; index++) result += character.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return result + ">";
}

/** Stream a standards-based PDF with one JPEG XObject per page and byte-accurate xref offsets. */
export async function writePdfDocument(count: number, pageAt: (index: number) => Promise<PdfPage>,
  write: (value: Uint8Array) => void | Promise<void>, signal?: AbortSignal, pageIndexes?: readonly number[], options: PdfDocumentOptions = {}): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("PDF supports between 1 and 500 pages");
  let position = 0;
  const destinations = new Map((pageIndexes ?? Array.from({ length: count }, (_, index) => index)).map((page, index) => [page, 3 + index * 3]));
  const offsets = [0];
  let nextObject = 3 + count * 3;
  const outlineRoot = options.bookmarks && count > 1 ? nextObject++ : null;
  const outlineItems = outlineRoot ? Array.from({ length: count }, () => nextObject++) : [];
  const outlineGroups: { id: number; title: string; indexes: number[] }[] = [], topLevel: number[] = [], parents = new Map<number, number>();
  if (outlineRoot) {
    let group: typeof outlineGroups[number] | null = null;
    for (let index = 0; index < count; index++) {
      const section = typeof options.pageSections?.[index] === "string" ? options.pageSections[index].trim().slice(0, 80) : "";
      if (!section) { topLevel.push(outlineItems[index]); group = null; continue; }
      if (!group || group.title !== section) { group = { id: nextObject++, title: section, indexes: [] }; outlineGroups.push(group); topLevel.push(group.id); }
      group.indexes.push(index); parents.set(index, group.id);
    }
  }
  const info = typeof options.title === "string" && options.title.trim() ? nextObject++ : null;
  const check = () => { if (signal?.aborted) { const e = new Error("PDF export cancelled"); e.name = "AbortError"; throw e; } };
  const emit = async (value: Uint8Array) => {
    check();
    if (position + value.length > PDF_DOCUMENT_LIMIT) throw new Error("PDF exceeds 256 MiB");
    await write(value); position += value.length;
  };
  const text = async (value: string) => emit(bytes(value));
  const object = async (id: number, value: string) => {
    offsets[id] = position;
    await text(`${id} 0 obj\n${value}\nendobj\n`);
  };
  await text("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const labels = options.pageLabels?.length === count ? ` /PageLabels << /Nums [${options.pageLabels.map((label, index) => `${index} << /P ${pdfUnicode(label, 200)} >>`).join(" ")}] >>` : "";
  await object(1, `<< /Type /Catalog /Pages 2 0 R${outlineRoot ? ` /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines` : ""}${labels}${info ? " /ViewerPreferences << /DisplayDocTitle true >>" : ""} >>`);
  await object(2, `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);
  for (let index = 0; index < count; index++) {
    check();
    const page = await pageAt(index);
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width < 1 || page.height < 1 ||
      page.width > 32768 || page.height > 32768 || page.jpeg.length < 4 || page.jpeg[0] !== 255 || page.jpeg[1] !== 216) throw new Error("Invalid PDF page image");
    const id = 3 + index * 3;
    const designWidth = page.designWidth ?? page.width, designHeight = page.designHeight ?? page.height;
    if (!Number.isFinite(designWidth) || !Number.isFinite(designHeight) || designWidth <= 0 || designHeight <= 0) throw new Error("Invalid PDF page size");
    const dpi = page.dpi ?? designPrintDpi({ width: designWidth, height: designHeight });
    if (!Number.isInteger(dpi) || dpi < 72 || dpi > 600) throw new Error("Invalid PDF print resolution");
    const width = Number((designWidth * 72 / dpi).toFixed(3)), height = Number((designHeight * 72 / dpi).toFixed(3));
    const margin = page.cropMarks ? 18 : 0;
    const links = (page.links ?? []).slice(0, 500).flatMap(link => {
      const url = normaliseDesignLink(link.url);
      if (!url || ![link.x, link.y, link.width, link.height].every(Number.isFinite) || link.width <= 0 || link.height <= 0) return [];
      const target = designPageLinkIndex(url), destination = target === null ? undefined : destinations.get(target);
      if (target !== null && destination === undefined) return [];
      const left = Math.max(0, Math.min(1, link.x)), right = Math.max(0, Math.min(1, link.x + link.width));
      const top = Math.max(0, Math.min(1, link.y)), bottom = Math.max(0, Math.min(1, link.y + link.height));
      if (right <= left || bottom <= top) return [];
      return [{ id: nextObject++, action: destination === undefined ? `/S /URI /URI (${url.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})` : `/S /GoTo /D [${destination} 0 R /Fit]`, rect: [left * width + margin, (1 - bottom) * height + margin, right * width + margin, (1 - top) * height + margin].map(n => Number(n.toFixed(3))).join(" ") }];
    });
    const annotations = links.length ? ` /Annots [${links.map(link => `${link.id} 0 R`).join(" ")}]` : "";
    await object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width + margin * 2} ${height + margin * 2}] /TrimBox [${margin} ${margin} ${width + margin} ${height + margin}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R${annotations} >>`);
    offsets[id + 1] = position;
    await text(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    await emit(page.jpeg);
    await text("\nendstream\nendobj\n");
    let content = `q\n${width} 0 0 ${height} ${margin} ${margin} cm\n/Im0 Do\nQ\n`;
    if (margin) {
      content += "q\n0 0 0 RG\n0.25 w\n";
      for (const y of [margin, height + margin]) for (const [a, b] of [[3, margin - 3], [width + margin + 3, width + margin * 2 - 3]]) content += `${a} ${y} m ${b} ${y} l S\n`;
      for (const x of [margin, width + margin]) for (const [a, b] of [[3, margin - 3], [height + margin + 3, height + margin * 2 - 3]]) content += `${x} ${a} m ${x} ${b} l S\n`;
      content += "Q\n";
    }
    await object(id + 2, `<< /Length ${bytes(content).length} >>\nstream\n${content}endstream`);
    for (const link of links) await object(link.id, `<< /Type /Annot /Subtype /Link /Rect [${link.rect}] /Border [0 0 0] /A << ${link.action} >> >>`);
  }
  if (outlineRoot) {
    const siblingLinks = (id: number, siblings: readonly number[]) => { const position = siblings.indexOf(id); return `${position > 0 ? ` /Prev ${siblings[position - 1]} 0 R` : ""}${position + 1 < siblings.length ? ` /Next ${siblings[position + 1]} 0 R` : ""}`; };
    await object(outlineRoot, `<< /Type /Outlines /First ${topLevel[0]} 0 R /Last ${topLevel[topLevel.length - 1]} 0 R /Count ${count + outlineGroups.length} >>`);
    for (const group of outlineGroups) {
      const children = group.indexes.map(index => outlineItems[index]);
      await object(group.id, `<< /Title ${pdfUnicode(group.title, 80)} /Parent ${outlineRoot} 0 R /Dest [${3 + group.indexes[0] * 3} 0 R /Fit] /First ${children[0]} 0 R /Last ${children[children.length - 1]} 0 R /Count ${children.length}${siblingLinks(group.id, topLevel)} >>`);
    }
    for (let index = 0; index < count; index++) {
      const candidate = options.pageTitles?.[index];
      const title = typeof candidate === "string" && candidate.trim() ? candidate.trim() : `Page ${(pageIndexes?.[index] ?? index) + 1}`;
      const parent = parents.get(index) ?? outlineRoot, group = outlineGroups.find(group => group.id === parent), siblings = group ? group.indexes.map(index => outlineItems[index]) : topLevel;
      await object(outlineItems[index], `<< /Title ${pdfUnicode(title, 200)} /Parent ${parent} 0 R /Dest [${3 + index * 3} 0 R /Fit]${siblingLinks(outlineItems[index], siblings)} >>`);
    }
  }
  if (info) await object(info, `<< /Title ${pdfUnicode(options.title!.trim())} >>`);
  const xref = position, size = nextObject;
  await text(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let id = 1; id < size; id++) await text(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  await text(`trailer\n<< /Size ${size} /Root 1 0 R${info ? ` /Info ${info} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`);
}
