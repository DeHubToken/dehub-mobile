import { apiClient } from "../libs/api.client";

/**
 * App tokens: DHB held as a balance on DeHub instead of on a chain. Everyone
 * opened with the DHB they held and staked at launch; after that only in-app
 * moves change it. Sending one never touches a chain. Mirrors web
 * src/lib/api/dehub/app-tokens.ts.
 */

export interface AppTokensConfig {
  enabled: boolean;
  symbol: string;
  deposits: boolean;
}

export interface AppTokenPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface AppTokenEntry {
  kind: "opening" | "send" | "receive" | "spend" | "refund" | "deposit" | "adjust";
  /** Signed decimal string: "-12.5" left, "12.5" arrived. */
  amount: string;
  purpose?: string;
  note?: string;
  counterparty?: AppTokenPerson;
  at: string;
}

export interface AppTokensAccount {
  symbol: string;
  balance: string;
  entries: AppTokenEntry[];
}

export function getAppTokensConfig(): Promise<AppTokensConfig> {
  return apiClient.fetch<AppTokensConfig>("/app-tokens/config", { isAuthRequired: false, quiet: true });
}

export function getMyAppTokens(): Promise<AppTokensAccount> {
  return apiClient.get<AppTokensAccount>("/app-tokens/me");
}

export function findAppTokenRecipient(to: string): Promise<AppTokenPerson> {
  return apiClient.fetch<AppTokenPerson>("/app-tokens/recipient", { params: { to }, quiet: true });
}

/** `key` is made once per attempt and reused on a retry, so a retry never sends twice. */
export function sendAppTokens(input: {
  to: string; amount: string; key: string; purpose?: string; ref?: string; note?: string;
}): Promise<{ ok: true; balance: string; to: AppTokenPerson }> {
  return apiClient.post("/app-tokens/send", input);
}

export function newAppTokenKey(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
