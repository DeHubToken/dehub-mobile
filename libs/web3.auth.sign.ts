import {
  web3AuthService,
  getWeb3AuthProvider,
} from "../services/web3auth.service";
import { getSigningProvider } from "./provider.registry";
import { getAuthUser, setAuthUser } from "./auth.utils";
import { ethers } from "ethers";
import { supportedNetworks } from "../config/web3.constants";
import { createLogger } from "./logger";

const log = createLogger("web3.auth.sign");

export interface StoredSignatureMeta {
  address: string;
  signature: string;
  timestamp: number; // epoch seconds
}

// Maximum signature age in seconds (30 days) - signatures older than this are considered invalid
// This prevents indefinitely valid signatures which could be a security risk
const SIGNATURE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

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
  address: string,
  maxAgeSeconds: number = SIGNATURE_MAX_AGE_SECONDS
): boolean {
  if (!meta) return false;
  
  // Check address match
  if (meta.address.toLowerCase() !== address.toLowerCase()) {
    return false;
  }
  
  // Check timestamp - signature should not be older than maxAgeSeconds
  const currentTime = Math.floor(Date.now() / 1000);
  const signatureAge = currentTime - meta.timestamp;
  
  if (signatureAge > maxAgeSeconds) {
    return false; // Signature is too old
  }
  
  // Also reject signatures with future timestamps (clock skew protection)
  if (meta.timestamp > currentTime + 300) { // Allow 5 minutes of clock skew
    return false;
  }
  
  return true;
}

// =============================================================================
// Smart Account Deployment
// =============================================================================

const DEPLOYMENT_MAX_RETRIES = 3;
const DEPLOYMENT_RETRY_DELAY_MS = 2000;
const DEPLOYMENT_VERIFICATION_RETRIES = 5;
const DEPLOYMENT_VERIFICATION_DELAY_MS = 3000;

/**
 * Check if a smart account is already deployed at the given address
 */
async function isSmartAccountDeployed(
  address: string,
  rpcProvider: ethers.providers.JsonRpcProvider
): Promise<boolean> {
  try {
    const code = await rpcProvider.getCode(address);
    return code !== "0x" && code !== "0x0" && code.length > 2;
  } catch (err) {
    log.warn("isSmartAccountDeployed:check:error", { address, err });
    return false;
  }
}

/**
 * Wait for smart account deployment to be confirmed on-chain
 * Polls the RPC provider until code is present at the address
 */
async function waitForDeploymentConfirmation(
  address: string,
  rpcProvider: ethers.providers.JsonRpcProvider,
  maxRetries: number = DEPLOYMENT_VERIFICATION_RETRIES,
  delayMs: number = DEPLOYMENT_VERIFICATION_DELAY_MS
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    log.debug("waitForDeploymentConfirmation:poll", { 
      attempt: i + 1, 
      maxRetries, 
      address 
    });
    
    const deployed = await isSmartAccountDeployed(address, rpcProvider);
    if (deployed) {
      log.info("waitForDeploymentConfirmation:confirmed", { address, attempt: i + 1 });
      return true;
    }
    
    // Wait before next poll
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return false;
}

/**
 * Deploy smart account by sending a no-op transaction
 * This triggers the AA bundler to deploy the smart contract wallet
 */
async function deploySmartAccount(
  address: string,
  rpcProvider: ethers.providers.JsonRpcProvider,
  chainId: number
): Promise<void> {
  log.info("deploySmartAccount:start", { address, chainId });
  
  const aa = await getWeb3AuthProvider();
  if (!aa) {
    throw new Error("Web3Auth provider not available for deployment");
  }

  // Verify the AA provider is on the expected chain
  try {
    const providerChain = await aa.request?.({ method: "eth_chainId" });
    const parsedChain = typeof providerChain === "string" && providerChain.startsWith("0x")
      ? parseInt(providerChain, 16)
      : Number(providerChain);
    if (!Number.isNaN(parsedChain) && parsedChain !== chainId) {
      log.warn("deploySmartAccount:chainMismatch", {
        expected: chainId,
        actual: parsedChain,
        msg: "AA provider is on a different chain than target — deployment may fail",
      });
    }
  } catch {}
  
  const ethersProvider = new ethers.providers.Web3Provider(aa as any);
  const aaSigner = ethersProvider.getSigner();
  
  // Send a no-op transaction to self to trigger deployment
  // The AA bundler will deploy the smart contract wallet as part of this
  log.debug("deploySmartAccount:sendingTx", { address, chainId });
  
  const tx = await aaSigner.sendTransaction({
    to: address,
    value: 0,
    data: "0x",
  });
  
  log.debug("deploySmartAccount:txSent", { hash: tx.hash, chainId });
  
  // Wait for transaction to be mined
  const receipt = await tx.wait();
  log.info("deploySmartAccount:txMined", { 
    hash: tx.hash, 
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    chainId,
  });
  
  if (receipt.status !== 1) {
    throw new Error(`Smart account deployment transaction failed on chain ${chainId}`);
  }
}

/**
 * Ensures the smart account is deployed before proceeding with signing
 * This MUST complete before any auth signature is requested
 * 
 * Flow:
 * 1. Check if smart account already has code deployed
 * 2. If not, trigger deployment via no-op transaction
 * 3. Wait and verify deployment is complete
 * 4. Retry if needed
 */
export async function ensureSmartAccountDeployed(
  address: string,
  chainId: number = 8453
): Promise<void> {
  log.info("ensureSmartAccountDeployed:start", { address, chainId });
  
  // Get RPC provider for the target chain
  const selectedNetwork =
    supportedNetworks.find(
      (n: any) => Number(n.chainId) === Number(chainId)
    ) ||
    supportedNetworks.find(
      (n: any) => String(n.shortName).toLowerCase() === "base"
    );
    
  const rpcUrl: string | undefined = (selectedNetwork as any)?.rpcUrl;
  if (!rpcUrl) {
    log.warn("ensureSmartAccountDeployed:noRpcUrl", { chainId });
    // Can't verify deployment without RPC, proceed optimistically
    return;
  }
  
  const rpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
  
  // Check if already deployed
  const alreadyDeployed = await isSmartAccountDeployed(address, rpcProvider);
  if (alreadyDeployed) {
    log.info("ensureSmartAccountDeployed:alreadyDeployed", { address, chainId });
    return;
  }
  
  log.info("ensureSmartAccountDeployed:needsDeployment", { address, chainId });
  
  // Attempt deployment with retries
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < DEPLOYMENT_MAX_RETRIES; attempt++) {
    try {
      log.debug("ensureSmartAccountDeployed:attempt", { 
        attempt: attempt + 1, 
        maxRetries: DEPLOYMENT_MAX_RETRIES,
        chainId,
      });
      
      // Deploy the smart account
      await deploySmartAccount(address, rpcProvider, chainId);
      
      // Wait for deployment to be confirmed on-chain
      const confirmed = await waitForDeploymentConfirmation(address, rpcProvider);
      
      if (confirmed) {
        log.info("ensureSmartAccountDeployed:success", { address, chainId });
        return;
      }
      
      log.warn("ensureSmartAccountDeployed:notConfirmed", { 
        address, 
        attempt: attempt + 1,
        chainId,
      });
      
    } catch (err: any) {
      lastError = err;
      log.error("ensureSmartAccountDeployed:attemptFailed", { 
        attempt: attempt + 1, 
        error: err?.message,
        chainId,
      });
      
      // Wait before retry
      if (attempt < DEPLOYMENT_MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, DEPLOYMENT_RETRY_DELAY_MS));
      }
    }
  }
  
  // All retries exhausted — surface the error and abort.
  const msg = lastError?.message || "Smart account deployment failed";
  log.error("ensureSmartAccountDeployed:allRetriesFailed", {
    address,
    chainId,
    lastError: msg,
  });
  throw new Error(`Could not deploy smart account: ${msg}`);
}

// =============================================================================
// Auth Signature
// =============================================================================

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
    // Ensure smart account is deployed BEFORE attempting to sign
    await ensureSmartAccountDeployed(address, chainId);
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
