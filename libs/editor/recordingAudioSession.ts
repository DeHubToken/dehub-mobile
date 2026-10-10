import { configureForRecording, releaseRecording } from "../audioSession";

let pending = Promise.resolve();

/** A departing editor finishes audio cleanup before the next editor configures it. */
export async function acquireRecordingAudio(isCurrent: () => boolean): Promise<(() => Promise<void>) | null> {
  const previous = pending;
  let finished!: () => void;
  pending = new Promise<void>(resolve => { finished = resolve; });
  await previous;
  if (!isCurrent()) { finished(); return null; }
  let closing: Promise<void> | null = null;
  const close = () => {
    closing ??= releaseRecording().finally(finished);
    return closing;
  };
  try {
    await configureForRecording();
    if (!isCurrent()) { await close(); return null; }
    return close;
  } catch (error) { await close().catch(() => {}); throw error; }
}
