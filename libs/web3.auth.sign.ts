import {
  web3AuthService,
  getWeb3AuthProvider,
} from "../services/web3auth.service";
import { getSigningProvider } from "./provider.registry";
import { getAuthUser, setAuthUser } from "./auth.utils";
import { ethers } from "ethers";
import { parseTxError } from "./web3.util";
import { supportedNetworks } from "../config/web3.constants";

export interface StoredSignatureMeta {
  address: string;
  signature: string;
  timestamp: number; // epoch seconds
}

function generateSignMessage(
  address: string,
  timestamp: number,
  isMobile = true
): string {
  const displayedDate = new Date(timestamp * 1000); // epoch seconds -> Date
  const validityText = isMobile ? "until you log out" : "24 hours";
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for ${validityText}.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;
}

function isSignatureValid(
  meta: StoredSignatureMeta | undefined,
  address: string
): boolean {
  if (!meta) return false;
  return meta.address.toLowerCase() === address.toLowerCase();
}

// Retrieve signature info; if missing/expired prompts new personal sign via Web3Auth
export async function getOrCreateAuthSignature(
  address: string,
  provider?: any,
  chainId: number = 8453
): Promise<StoredSignatureMeta> {
  // We can stash it inside stored user (if matches) or request a fresh one.
  let existingUser = await getAuthUser<any>();
  const existingSig: StoredSignatureMeta | undefined =
    existingUser?.authSignature;

  if (isSignatureValid(existingSig, address)) {
    return existingSig!;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const message = generateSignMessage(address, timestamp, true);
  // Prefer an injected EIP-1193 provider if available
  const injected = provider || getSigningProvider();

  // If this appears to be a Web3Auth/AA flow (no injected.request), check deployment via AA provider
  const isWeb3Auth = !injected || typeof injected.request !== "function";
  if (isWeb3Auth) {
    try {
      const selectedNetwork =
        supportedNetworks.find(
          (n: any) => Number(n.chainId) === Number(chainId)
        ) ||
        supportedNetworks.find(
          (n: any) => String(n.shortName).toLowerCase() === "base"
        );
      const rpcUrl: string | undefined = (selectedNetwork as any)?.rpcUrl;
      if (rpcUrl) {
        const rpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const code = await rpcProvider.getCode(address);
        if (code === "0x") {
          // Deploy smart account via AA provider by sending a no-op tx
          try {
            const aa = await getWeb3AuthProvider();
            const ethersProvider = new ethers.providers.Web3Provider(aa as any);
            const aaSigner = ethersProvider.getSigner();
            const tx = await aaSigner.sendTransaction({
              to: address,
              value: 0,
              data: "0x",
            });
            await tx.wait();
          } catch (deployErr: any) {
            const friendly = parseTxError(deployErr, "send");
            throw new Error(friendly || "Smart account deployment failed");
          }
          const postCode = await rpcProvider.getCode(address);
          if (!postCode || postCode === "0x") {
            throw new Error("Smart account deployment did not complete");
          }
        }
      }
    } catch (err: any) {
      throw new Error(err?.message || "Smart account deployment failed");
    }
  }

  // Sign the message: injected personal_sign if present, else Web3Auth service helper
  let signature: string;
  try {
    if (injected && typeof injected.request === "function") {
      try {
        signature = await injected.request({
          method: "personal_sign",
          params: [message, address],
        });
      } catch {
        signature = await injected.request({
          method: "personal_sign",
          params: [address, message],
        });
      }
    } else {
      signature = await web3AuthService.signPersonalMessage(message, address);
    }
  } catch (e: any) {
    throw new Error(e?.message || "Signing message failed");
  }

  // Validate signature by attempting recovery; if it throws, treat as invalid
  try {
    ethers.utils.verifyMessage(message, signature);
  } catch {
    throw new Error("Invalid signature produced");
  }

  const meta: StoredSignatureMeta = { address, signature, timestamp };

  // Persist by merging into user object if exists
  if (existingUser) {
    existingUser = { ...existingUser, authSignature: meta };
    await setAuthUser(existingUser);
  }

  return meta;
}

export function buildAuthRequestPayload(
  address: string,
  meta: StoredSignatureMeta
) {
  return {
    address: address.toLowerCase(),
    sig: meta.signature,
    timestamp: meta.timestamp,
    isMobile: true,
  };
}
