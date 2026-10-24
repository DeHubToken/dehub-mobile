/**
 * Monetization → `streamInfo`
 * ===========================
 * One place that turns the composer's access switches into the `streamInfo`
 * blob `/nft/user_mint` stores on the token, so every surface that can publish
 * a post writes the same shape.
 *
 * It exists because Go Live grew the same switches the post composer has (a
 * live post is minted through the same endpoint and stores the same blob). Two
 * copies of this mapping would drift within a release, and every way it drifts
 * is silent: a gate written without its amount, a PPV price with no token
 * behind it, a bounty on a chain that has no DHB. Each ships a post that
 * *looks* gated or sellable and cannot be opened or paid.
 *
 * Mirrors dehubweb's `src/features/post/lib/stream-info.ts`.
 */
import { supportedTokens, streamInfoKeys } from "../config/constants";
import { isSolanaChain, findSolanaToken } from "../config/solana.constants";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";
import { DIRECT_TIP_TOKENS } from "./direct-tip-tokens";
import { translateCopy as _translateCopy } from "../i18n/copy";

const isStableSymbol = (s?: string) => s === "USDC" || s === "USDT";

export const parsePositiveNumber = (v: string): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
};

/** Empty string when everything checks out; otherwise what to tell the creator. */
export function validateMonetization(
  m: MonetizationState,
  postChainId?: number,
): string | null {
  if (m.ppvEnabled && !parsePositiveNumber(m.ppvData.price)) {
    return _translateCopy("copy.e883739208ae", { defaultValue: "PPV price must be a valid positive number." });
  }
  // Never quietly reprice 5 USDC as 5 DHB after a chain switch.
  if (
    m.ppvEnabled && postChainId && !isSolanaChain(postChainId) && isStableSymbol(m.ppvData.tokenSymbol) &&
    !DIRECT_TIP_TOKENS.some((tk) => tk.chainId === postChainId && tk.symbol === m.ppvData.tokenSymbol)
  ) {
    return _translateCopy("copy.92a99b217835", { defaultValue: "{{value1}} pay-per-view is only available on Base and BNB Chain.", value1: m.ppvData.tokenSymbol });
  }
  if (m.bountyEnabled) {
    if (!parsePositiveNumber(m.bountyData.viewers)) {
      return _translateCopy("copy.58529cbb11f9", { defaultValue: "Bounty: viewers to reward must be a valid positive number." });
    }
    if (!parsePositiveNumber(m.bountyData.commenters)) {
      return _translateCopy("copy.9bcdd5f7c2a7", { defaultValue: "Bounty: commenters to reward must be a valid positive number." });
    }
    if (!parsePositiveNumber(m.bountyData.rewardPerPerson)) {
      return _translateCopy("copy.5780d87b77f8", { defaultValue: "Bounty: reward per person must be a valid positive number." });
    }
  }
  if (m.tokenGatedEnabled) {
    if (!parsePositiveNumber(m.tokenGateData.minAmount)) {
      return _translateCopy("copy.55863f701a6d", { defaultValue: "Token Gated: minimum token amount must be a valid positive number." });
    }
    const addr = m.tokenGateData.contractAddress?.trim();
    if (addr && !isSolanaChain(postChainId) && !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      return _translateCopy("copy.fc971a2ae350", { defaultValue: "Token Gated: enter a valid token contract address." });
    }
  }
  return null;
}

/**
 * @param evmChainId The chain an EVM payment settles on — resolved by the
 *   caller from the active network, since only it knows which one is selected.
 */
export function buildStreamInfo(
  m: MonetizationState,
  postChainId: number | undefined,
  evmChainId: number,
): Record<string, any> {
  const info: Record<string, any> = {};
  const solana = isSolanaChain(postChainId);

  if (m.ppvEnabled) {
    info[streamInfoKeys.isPayPerView] = true;
    info[streamInfoKeys.payPerViewAmount] = parsePositiveNumber(m.ppvData.price);
    if (solana) {
      const sym = m.ppvData.tokenSymbol || "SOL";
      const tok = findSolanaToken(sym);
      info[streamInfoKeys.payPerViewTokenSymbol] = sym;
      info[streamInfoKeys.payPerViewContractAddress] = tok?.address;
      info[streamInfoKeys.payPerViewChainIds] = postChainId;
    } else {
      // DHB, or USDC/USDT where the chain's controller accepts them (the
      // backend checks the buyer paid in this contract).
      const stable = isStableSymbol(m.ppvData.tokenSymbol)
        ? DIRECT_TIP_TOKENS.find((tk) => tk.chainId === evmChainId && tk.symbol === m.ppvData.tokenSymbol)
        : undefined;
      info[streamInfoKeys.payPerViewTokenSymbol] = stable?.symbol ?? "DHB";
      if (stable) info[streamInfoKeys.payPerViewContractAddress] = stable.address;
      info[streamInfoKeys.payPerViewChainIds] = evmChainId;
    }
  }

  // Bounty is EVM-only (not supported on Solana posts).
  if (m.bountyEnabled && !solana) {
    info[streamInfoKeys.isAddBounty] = true;
    info[streamInfoKeys.addBountyAmount] = parsePositiveNumber(m.bountyData.rewardPerPerson);
    info[streamInfoKeys.addBountyFirstXViewers] = parsePositiveNumber(m.bountyData.viewers);
    info[streamInfoKeys.addBountyFirstXComments] = parsePositiveNumber(m.bountyData.commenters);
    info[streamInfoKeys.addBountyTokenSymbol] = "DHB";
    info[streamInfoKeys.addBountyChainId] = evmChainId;
  }

  if (m.tokenGatedEnabled) {
    info[streamInfoKeys.isLockContent] = true;
    info[streamInfoKeys.lockContentAmount] = parsePositiveNumber(m.tokenGateData.minAmount);
    if (solana) {
      const sym = m.tokenGateData.tokenSymbol || "SOL";
      const tok = findSolanaToken(sym);
      info[streamInfoKeys.lockContentTokenSymbol] = sym;
      info[streamInfoKeys.lockContentContractAddress] = tok?.address;
      info[streamInfoKeys.lockContentChainIds] = [postChainId];
    } else {
      // Token-gate any token on Base / BNB / ETH (#43). Falls back to DHB.
      const lockChainId =
        postChainId && !isSolanaChain(postChainId) ? postChainId : evmChainId;
      const sym = m.tokenGateData.tokenSymbol || "DHB";
      const contractAddress =
        m.tokenGateData.contractAddress ||
        supportedTokens.find((t) => t.chainId === lockChainId && t.symbol === sym)?.address;
      info[streamInfoKeys.lockContentTokenSymbol] = sym;
      if (contractAddress) info[streamInfoKeys.lockContentContractAddress] = contractAddress;
      info[streamInfoKeys.lockContentChainIds] = [lockChainId];
    }
  }
  // "Subscribers-only" is deliberately absent. It is not a hold gate: the post
  // carries the creator's plan ids in `plans`, and the feed pipeline joins the
  // viewer's subscriptions to decide. It used to sit here as a DHB lock with no
  // minimum — a hold gate against nothing.

  return info;
}
