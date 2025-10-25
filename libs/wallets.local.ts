import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createLogger } from "./logger";

const log = createLogger("wallets.local");

export interface LocalAccount {
  address: string;
  username?: string;
  createdAt: number;
}

export interface LocalAccountDetails extends LocalAccount {
  privateKey?: string | null;
}

const STORAGE_KEY = "@local_wallet_accounts_v1";
const PK_PREFIX = "local_wallet_pk_"; // per-address key in SecureStore

async function readAll(): Promise<LocalAccount[]> {
  try {
    log.debug("readAll:start");
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed as LocalAccount[];
    log.debug("readAll:success", { count: list.length });
    return list;
  } catch {
    log.warn("readAll:error");
    return [];
  }
}

async function writeAll(list: LocalAccount[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    log.debug("writeAll:success", { count: list.length });
  } catch (e) {
    log.warn("writeAll:error", e);
    throw e;
  }
}

export async function listLocalAccounts(): Promise<LocalAccount[]> {
  return await readAll();
}

export async function upsertLocalAccount(acc: {
  address: string;
  username?: string;
  privateKey?: string | null;
}): Promise<LocalAccount[]> {
  const address = acc.address?.toLowerCase();
  log.info("upsert:start", { address, hasUsername: !!acc.username, hasPk: !!acc.privateKey });
  if (!address) return await readAll();
  const list = await readAll();
  const idx = list.findIndex((a) => a.address.toLowerCase() === address);
  const now = Date.now();
  const next: LocalAccount = {
    address,
    username: acc.username?.trim() || undefined,
    createdAt: idx >= 0 ? list[idx].createdAt : now,
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.unshift(next);
  await writeAll(list);
  // Store private key securely if provided
  if (acc.privateKey) {
    try {
      const pkNorm = acc.privateKey.startsWith("0x") ? acc.privateKey : `0x${acc.privateKey}`;
      log.debug("secure:set:start", { address });
      // Align accessibility with setPrivateKeyForAddress for consistency
      await SecureStore.setItemAsync(PK_PREFIX + address, pkNorm, {
        keychainAccessible: (SecureStore as any).WHEN_UNLOCKED,
      } as any);
      // Verify write succeeded (some platforms may silently fail)
      try {
        const roundtrip = await SecureStore.getItemAsync(PK_PREFIX + address);
        if (!roundtrip) {
          log.warn("secure:set:verify:failed", { address });
        }
        else log.debug("secure:set:verify:ok", { address });
      } catch (verErr) {
        log.warn("secure:set:verify:error", verErr);
      }
    } catch (e) {
      log.warn("secure:set:error", e);
      // ignore secure store failures silently
    }
  }
  log.info("upsert:done", { address });
  return list;
}

export async function removeLocalAccount(address: string): Promise<LocalAccount[]> {
  const addr = address?.toLowerCase();
  log.info("remove:start", { address: addr });
  const list = await readAll();
  const next = list.filter((a) => a.address.toLowerCase() !== addr);
  await writeAll(next);
  // Remove private key from secure storage
  try {
    await SecureStore.deleteItemAsync(PK_PREFIX + addr);
    log.debug("secure:delete:ok", { address: addr });
  } catch {
    log.warn("secure:delete:error", { address: addr });
    // ignore
  }
  log.info("remove:done", { address: addr });
  return next;
}

export async function clearLocalAccounts(): Promise<void> {
  log.info("clearAll:start");
  await writeAll([]);
  log.info("clearAll:done");
}

export async function getPrivateKeyForAddress(address: string): Promise<string | null> {
  if (!address) return null;
  try {
    const addr = address.toLowerCase();
    log.debug("secure:get:start", { address: addr });
    const pk = await SecureStore.getItemAsync(PK_PREFIX + addr);
    log.debug("secure:get:done", { address: addr, found: !!pk });
    return pk || null;
  } catch(error) {
    log.warn("secure:get:error", { address, error });
    return null;
  }
}

export async function setPrivateKeyForAddress(address: string, privateKey: string): Promise<void> {
  const addr = address?.toLowerCase();
  if (!addr || !privateKey) return;
  try {
    const pkNorm = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    log.debug("secure:set:direct:start", { address: addr });
    await SecureStore.setItemAsync(PK_PREFIX + addr, pkNorm, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    } as any);
    // Verify write
    try {
      const roundtrip = await SecureStore.getItemAsync(PK_PREFIX + addr);
      if (!roundtrip) log.warn("secure:set:direct:verify:failed", { address: addr });
      else log.debug("secure:set:direct:verify:ok", { address: addr });
    } catch (verErr) {
      log.warn("secure:set:direct:verify:error", verErr);
    }
  } catch {
    log.warn("secure:set:direct:error", { address: addr });
    // ignore
  }
}

export async function getLocalAccount(address: string): Promise<LocalAccount | null> {
  const list = await readAll();
  const addr = address?.toLowerCase();
  const found = list.find((a) => a.address.toLowerCase() === addr);
  log.debug("getLocalAccount", { address: addr, found: !!found });
  return found || null;
}

export async function getLocalAccountDetails(address: string): Promise<LocalAccountDetails | null> {
  log.debug("getLocalAccountDetails:start", { address: address?.toLowerCase?.() });
  const meta = await getLocalAccount(address);
  if (!meta) return null;
  const privateKey = await getPrivateKeyForAddress(address);
  const details = { ...meta, privateKey } as LocalAccountDetails;
  log.debug("getLocalAccountDetails:done", { address: meta.address, hasPk: !!privateKey });
  return details;
}

export default {
  listLocalAccounts,
  upsertLocalAccount,
  removeLocalAccount,
  clearLocalAccounts,
  getPrivateKeyForAddress,
  setPrivateKeyForAddress,
  getLocalAccount,
  getLocalAccountDetails,
};
