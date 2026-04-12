import { ethers } from "ethers";
import { getWeb3AuthProvider } from "../services/web3auth.service";
import { getAuthMethod } from "../libs/auth.utils";
import STREAM_CONTROLLER_ABI from "../config/abis/stream-controller.json";
import STREAMNFT_ABI from "../config/abis/erc1155.json";
import {
  STREAM_CONTROLLER_CONTRACT_ADDRESSES,
  STREAM_COLLECTION_CONTRACT_ADDRESSES,
} from "../config/web3.constants";

export async function deriveSignerOrProvider(
  eip1193: any,
  withSigner: boolean,
): Promise<{ signerOrProvider: any }> {
  let authMethod: "local" | "web3auth" | null = null;
  try {
    const { method } = await getAuthMethod();
    authMethod = method;
  } catch {}

  if (authMethod === "web3auth") {
    try {
      const wap = await getWeb3AuthProvider();
      const ethProvider = new ethers.providers.Web3Provider(wap as any, "any");
      if (!withSigner) return { signerOrProvider: ethProvider };
      const signer = ethProvider.getSigner();
      try { await signer.getAddress(); } catch {}
      return { signerOrProvider: signer };
    } catch {
      // Fall through to generic derivation
    }
  }

  if ((eip1193 as any)?._isSigner) return { signerOrProvider: eip1193 };
  if ((eip1193 as any)?._isProvider) {
    if (!withSigner) return { signerOrProvider: eip1193 };
  }

  const ethProvider = new ethers.providers.Web3Provider(eip1193 as any, "any");
  if (!withSigner) return { signerOrProvider: ethProvider };

  try {
    const signer = ethProvider.getSigner();
    await signer.getAddress();
    return { signerOrProvider: signer };
  } catch {}

  const hasRequest = typeof eip1193?.request === "function";

  if (hasRequest) {
    try {
      const accounts = await eip1193.request({ method: "eth_accounts" });
      if (Array.isArray(accounts) && accounts.length > 0) {
        const signer = ethProvider.getSigner(accounts[0]);
        await signer.getAddress();
        return { signerOrProvider: signer };
      }
    } catch {}
  }

  if (hasRequest && authMethod === "local") {
    try {
      const privateKey = await eip1193.request({ method: "private_key" });
      if (privateKey) {
        const signer = new ethers.Wallet(privateKey, ethProvider);
        return { signerOrProvider: signer };
      }
    } catch {}
  }

  throw new Error("Unable to derive signer from provider");
}

export async function buildContract(
  provider: any,
  abi: any,
  address: string,
  withSigner = true,
): Promise<any> {
  if (!provider) throw new Error("Provider is missing");
  if (!address) throw new Error("Invalid contract address");

  const { signerOrProvider } = await deriveSignerOrProvider(provider, withSigner);
  return new ethers.Contract(address, abi, signerOrProvider);
}

export async function getContractsForMint(chainId: number): Promise<{
  collectionContract: any;
  controllerContract: any;
}> {
  const provider = await getWeb3AuthProvider();

  const collectionAddr =
    STREAM_COLLECTION_CONTRACT_ADDRESSES[chainId as keyof typeof STREAM_COLLECTION_CONTRACT_ADDRESSES];
  const controllerAddr =
    STREAM_CONTROLLER_CONTRACT_ADDRESSES[chainId as keyof typeof STREAM_CONTROLLER_CONTRACT_ADDRESSES];

  if (!collectionAddr || !controllerAddr) {
    throw new Error(`No contract addresses for chainId ${chainId}`);
  }

  const [collectionContract, controllerContract] = await Promise.all([
    buildContract(provider, STREAMNFT_ABI, collectionAddr, true),
    buildContract(provider, STREAM_CONTROLLER_ABI, controllerAddr, true),
  ]);

  return { collectionContract, controllerContract };
}
