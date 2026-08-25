/**
 * Saving and opening a JSON file from the phone.
 *
 * A browser has one answer for this — a download. Phones have two, and they
 * are not interchangeable:
 *
 *  - Android: the Storage Access Framework. The reader picks a folder, the app
 *    writes into it, and the file lands somewhere they can find again. The
 *    share sheet is not a substitute — RN's `Share` cannot carry a local file
 *    on Android, so a "share" would silently send the path as text.
 *  - iOS: no SAF. The file is written to the app's cache and handed to the
 *    share sheet, where "Save to Files" is one tap.
 *
 * Both return the same thing: whether a file actually left the app, so a
 * cancelled picker does not report success.
 *
 * @module libs/json-file
 */

import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";

const MIME = "application/json";

/**
 * Write `contents` out under `fileName`. Resolves false when the reader backed
 * out of the picker or the share sheet, which is a cancel, not a failure.
 */
export async function saveJsonFile(fileName: string, contents: string): Promise<boolean> {
  if (Platform.OS === "android") {
    const permission =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return false;

    const uri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      MIME,
    );
    await FileSystem.writeAsStringAsync(uri, contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return true;
  }

  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const result = await Share.share({ url: uri, title: fileName });
  return result.action !== Share.dismissedAction;
}

/** Pick a JSON file and read it. Null means the reader cancelled. */
export async function readJsonFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    // Some Android file providers hand back `*/*` for a .json, so the type is
    // a hint rather than a filter and the parse is what actually decides.
    type: [MIME, "text/plain", "*/*"],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]?.uri) return null;
  return FileSystem.readAsStringAsync(picked.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
