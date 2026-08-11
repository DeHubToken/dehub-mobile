/**
 * Document attachments on `feed-file` posts.
 *
 * The allowlist mirrors `ALLOWED_DOCUMENT_TYPES` in the backend's
 * `src/cdn/cdn.service.ts` (and `src/lib/attachments.ts` on web). The backend is
 * the real gate — it re-validates every upload and stores objects with
 * `Content-Disposition: attachment` — so this copy exists to keep the picker
 * honest and to fail before a 50 MB upload rather than after it. Keep the three
 * in step: an extension added here but not on the server is rejected at mint.
 */

/** Extensions the backend accepts, in the order they appear in its table. */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md",
  ".xls", ".xlsx", ".ods", ".csv",
  ".ppt", ".pptx", ".odp",
  ".zip", ".rar", ".7z", ".gz",
  ".json", ".xml",
  ".epub",
];

/** Matches the backend's per-file cap. */
export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
/** Matches the backend's combined cap for one post. */
export const MAX_ATTACHMENTS_TOTAL_SIZE = 100 * 1024 * 1024;
/** Matches the backend's per-post file count cap. */
export const MAX_ATTACHMENTS = 5;

/** A document stored on a post, as returned by the API. */
export interface PostAttachment {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export function getAttachmentExtension(name: string): string {
  const dot = (name || "").lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isAllowedAttachment(name: string): boolean {
  return ALLOWED_ATTACHMENT_EXTENSIONS.includes(getAttachmentExtension(name));
}

/**
 * MIME types for the document picker. expo-document-picker takes MIME types
 * rather than extensions, and iOS in particular will grey out anything not
 * listed. `*` alongside is deliberate: several of these have no single agreed
 * MIME, and the extension check in `validateAttachments` is what actually
 * decides — this list only shapes the picker.
 */
export const ATTACHMENT_PICKER_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/gzip",
  "application/json",
  "application/xml",
  "application/epub+zip",
];

/**
 * Human-readable size. 1024-based to match how the caps are defined; whole
 * numbers drop the decimal so "1 KB" doesn't read "1.0 KB".
 */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[unit]}`;
}

/**
 * Coarse family for a filename, used to pick an icon. Grouped by what the file
 * is to a reader rather than by MIME, so .csv sits with .xlsx.
 */
export type AttachmentKind =
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "code"
  | "ebook"
  | "file";

export function getAttachmentKind(name: string): AttachmentKind {
  switch (getAttachmentExtension(name)) {
    case ".pdf":
      return "pdf";
    case ".doc":
    case ".docx":
    case ".odt":
    case ".rtf":
    case ".txt":
    case ".md":
      return "document";
    case ".xls":
    case ".xlsx":
    case ".ods":
    case ".csv":
      return "spreadsheet";
    case ".ppt":
    case ".pptx":
    case ".odp":
      return "presentation";
    case ".zip":
    case ".rar":
    case ".7z":
    case ".gz":
      return "archive";
    case ".json":
    case ".xml":
      return "code";
    case ".epub":
      return "ebook";
    default:
      return "file";
  }
}

/** Uppercase extension without the dot, for the card badge. e.g. "PDF". */
export function getAttachmentLabel(name: string): string {
  return getAttachmentExtension(name).slice(1).toUpperCase() || "FILE";
}

export interface PickedAttachment {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface AttachmentValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate picked files against the same rules the backend applies, so the
 * composer can refuse them before an upload starts.
 */
export function validateAttachments(
  files: PickedAttachment[],
  existingCount = 0,
  existingBytes = 0,
): AttachmentValidationResult {
  if (existingCount + files.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `You can attach up to ${MAX_ATTACHMENTS} files.` };
  }

  for (const file of files) {
    if (!isAllowedAttachment(file.name)) {
      return { ok: false, error: `"${file.name}" isn't a supported file type.` };
    }
    if (!file.size) {
      return { ok: false, error: `"${file.name}" is empty.` };
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return {
        ok: false,
        error: `"${file.name}" is over the ${formatAttachmentSize(MAX_ATTACHMENT_SIZE)} limit.`,
      };
    }
  }

  const total = existingBytes + files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (total > MAX_ATTACHMENTS_TOTAL_SIZE) {
    return {
      ok: false,
      error:
        `Attachments total ${formatAttachmentSize(total)}. ` +
        `The limit is ${formatAttachmentSize(MAX_ATTACHMENTS_TOTAL_SIZE)} per post.`,
    };
  }

  return { ok: true };
}
