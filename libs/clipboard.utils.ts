import * as Clipboard from "expo-clipboard";
import { ToastAndroid } from "react-native";

/**
 * Copies the provided text to the clipboard and shows a toast notification.
 * @param text - The text to copy.
 */
export const copyToClipboard = (text: string): void => {
  Clipboard.setString(text);
//   ToastAndroid.show("Address copied to clipboard", ToastAndroid.SHORT);
};

const SECRET_CLIPBOARD_TTL_MS = 60_000;
let secretClearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Copies a secret (private key, recovery phrase) and wipes it from the
 * clipboard a minute later, so it does not sit there for any app or keyboard
 * to read indefinitely. Only clears if the clipboard still holds that exact
 * value — anything the user copied since is left alone.
 */
export const copySecretToClipboard = async (value: string): Promise<void> => {
  await Clipboard.setStringAsync(value);
  if (secretClearTimer) clearTimeout(secretClearTimer);
  secretClearTimer = setTimeout(async () => {
    secretClearTimer = null;
    try {
      if (!(await Clipboard.hasStringAsync())) return;
      if ((await Clipboard.getStringAsync()) === value) {
        await Clipboard.setStringAsync("");
      }
    } catch {
      // Best effort: a failed read just leaves the clipboard as it was.
    }
  }, SECRET_CLIPBOARD_TTL_MS);
};
