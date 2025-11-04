// Web3AuthService encapsulates EVM & signing helper utilities that rely on the
// Web3Auth provider. Core Web3Auth setup & init logic stays in config/web3auth.config.ts.
// Only helpers that come AFTER the extended helpers delimiter were moved here.

import { ensureWeb3AuthReady, WEB3AUTH_CHAIN_ID } from "../config/web3auth.config";

// ---------------- Types -----------------------------------------------------
export type Hex = `0x${string}`;

export interface TxParams {
  from?: string;
  to?: string;
  gas?: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  value?: Hex;
  data?: Hex;
  nonce?: Hex | number;
  chainId?: number;
}

export interface TypedDataV4Payload {
  domain: Record<string, any>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, any>;
}

export interface TxReceiptLike { status?: string | number; blockHash?: string; transactionHash?: string; }

// ---------------- Internal Helpers -----------------------------------------
let _ethers: any | null = null;
async function loadEthers() {
  if (_ethers) return _ethers;
  _ethers = await import("ethers");
  return _ethers;
}

function parseRPCError(err: any): Error {
  if (!err) return new Error("Unknown error");
  if (err instanceof Error) return err;
  const msg = err?.message || err?.error?.message || JSON.stringify(err);
  return new Error(msg);
}

async function getProvider(): Promise<any> {
  const instance = await ensureWeb3AuthReady();
  const provider = (instance as any)?.provider;
  if (!provider) throw new Error("Web3Auth provider not available");
  return provider;
}

// External helper so UI hooks can obtain the raw EIP-1193 provider
export async function getWeb3AuthProvider(): Promise<any> {
  return getProvider();
}

async function withWeb3AuthProvider<T>(fn: (p: any) => Promise<T>): Promise<T> {
  try {
    const provider = await getProvider();
    // console.log({provider})
    return await fn(provider);
  } catch (e) {
    const parsed = parseRPCError(e);
    console.error("[Web3AuthService] error", parsed);
    throw parsed;
  }
}

// ---------------- Service Class --------------------------------------------
export class Web3AuthService {
  // Accounts & Chain --------------------------------------------------------
  async getAccounts(): Promise<string[]> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await p.request({ method: "eth_accounts" });
      return Array.isArray(accounts) ? accounts : [];
    });
  }

  async getChainId(): Promise<number> {
    return withWeb3AuthProvider(async (p) => {
      const hex = await p.request({ method: "eth_chainId" });
      return typeof hex === "string" ? parseInt(hex, 16) : Number(hex);
    });
  }

  async ensureChain(targetHexChainId: Hex): Promise<boolean> {
    return withWeb3AuthProvider(async (p) => {
      const currentHex = await p.request({ method: "eth_chainId" });
      if (currentHex?.toLowerCase() === targetHexChainId.toLowerCase()) return true;
      try {
        await p.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetHexChainId }],
        });
        return true;
      } catch (switchErr: any) {
        console.warn("[Web3AuthService] switch chain failed", switchErr);
        return false;
      }
    });
  }

  // Nonce & Gas --------------------------------------------------------------
  async getNonce(address?: string): Promise<number> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const acct = address || accounts[0];
      if (!acct) throw new Error("No account available for nonce");
      const hex = await p.request({ method: "eth_getTransactionCount", params: [acct, "latest"] });
      return parseInt(hex, 16);
    });
  }

  async estimateGas(tx: TxParams): Promise<Hex> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = tx.from || accounts[0];
      if (!from) throw new Error("No from address for gas estimation");
      const params: any = { ...tx, from };
      const gas = await p.request({ method: "eth_estimateGas", params: [params] });
      return gas as Hex;
    });
  }

  // Signing -----------------------------------------------------------------
  async signPersonalMessage(message: string, address?: string): Promise<string> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = address || accounts[0];
      if (!from) throw new Error("No account to sign with");
      const sig = await p.request({ method: "personal_sign", params: [message, from] });
      return sig as string;
    });
  }

  async signTypedDataV4(payload: TypedDataV4Payload, address?: string): Promise<string> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = address || accounts[0];
      if (!from) throw new Error("No account to sign with");
      const param = JSON.stringify(payload);
      const sig = await p.request({ method: "eth_signTypedData_v4", params: [from, param] });
      return sig as string;
    });
  }

  // Transactions ------------------------------------------------------------
  async sendTransaction(tx: TxParams): Promise<Hex> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = tx.from || accounts[0];
      if (!from) throw new Error("No from address to send transaction");
      const params = [{ ...tx, from }];
      const hash = await p.request({ method: "eth_sendTransaction", params });
      return hash as Hex;
    });
  }

  async sendRawSignedTransaction(rawTx: Hex): Promise<Hex> {
    return withWeb3AuthProvider(async (p) => {
      const hash = await p.request({ method: "eth_sendRawTransaction", params: [rawTx] });
      return hash as Hex;
    });
  }

  async buildAndSignTransaction(tx: TxParams): Promise<{ raw: Hex; hash: Hex }> {
    const ethers = await loadEthers();
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = tx.from || accounts[0];
      if (!from) throw new Error("No from address for signing");

      const chainId = tx.chainId || (await this.getChainId());
      const nonce = typeof tx.nonce === "number" ? tx.nonce : await this.getNonce(from);
      const gasLimit = tx.gas ? ethers.BigNumber.from(tx.gas) : ethers.BigNumber.from(await this.estimateGas({ ...tx, from }));

      const maxFeePerGas = tx.maxFeePerGas ? ethers.BigNumber.from(tx.maxFeePerGas) : undefined;
      const maxPriorityFeePerGas = tx.maxPriorityFeePerGas ? ethers.BigNumber.from(tx.maxPriorityFeePerGas) : undefined;

      const gasPrice = tx.gasPrice ? ethers.BigNumber.from(tx.gasPrice) : undefined;
      const value = tx.value ? ethers.BigNumber.from(tx.value) : undefined;

      const signed = await p.request({
        method: "eth_signTransaction",
        params: [
          {
            from,
            to: tx.to,
            data: tx.data,
            nonce: ethers.utils.hexValue(nonce),
            gas: ethers.utils.hexValue(gasLimit),
            ...(gasPrice ? { gasPrice: ethers.utils.hexValue(gasPrice) } : {}),
            ...(maxFeePerGas ? { maxFeePerGas: ethers.utils.hexValue(maxFeePerGas) } : {}),
            ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas: ethers.utils.hexValue(maxPriorityFeePerGas) } : {}),
            ...(value ? { value: ethers.utils.hexValue(value) } : {}),
            chainId,
          },
        ],
      });

      const raw = signed as Hex;
      const hash = await this.sendRawSignedTransaction(raw);
      return { raw, hash };
    });
  }

  // ERC20 -------------------------------------------------------------------
  private ERC20_ABI_FRAGMENTS = [
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ];

  private async getERC20Interface() {
    const ethers = await loadEthers();
    return new ethers.utils.Interface(this.ERC20_ABI_FRAGMENTS);
  }

  async erc20Approve(token: string, spender: string, amount: string | number): Promise<Hex> {
    const iface = await this.getERC20Interface();
    const value = typeof amount === "string" ? amount : amount.toString();
    const data = iface.encodeFunctionData("approve", [spender, value]);
    return this.sendTransaction({ to: token, data });
  }

  async erc20Allowance(token: string, owner?: string, spender?: string): Promise<string> {
    if (!spender) throw new Error("spender required");
    const iface = await this.getERC20Interface();
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = owner || accounts[0];
      if (!from) throw new Error("No owner account");
      const data = iface.encodeFunctionData("allowance", [from, spender]);
      const result = await p.request({ method: "eth_call", params: [{ to: token, data }, "latest"] });
      return result as string;
    });
  }

  async erc20BalanceOf(token: string, owner?: string): Promise<string> {
    const iface = await this.getERC20Interface();
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const from = owner || accounts[0];
      if (!from) throw new Error("No owner account");
      const data = iface.encodeFunctionData("balanceOf", [from]);
      const result = await p.request({ method: "eth_call", params: [{ to: token, data }, "latest"] });
      return result as string;
    });
  }

  async erc20Decimals(token: string): Promise<number> {
    const iface = await this.getERC20Interface();
    return withWeb3AuthProvider(async (p) => {
      const data = iface.encodeFunctionData("decimals", []);
      const result = await p.request({ method: "eth_call", params: [{ to: token, data }, "latest"] });
      return parseInt(result, 16);
    });
  }

  async erc20Symbol(token: string): Promise<string> {
    const iface = await this.getERC20Interface();
    return withWeb3AuthProvider(async (p) => {
      const data = iface.encodeFunctionData("symbol", []);
      const result = await p.request({ method: "eth_call", params: [{ to: token, data }, "latest"] });
      try {
        const [decoded] = iface.decodeFunctionResult("symbol", result);
        return decoded;
      } catch {
        return result;
      }
    });
  }

  async ensureERC20Approval(token: string, spender: string, minAmount: string | number): Promise<{ txHash?: string; alreadyApproved: boolean; }> {
    const current = await this.erc20Allowance(token, undefined, spender);
    const ethers = await loadEthers();
    const bnCurrent = ethers.BigNumber.from(current || "0x0");
    const bnNeeded = ethers.BigNumber.from(typeof minAmount === "string" ? minAmount : String(minAmount));
    if (bnCurrent.gte(bnNeeded)) {
      return { alreadyApproved: true };
    }
    const txHash = await this.erc20Approve(token, spender, bnNeeded.toString());
    return { txHash, alreadyApproved: false };
  }

  // Misc Helpers ------------------------------------------------------------
  async signLoginMessage(domain: string, address?: string): Promise<{ message: string; signature: string; }> {
    const accounts = await this.getAccounts();
    const acct = address || accounts[0];
    if (!acct) throw new Error("No account available");
    const timestamp = new Date().toISOString();
    const message = `Sign in to ${domain}\nAddress: ${acct}\nTimestamp: ${timestamp}`;
    const signature = await this.signPersonalMessage(message, acct);
    return { message, signature };
  }

  async recoverAddress(message: string, signature: string): Promise<string | null> {
    try {
      const ethers = await loadEthers();
      return ethers.utils.verifyMessage(message, signature);
    } catch (e) {
      console.warn("[Web3AuthService] recoverAddress failed", e);
      return null;
    }
  }

  async getNativeBalance(address?: string): Promise<string> {
    return withWeb3AuthProvider(async (p) => {
      const accounts = await this.getAccounts();
      const acct = address || accounts[0];
      if (!acct) throw new Error("No account available");
      const bal = await p.request({ method: "eth_getBalance", params: [acct, "latest"] });
      return bal as string;
    });
  }

  async ethCall(to: string, data: Hex): Promise<string> {
    return withWeb3AuthProvider(async (p) => {
      const result = await p.request({ method: "eth_call", params: [{ to, data }, "latest"] });
      return result as string;
    });
  }

  async waitForReceipt(txHash: Hex, timeoutMs = 60000, pollIntervalMs = 3000): Promise<TxReceiptLike | null> {
    const start = Date.now();
    return withWeb3AuthProvider(async (p) => {
      while (Date.now() - start < timeoutMs) {
        try {
          const receipt = await p.request({ method: "eth_getTransactionReceipt", params: [txHash] });
          if (receipt) return receipt as TxReceiptLike;
        } catch {}
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
      return null;
    });
  }

  async prepareSpenderAllowance(
    token: string,
    spender: string,
    amountRequired: string | number,
    targetChainHex: Hex = WEB3AUTH_CHAIN_ID as Hex
  ): Promise<{ approved: boolean; txHash?: string; chainOk: boolean; }> {
    const chainOk = await this.ensureChain(targetChainHex);
    const { alreadyApproved, txHash } = await this.ensureERC20Approval(token, spender, amountRequired);
    return { approved: alreadyApproved || !!txHash, txHash, chainOk };
  }
}

// Export singleton instance for convenience
export const web3AuthService = new Web3AuthService();

// Backwards compatibility aggregate similar to old Web3AuthActions if needed
export const Web3AuthActions = web3AuthService;
