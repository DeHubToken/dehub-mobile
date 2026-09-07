// Reusable Web3 transaction error parsing utility
// Provides human-readable messages for common EVM + ethers error patterns.
// Usage: parseTxError(error, 'approve') or parseTxError(error, 'send')
// Falls back to generic context-based messages when no specific match.

export type TxContext = "approve" | "send" | string | undefined;

/**
 * True when the only thing wrong is that the wallet needs unlocking — the
 * WalletLockedError lockedProviderShim throws when the unlock sheet closes
 * without producing a key.
 *
 * Matches on the name AND on the message, because aa.write re-wraps errors in
 * a plain `new Error(friendlyText)` on its way out, which drops the class.
 */
export function isWalletLockedError(err: any): boolean {
  if (!err) return false;
  if (err.name === "WalletLockedError") return true;
  const message = typeof err === "string" ? err : String(err?.message ?? "");
  return message.toLowerCase().includes("wallet is locked");
}

/**
 * Everything an AA error might be hiding the real reason in.
 *
 * `err.message` alone is not enough. A userOp that reverts arrives as viem's
 * UserOperationExecutionError, which puts the useful part on `details` /
 * `shortMessage` / `cause`, and dumps the whole request body — including the
 * word "paymaster" and the bundler URL — into `message`. Reading only
 * `message` is how a token-transfer revert came to be reported as a gas
 * sponsorship outage.
 */
function rawErrorText(err: any): string {
  return [
    err?.data?.message,
    err?.error?.message,
    err?.message,
    err?.details,
    err?.shortMessage,
    err?.cause?.message,
    err?.cause?.reason,
    err?.cause?.details,
    err?.reason,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Pull the readable string out of an ABI-encoded `Error(string)` revert.
 *
 * The bundler hands back the raw payload — `0x08c379a0` followed by the
 * encoded reason — so the actual word ("STF") never appears in the text we
 * match on until it is decoded. Same job as tryDecodeHexReason on the web.
 */
function decodeRevertReason(text: string): string {
  const match = text.match(/0x08c379a0[0-9a-fA-F]{128,}/);
  if (!match) return "";
  try {
    const body = match[0].slice(10);
    const length = parseInt(body.slice(64, 128), 16);
    if (!Number.isFinite(length) || length <= 0 || length > 256) return "";
    const chars = body.slice(128, 128 + length * 2);
    let out = "";
    for (let i = 0; i < chars.length; i += 2) {
      out += String.fromCharCode(parseInt(chars.slice(i, i + 2), 16));
    }
    return out;
  } catch {
    return "";
  }
}

export function parseTxError(err: any, context: TxContext): string {
  if (!err)
    return context === "approve" ? "Approval failed" : "Transaction failed";
  const code = err.code || err.error?.code;
  const raw = rawErrorText(err);
  // The decoded revert reason is appended so the branches below can match on
  // the word itself ("STF") rather than on its hex encoding.
  const msg = (raw + " " + decodeRevertReason(raw)).toLowerCase();

  // Wallet locked. Not a failure and not something the user did wrong: signing
  // reached the unlock sheet (lockedProviderShim) and it did not produce a
  // key — usually because the biometric prompt was dismissed. Worded as
  // "Transaction failed" it read as if the payment had broken, which is what
  // stopped people retrying. Keep the words "wallet is locked" in the message:
  // aa.write re-wraps this string in a fresh Error, and that substring is all
  // isWalletLockedError has left to recognise it by.
  if (isWalletLockedError(err)) {
    return "Your wallet is locked — unlock it to continue";
  }
  // User rejection
  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    msg.includes("user rejected")
  )
    return "You rejected the transaction";
  // Insufficient native balance for gas
  if (
    msg.includes("insufficient funds for intrinsic transaction cost") ||
    msg.includes("insufficient funds for gas") ||
    msg.includes("insufficient funds")
  ) {
    return "Insufficient funds for gas fees";
  }
  // Token balance issues
  if (
    msg.includes("transfer amount exceeds balance") ||
    msg.includes("erc20: transfer amount exceeds balance")
  ) {
    return "Insufficient token balance";
  }
  // Allowance / approval issues
  if (msg.includes("erc20") && msg.includes("insufficient allowance")) {
    return "Allowance too low — approval needed";
  }
  // Gas estimation / unpredictable gas
  if (
    code === "UNPREDICTABLE_GAS_LIMIT" ||
    msg.includes("gas required exceeds allowance") ||
    msg.includes("intrinsic gas too low")
  ) {
    return "Gas estimation failed — try a different amount or try again";
  }
  // Replacement / nonce issues
  if (
    msg.includes("replacement transaction underpriced") ||
    msg.includes("replacement fee too low")
  ) {
    return "There is a pending transaction — wait or speed it up in your wallet";
  }
  if (msg.includes("nonce too low"))
    return "Network nonce mismatch — wait for pending transactions to confirm";
  // Revert with reason
  // STF — the DHB pull itself failed, and this MUST be tested before the
  // paymaster branch below.
  //
  // STF is TransferHelper's safeTransferFrom failure: the allowance or the
  // balance was short when the contract tried to move the tokens. It has
  // nothing to do with gas sponsorship. But every viem userOp error carries
  // the request body, which contains the word "paymaster" and the bundler
  // URL, so a revert that reaches the paymaster branch first is reported as
  // "sponsorship unavailable" — telling someone the network is down when in
  // fact their approval was short. That is what shipped, and it is why a
  // healthy Pimlico account was blamed for three days.
  //
  // 535446 is "STF" hex-encoded, for the case where the payload arrives
  // undecoded.
  if (
    msg.includes("stf") ||
    msg.includes("535446") ||
    msg.includes("safetransfer") ||
    msg.includes("transfer_from_failed")
  ) {
    return "Token transfer failed — check your DHB balance and approval";
  }
  // Pimlico says "reverted during simulation with reason: 0x…" and ethers
  // v5 says "reverted with reason string", so matching the literal
  // "execution reverted" missed both real phrasings.
  if (/revert/.test(msg)) {
    const match = raw.match(/execution reverted(:)?\s?(.*)/i);
    if (match && match[2]) {
      const reason = match[2].replace(/revert/i, "").trim();
      if (reason && reason.length < 80)
        return reason.charAt(0).toUpperCase() + reason.slice(1);
    }
    return "Transaction reverted";
  }
  // Paymaster / sponsorship issues (AA)
  // Guarded: a reverted userOp names the paymaster in its request body
  // without the paymaster being at fault.
  if ((msg.includes("paymaster") && !/revert/.test(msg)) || msg.includes("sponsor")) {
    if (msg.includes("insufficient") && msg.includes("balance")) {
      return "No gas sponsor available — try again later or switch method";
    }
    if (msg.includes("pm_getpaymasterdata") || msg.includes("pimlico")) {
      return "Gas sponsor service unavailable — try again later";
    }
    return "Paymaster error — sponsorship unavailable";
  }
  return context === "approve" ? "Approval failed" : "Transaction failed";
}

// Optional helper to wrap async write calls
export async function withParsedError<T>(
  fn: () => Promise<T>,
  context: TxContext
): Promise<{ ok: true; result: T } | { ok: false; error: string; raw: any }> {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: parseTxError(e, context), raw: e };
  }
}

// Gas margin helper (simple 20% bump)
const GAS_MARGIN_NUMERATOR = 120;
const GAS_MARGIN_DENOMINATOR = 100;
export function applyGasMargin(value: any) {
  try {
    return value.mul(GAS_MARGIN_NUMERATOR).div(GAS_MARGIN_DENOMINATOR);
  } catch {
    return value;
  }
}
