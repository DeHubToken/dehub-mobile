import { ethers } from "ethers";
import { parseTxError, applyGasMargin } from "./web3.util";

type Hex = `0x${string}`;

function toHex(value?: string | number | ethers.BigNumber | null): Hex | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    if (typeof value === "string") {
      if (value.startsWith("0x")) return value as Hex;
      return ethers.utils.hexlify(ethers.BigNumber.from(value)) as Hex;
    }
    if (typeof value === "number") return ethers.utils.hexlify(value) as Hex;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ethers.utils.hexlify(value as any) as Hex;
  } catch {
    return undefined;
  }
}

function ensureSigner(signerOrProvider: any): any {
  if (!signerOrProvider) throw new Error("No signer or provider");
  if ((signerOrProvider as any)?._isSigner) return signerOrProvider;
  if (typeof signerOrProvider.getSigner === "function") return signerOrProvider.getSigner();
  return signerOrProvider; // may be eip1193 with request
}

/** Generic AA-aware write helper using an ethers.Contract instance */
export async function writeContractAA(
  contract: any,
  functionName: string,
  args: any[],
  options?: {
    value?: string | number | ethers.BigNumber;
    gasLimit?: string | number | ethers.BigNumber;
    context?: string;
  }
): Promise<{ hash?: string; wait: (confirmations?: number) => Promise<any> }> {
  if (!contract) throw new Error("Contract instance is required");
  if (!contract.address) throw new Error("Contract address missing on instance");
  const context = options?.context || "send";

  // Pass value into preflight calls so payable functions (e.g. native-ETH swaps)
  // simulate/estimate correctly instead of reverting on the static call.
  const preflightOverrides =
    options?.value != null ? [{ value: options.value }] : [];

  // 1) Static call to surface revert reasons early
  try {
    if (contract?.callStatic && contract.callStatic[functionName]) {
      await contract.callStatic[functionName](...args, ...preflightOverrides);
    }
  } catch (staticErr: any) {
    // TEMP DEBUG (remove once Pimlico sponsorship issue is diagnosed)
    console.error("[TipDebug] callStatic raw error:", staticErr?.message, staticErr?.error?.message, staticErr?.data?.message, staticErr);
    const friendly = parseTxError(staticErr, context);
    throw new Error(friendly);
  }

  // 2) Estimate gas with safety margin
  let gasLimitBN: ethers.BigNumber | undefined = undefined;
  try {
    if (contract?.estimateGas && contract.estimateGas[functionName]) {
      const est = await contract.estimateGas[functionName](...args, ...preflightOverrides);
      gasLimitBN = applyGasMargin(est);
    }
  } catch (egErr) {
    // fall back to a conservative value depending on common patterns
    gasLimitBN = ethers.BigNumber.from(200_000);
  }

  const valueHex = toHex(options?.value ?? 0);

  // EOA path: call through ethers Contract with overrides

  try {
    const overrides: any = {};
    if (valueHex) overrides.value = valueHex;
    if (gasLimitBN) overrides.gasLimit = gasLimitBN;
    const resp = await contract[functionName](...args, overrides);
    const hash: string | undefined = resp?.hash;
    const wait = async (confirmations = 1) => resp.wait?.(confirmations);
    return { hash, wait };
  } catch (eoaErr: any) {
    // TEMP DEBUG (remove once Pimlico sponsorship issue is diagnosed)
    console.error("[TipDebug] send raw error:", eoaErr?.message, eoaErr?.error?.message, eoaErr?.data?.message, eoaErr);
    const friendly = parseTxError(eoaErr, context);
    throw new Error(friendly);
  }
}

/**
 * Send several calls as ONE sponsored user operation.
 *
 * A Safe smart account executes a list of calls atomically, which is what lets
 * a mint fee ride along with the mint itself: one signature, one sponsored
 * transaction, and no fee-aware `mint` on the collection contract. Transferring
 * the account's own tokens needs no `approve` either.
 *
 * The EIP-1193 surface cannot express this — eth_sendTransaction takes a single
 * transaction, which the SDK wraps in a one-entry `calls` array — so this uses
 * the bundler client carried on AAProviderLike.
 *
 * Throws BATCH_UNSUPPORTED when the session has no bundler (the plain-EOA
 * fallback). Callers must treat that as "send the calls separately", never as
 * a failed mint.
 */
export async function writeBatchAA(
  provider: any,
  calls: { to: string; data: Hex; value?: ethers.BigNumber }[],
  options?: { context?: string },
): Promise<{ hash: string }> {
  if (!calls?.length) throw new Error("writeBatchAA called with no calls");

  const bundlerClient = provider?.bundlerClient;
  const smartAccount = provider?.smartAccount;
  if (!bundlerClient || !smartAccount) throw new Error("BATCH_UNSUPPORTED");

  try {
    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: calls.map((c) => ({
        to: c.to,
        // The SDK's own path converts explicitly for the same reason: a hex
        // string here is passed straight through and read as the wrong value.
        value: BigInt(c.value ? c.value.toString() : 0),
        data: c.data,
      })),
    });

    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
    if (!receipt?.success) {
      throw new Error(receipt?.reason || "User operation reverted");
    }
    return { hash: receipt.receipt.transactionHash as string };
  } catch (err: any) {
    if (err?.message === "BATCH_UNSUPPORTED") throw err;
    throw new Error(parseTxError(err, options?.context || "send"));
  }
}

/** Convenience: ERC20 transfer via AA-aware path */
export async function erc20TransferAA(
  tokenContract: any,
  to: string,
  amount: ethers.BigNumber,
  options?: { context?: string }
) {
  const res = await writeContractAA(tokenContract, "transfer", [to, amount], { context: options?.context || "send" });
  return res.wait?.(1);
}
