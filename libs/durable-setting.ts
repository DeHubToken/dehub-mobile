/**
 * A second copy of a few small yes/no choices, in AsyncStorage.
 *
 * Reported from iPhones (2026-11-12): the AI permission and "show the number
 * on the bell" both came back unset after the app was closed and reopened,
 * while MMKV is where both lived. Whatever drops them there, a choice someone
 * made on purpose should not have to be made twice, so each write also lands
 * in AsyncStorage and a missing MMKV value is filled back from it on launch.
 * MMKV stays the copy that is read, because the readers need it synchronously.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from "./storage";

const PREFIX = "durable:";

/** Keep the AsyncStorage copy of a choice in step with MMKV. */
export function mirrorDurable(key: string, value: string | boolean): void {
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {
    // MMKV still has it for this run.
  });
}

type Kind = "string" | "boolean";

function readMmkv(key: string, kind: Kind): string | boolean | undefined {
  try {
    return kind === "boolean" ? storage.getBoolean(key) : storage.getString(key);
  } catch {
    return undefined;
  }
}

/**
 * If MMKV has lost `key` but the copy has it, put it back and call `restored`
 * so anything showing the choice can update. Resolves once checked.
 */
export async function restoreDurable(key: string, kind: Kind, restored: () => void): Promise<void> {
  const current = readMmkv(key, kind);
  if (current !== undefined) {
    // Seed the copy for people who chose before it existed.
    mirrorDurable(key, current);
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw === null) return;
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== kind) return;
    // Something written while this read was in flight wins.
    if (readMmkv(key, kind) !== undefined) return;
    storage.set(key, value as string | boolean);
    restored();
  } catch {
    // keep the default
  }
}
