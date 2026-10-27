import type { ConverterImport } from "../../services/converter.service";

export type LinkImportProgress =
  | { kind: "done" }
  | { kind: "failed" }
  | { kind: "waiting" }
  | { kind: "downloading"; percent: number };

/** What an editor link import is doing, from the queue's own status. */
export function linkImportProgress(job: Pick<ConverterImport, "state" | "willRetry" | "rateLimited" | "percent" | "result">): LinkImportProgress {
  if (job.state === "completed") return job.result?.editorFile ? { kind: "done" } : { kind: "failed" };
  if (job.state === "failed" && !job.willRetry) return { kind: "failed" };
  if (job.rateLimited || job.willRetry || job.state === "delayed") return { kind: "waiting" };
  return { kind: "downloading", percent: Math.max(0, Math.min(100, Math.round(job.percent ?? 0))) };
}
