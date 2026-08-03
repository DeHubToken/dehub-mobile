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
    const friendly = parseTxError(eoaErr, context);
    throw new Error(friendly);
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
