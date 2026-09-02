/**
 * Paying for a post that ran past the daily allowance
 * ===================================================
 * Mirror of dehubweb's `lib/dhb-payment.ts` + `lib/post-quota-settle.ts`.
 *
 * One DHB transfer to the treasury, after the post has landed, on whichever
 * of Base or BNB can cover it. Same shape as the AI-credit top-up next door
 * and for the same reason: DHB is the token the app already runs on, so a
 * separate balance to fund first would be a second money path for no reason.
 *
 * The dangerous moment is the gap between the DHB leaving the wallet and the
 * server hearing about it. Lose the settle call there and the creator has
 * paid while the bill is still open — and an open bill is what blocks their
 * next paid post, so they would be asked to pay for the same post twice. So
 * the hash is never dropped: retried immediately, then stashed and re-sent
 * the next time the composer opens. Settling is idempotent server-side, so
 * replaying one costs nothing.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ethers } from "ethers";
import { buildContract } from "../libs/contract.factory";
import { createAuthAdapter } from "./auth/authAdapter";
import { writeContractAA } from "../libs/aa.write";
import { ethersService } from "./ethers.service";
import { getAuthMethod } from "../libs/auth.utils";
import { ERC20Abi } from "../config/abis";
import { ChainId, DHB_ADDRESSESS } from "../config/constants";
import { settlePostCharge } from "./post-quota.service";

/** Chains a posting charge can be paid and confirmed on. Anything else is unsettleable. */
export const QUOTA_CHAIN_IDS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];

const PENDING_KEY = "@dhb_post_quota_pending_settlements";

/** Beyond this a stashed hash is not a transient failure and retrying it helps nobody. */
const MAX_ATTEMPTS = 12;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface QuotaPaymentResult {
  txHash: string;
  chainId: number;
}

/**
 * The most DHB this wallet holds on any one payable chain.
 *
 * The most, not the total: a transfer settles on one chain, so what matters
 * is whether either side covers the bill on its own. Zero on any failure —
 * the server checks the same thing and is the authority.
 */
export async function readDhbBalance(): Promise<number> {
  try {
    const { address } = await getAuthMethod();
    if (!address) return 0;

    const balances = await Promise.all(
      QUOTA_CHAIN_IDS.map(async (chainId) => {
        try {
          const raw = await ethersService.getErc20Balance(
            DHB_ADDRESSESS[chainId],
            address,
            chainId,
          );
          return parseFloat(ethers.utils.formatUnits(raw, 18));
        } catch {
          return 0;
        }
      }),
    );
    return Math.max(0, ...balances);
  } catch {
    return 0;
  }
}

/**
 * Send `amountDhb` to `treasury` and return the mined transaction.
 *
 * Rounds up to a whole DHB — the price is quoted in whole tokens, and a
 * fractional amount only invites float drift between quote and transfer.
 */
export async function payPostQuota(
  amountDhb: number,
  treasury: string,
): Promise<QuotaPaymentResult> {
  const amount = Math.ceil(amountDhb);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nothing to pay.");
  if (!treasury) throw new Error("No payment address configured.");

  const { address } = await getAuthMethod();
  if (!address) throw new Error("Sign in to pay for this post.");

  const amountWei = ethers.utils.parseUnits(String(amount), 18);

  // Pick the chain that can cover it, largest balance first, so a wallet
  // holding enough on BNB is not sent to Base to fail.
  const balances = await Promise.all(
    QUOTA_CHAIN_IDS.map(async (chainId) => {
      try {
        const raw = await ethersService.getErc20Balance(
          DHB_ADDRESSESS[chainId],
          address,
          chainId,
        );
        return { chainId, raw };
      } catch {
        return { chainId, raw: ethers.BigNumber.from(0) };
      }
    }),
  );

  const payable = balances
    .filter((b) => b.raw.gte(amountWei))
    .sort((a, b) => (b.raw.gt(a.raw) ? 1 : -1))[0];

  if (!payable) {
    const held = balances.reduce(
      (max, b) => Math.max(max, parseFloat(ethers.utils.formatUnits(b.raw, 18))),
      0,
    );
    throw new Error(
      `This post costs ${amount.toLocaleString()} DHB and you hold ${Math.floor(held).toLocaleString()}.`,
    );
  }

  const provider = await createAuthAdapter().getProvider();
  const tokenContract = await buildContract(
    provider,
    ERC20Abi,
    DHB_ADDRESSESS[payable.chainId],
    true,
  );

  const tx = await writeContractAA(tokenContract, "transfer", [treasury, amountWei], {
    context: "Post allowance",
  });

  // wait() resolves with status 0 for a REVERTED transaction rather than
  // throwing, so ignoring the receipt would report a failed transfer as paid.
  const receipt = await tx.wait(1);
  if (receipt && receipt.status !== undefined && receipt.status !== 1) {
    throw new Error("The DHB transfer did not go through. Nothing has been charged.");
  }

  const txHash: string | undefined = receipt?.transactionHash || receipt?.hash || tx.hash;
  if (!txHash) {
    throw new Error("The transfer went through but its hash is unknown — contact support.");
  }

  return { txHash, chainId: payable.chainId };
}

interface PendingSettlement {
  txHash: string;
  chainId: number;
  attempts: number;
}

async function readPending(): Promise<PendingSettlement[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePending(rows: PendingSettlement[]): Promise<void> {
  try {
    if (!rows.length) await AsyncStorage.removeItem(PENDING_KEY);
    else await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // Storage failing must not break posting. The immediate retries still ran;
    // this only gives up the later ones.
  }
}

/**
 * What became of a settle attempt.
 *
 * "pending" and "abandoned" both used to be `false`, which is how a charge the
 * app had permanently given up on was reported to the creator as one it would
 * "finish confirming shortly". They are different facts and the caller has to
 * be able to tell them apart.
 */
export type SettleOutcome = "settled" | "pending" | "abandoned";

/**
 * Tell the server about a transfer, retrying until it sticks.
 *
 * "settled" once the charge is closed. "pending" means the hash is stashed and
 * will be retried when the composer next opens. "abandoned" means the retries
 * are spent — the hash is moved to the abandoned list rather than deleted, and
 * the caller must say so, because the DHB has gone and the still-open charge is
 * what blocks the creator's next paid post.
 */
export async function settleWithRetry(
  txHash: string,
  chainId: number,
  startingAttempts = 0,
  // Injectable for the same reason persistPayout takes a `sleep`: otherwise a
  // test of the retry ladder has to sit through 8.5 seconds of real waiting.
  delaysMs: number[] = [0, 2500, 6000],
): Promise<SettleOutcome> {
  // Three immediate goes with a widening gap. A transfer that is mined but
  // not yet visible to the read RPC answers `pending` and clears in seconds;
  // anything longer is left to the stash.
  const delays = delaysMs;

  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await wait(delays[i]);
    try {
      const result = await settlePostCharge(txHash, chainId);
      if (result?.settled) {
        await writePending((await readPending()).filter((r) => r.txHash !== txHash));
        return "settled";
      }
    } catch (e) {
      console.warn("[PostQuota] settle attempt failed", e);
    }
  }

  const attempts = startingAttempts + delays.length;
  const rows = (await readPending()).filter((r) => r.txHash !== txHash);

  if (attempts >= MAX_ATTEMPTS) {
    console.warn(`[PostQuota] giving up on settling ${txHash} after ${attempts} attempts`);
    // Stop retrying, but do not lose the hash. The DHB is gone and the charge
    // is still open server-side, which is what will block the next paid post,
    // so the creator needs the reference to get it reconciled.
    await writePending(rows);
    await recordAbandoned({ txHash, chainId, attempts });
    return "abandoned";
  }

  rows.push({ txHash, chainId, attempts });
  await writePending(rows);
  return "pending";
}

/**
 * Transfers the app has stopped trying to settle.
 *
 * Kept because the money moved: without the hash there is nothing to reconcile
 * a real payment against. Capped so a long outage cannot grow this without
 * bound; the oldest go first, since the newest is the one still blocking.
 */
const ABANDONED_KEY = "@dhb_post_quota_abandoned_settlements";
const MAX_ABANDONED = 20;

export async function readAbandonedSettlements(): Promise<PendingSettlement[]> {
  try {
    const raw = await AsyncStorage.getItem(ABANDONED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function recordAbandoned(row: PendingSettlement): Promise<void> {
  try {
    const rows = (await readAbandonedSettlements()).filter(
      (r) => r.txHash !== row.txHash,
    );
    rows.push(row);
    await AsyncStorage.setItem(
      ABANDONED_KEY,
      JSON.stringify(rows.slice(-MAX_ABANDONED)),
    );
  } catch {
    // Storage failing here costs the reference, not the payment.
  }
}

/**
 * Retry anything stranded by an earlier session.
 *
 * Called when the composer opens — the moment the creator is about to need a
 * clear tab. Costs one request per stranded hash, which is normally none.
 */
export async function flushPendingSettlements(): Promise<void> {
  const rows = await readPending();
  for (const row of rows) {
    await settleWithRetry(row.txHash, row.chainId, row.attempts);
  }
}
