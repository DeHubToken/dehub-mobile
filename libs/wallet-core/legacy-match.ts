import type { LegacyAccountMatch } from "./legacy-detect";

const PROVIDER_ALIASES: Record<string, string[]> = {
  email: ["email", "email_passwordless"],
  email_passwordless: ["email", "email_passwordless"],
  sms: ["sms", "sms_passwordless", "phone"],
  sms_passwordless: ["sms", "sms_passwordless", "phone"],
  phone: ["sms", "sms_passwordless", "phone"],
};

function normalized(value?: string | null): string | null {
  const result = value?.trim().toLowerCase();
  return result || null;
}

export function legacyAccountsForProvider(
  accounts: LegacyAccountMatch[],
  provider: string,
): LegacyAccountMatch[] {
  const wanted = PROVIDER_ALIASES[normalized(provider) ?? ""] ?? [normalized(provider) ?? ""];
  return accounts.filter((account) => {
    const method = normalized(account.signupMethod);
    return !!method && wanted.includes(method);
  });
}

/**
 * Connect a recovered owner key to the DeHub profile it actually controls.
 *
 * Legacy profiles normally store their Safe smart-account address, while a
 * Web3Auth recovery returns the Safe owner's EOA key. Address matching must
 * therefore accept either form. Provider metadata is only a fallback when the
 * Safe prediction was unavailable; a successful prediction that disagrees
 * with every candidate is proof that the wrong old login was used.
 */
export function matchRecoveredLegacyAccount(
  accounts: LegacyAccountMatch[],
  provider: string,
  ownerAddress: string,
  safeAddress: string | null,
): LegacyAccountMatch | undefined {
  const possibleAddresses = new Set(
    [ownerAddress, safeAddress]
      .filter((address): address is string => !!address)
      .map((address) => address.toLowerCase()),
  );
  const byAddress = accounts.filter((account) =>
    possibleAddresses.has(account.ethAddress.toLowerCase()),
  );
  if (byAddress.length === 1) return byAddress[0];
  if (byAddress.length > 1 || safeAddress) return undefined;

  const byProvider = legacyAccountsForProvider(accounts, provider);
  if (byProvider.length === 1) return byProvider[0];
  return accounts.length === 1 ? accounts[0] : undefined;
}
