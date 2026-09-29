/**
 * Deleting a stage's recording means deleting all of it (same as web's
 * src/lib/stage-recording-delete.ts).
 *
 * A finished recording does not stay at one path: `finalize-stage-recording`
 * writes a seekable copy beside the upload (`recording.indexed.webm`,
 * `recording.m4a`) and repoints `recording_url` at it. Removing only the object
 * the URL names left the original sitting in a public bucket after the host
 * was told it was gone. So list the stage's own folder and remove what is in it.
 */
import { walletScopedClient } from "../services/supabase";

const BUCKET = "stage-recordings";

export interface RecordingDeleteResult {
  /** Object names removed. Empty is a legitimate outcome. */
  removed: string[];
  /** Set when storage refused. The row should not be deleted on top of this. */
  error: string | null;
}

/**
 * Remove every stored object for `stageId`.
 *
 * Wallet-scoped because the bucket's delete policy checks who hosts the stage,
 * and the Storage API has no per-call header to carry that on the shared client.
 */
export async function deleteStageRecordings(
  stageId: string,
  walletAddress: string,
): Promise<RecordingDeleteResult> {
  if (!stageId || !walletAddress) return { removed: [], error: null };

  const storage = walletScopedClient(walletAddress).storage.from(BUCKET);

  const { data: files, error: listError } = await storage.list(stageId);
  if (listError) return { removed: [], error: listError.message };
  // Nothing stored — never recorded, or already cleaned up. The row still goes.
  if (!files?.length) return { removed: [], error: null };

  const paths = files.map((f) => `${stageId}/${f.name}`);
  const { data: removed, error: removeError } = await storage.remove(paths);
  if (removeError) return { removed: [], error: removeError.message };
  // A policy refusal is not an error to Storage: it deletes nothing and says
  // so with an empty list. Treat that as the refusal it is.
  if (!removed?.length) return { removed: [], error: "Storage removed nothing" };

  return { removed: paths, error: null };
}
