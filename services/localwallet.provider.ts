import { ethers } from "ethers";
import { ChainId } from "../config/constants";
import { SUPPORTED_NETWORKS } from "../config/web3.constants";

export interface LocalProviderOptions {
  privateKey: string;
  rpcUrl: string;
  chainIdHex: string; // e.g., '0x2105'
}

/**
 * Create a minimal EIP-1193 compatible provider backed by a private key + RPC.
 * Implements common methods used by our app: eth_accounts, eth_chainId, personal_sign,
 * eth_sign, eth_signTypedData_v4, eth_sendTransaction, eth_call, eth_estimateGas.
 */
export function createLocalEip1193Provider(opts: LocalProviderOptions) {
  const pk = opts.privateKey.startsWith("0x") ? opts.privateKey : `0x${opts.privateKey}`;
  const jsonRpc = new ethers.providers.JsonRpcProvider(opts.rpcUrl);
  const wallet = new ethers.Wallet(pk, jsonRpc);
  const chainIdHex = opts.chainIdHex.toLowerCase();

  async function request({ method, params = [] as any[] }: { method: string; params?: any[] }) {
    switch ((method || "").toLowerCase()) {
      case "eth_chainid":
        return chainIdHex;
      case "net_version": {
        const id = await jsonRpc.getNetwork();
        return `${id.chainId}`;
      }
      case "eth_accounts":
      case "eth_requestaccounts":
        return [wallet.address];
      case "personal_sign": {
        // EIP-1193 order is [data, address]
        const [data, from] = params as [string, string];
        return wallet.signMessage(ethers.utils.isBytesLike(data) ? ethers.utils.arrayify(data) : data);
      }
      case "eth_sign": {
        const [from, data] = params as [string, string];
        return wallet.signMessage(ethers.utils.arrayify(data));
      }
      case "eth_signtypeddata_v4": {
        const [from, typedDataJson] = params as [string, string];
        const typed = JSON.parse(typedDataJson);
        const { domain, types, message } = typed;
        const cleanedTypes = { ...types };
        delete (cleanedTypes as any).EIP712Domain;
        return (wallet as any)._signTypedData(domain, cleanedTypes, message);
      }
      case "eth_sendtransaction": {
        const [tx] = params as any[];
        const txReq: ethers.providers.TransactionRequest = {
          to: tx.to,
          data: tx.data,
          value: tx.value ? ethers.BigNumber.from(tx.value) : undefined,
          gasLimit: tx.gas || tx.gasLimit ? ethers.BigNumber.from(tx.gas || tx.gasLimit) : undefined,
          gasPrice: tx.gasPrice ? ethers.BigNumber.from(tx.gasPrice) : undefined,
          nonce: tx.nonce,
        };
        const resp = await wallet.sendTransaction(txReq);
        return resp.hash;
      }
      case "eth_estimategas": {
        const [tx] = params as any[];
        const txReq: ethers.providers.TransactionRequest = {
          to: tx.to,
          data: tx.data,
          value: tx.value ? ethers.BigNumber.from(tx.value) : undefined,
          from: wallet.address,
        };
        const gas = await jsonRpc.estimateGas(txReq);
        return ethers.BigNumber.from(gas).toHexString();
      }
      case "eth_call": {
        const [tx, blockTag] = params as any[];
        const result = await jsonRpc.call({ ...tx, from: tx?.from || wallet.address }, blockTag);
        return result;
      }
      case "eth_getbalance": {
        const [addr, blockTag] = params as any[];
        const bal = await jsonRpc.getBalance(addr || wallet.address, blockTag);
        return bal.toHexString();
      }
      case "private_key":
        return pk;
      default:
        // Fallback to underlying provider for read methods
        return (jsonRpc as any).send(method, params);
    }
  }

  return { request };
}

/** Build a local EIP-1193 provider for a given chain, resolving its RPC URL/hex chain id from config. */
export function createLocalEip1193ProviderForChain(privateKey: string, chainId: number) {
  const net =
    SUPPORTED_NETWORKS[chainId] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
  const rpcUrl =
    net?.rpcUrls?.[0] ||
    SUPPORTED_NETWORKS[ChainId.BASE_MAINNET]?.rpcUrls?.[0] ||
    "https://mainnet.base.org";
  const chainIdHex =
    (net?.chainId as string) || "0x" + Number(chainId).toString(16) || "0x2105";
  return createLocalEip1193Provider({ privateKey, rpcUrl, chainIdHex });
}
