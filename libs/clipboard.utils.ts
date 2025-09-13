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
