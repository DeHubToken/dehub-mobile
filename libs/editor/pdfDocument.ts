/** Image-backed PDF pages preserve the editor's composited appearance without external services. */
export interface PdfPage { jpeg: Uint8Array; width: number; height: number }
export const PDF_DOCUMENT_LIMIT = 256 * 1024 * 1024;
const bytes = (text: string) => Uint8Array.from(text, c => c.charCodeAt(0) & 255);

/** Stream a standards-based PDF with one JPEG XObject per page and byte-accurate xref offsets. */
export async function writePdfDocument(count: number, pageAt: (index: number) => Promise<PdfPage>,
  write: (value: Uint8Array) => void | Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("PDF supports between 1 and 500 pages");
  let position = 0;
  const offsets = [0];
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
  await object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  await object(2, `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);
  for (let index = 0; index < count; index++) {
    check();
    const page = await pageAt(index);
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width < 1 || page.height < 1 ||
      page.width > 32768 || page.height > 32768 || page.jpeg.length < 4 || page.jpeg[0] !== 255 || page.jpeg[1] !== 216) throw new Error("Invalid PDF page image");
    const id = 3 + index * 3;
    // A4's print preset is 300 dpi; screen designs use 96 dpi.
    const dpi = (page.width === 2480 && page.height === 3508) || (page.height === 2480 && page.width === 3508) ? 300 : 96;
    const width = Number((page.width * 72 / dpi).toFixed(3)), height = Number((page.height * 72 / dpi).toFixed(3));
    await object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    offsets[id + 1] = position;
    await text(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    await emit(page.jpeg);
    await text("\nendstream\nendobj\n");
    const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
    await object(id + 2, `<< /Length ${bytes(content).length} >>\nstream\n${content}endstream`);
  }
  const xref = position, size = 3 + count * 3;
  await text(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let id = 1; id < size; id++) await text(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  await text(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
