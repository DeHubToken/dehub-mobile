// Side-effect imports for walletconnect & ethers shims are already loaded once in index.ts.
// Avoid duplicating them here to prevent multiple relayer/event listener registrations.
import {
  createAppKit,
  defaultConfig,
} from "@reown/appkit-ethers5-react-native";
import env from "./env";
import { appScheme, supportedNetworks } from "./web3.constants";

// 1. Validate projectId
export const projectId = env.REOWN_PROJECT_ID;

if (!projectId) {
  console.error("REOWN_PROJECT_ID is missing from environment variables");
  throw new Error("REOWN_PROJECT_ID is required");
}

// 2. Create config
export const metadata = {
  name: "Dehub.io",
  description: "Dehub.io Mobile",
  url: "https://dehub.io",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
  redirect: {
    native: `${appScheme}://`,
    universal: "https://dehub.io",
  },
};

export const config = defaultConfig({ metadata });

// 4. Validate and prepare chains
const mainnet = {
  chainId: 1,
  name: "Ethereum",
  currency: "ETH",
  explorerUrl: "https://etherscan.io",
  rpcUrl: "https://cloudflare-eth.com",
};

const polygon = {
  chainId: 137,
  name: "Polygon",
  currency: "MATIC",
  explorerUrl: "https://polygonscan.com",
  rpcUrl: "https://polygon-rpc.com",
};

let chains;
try {
  if (Array.isArray(supportedNetworks) && supportedNetworks.length > 0) {
    // Validate each network has required properties
    supportedNetworks.forEach((network, index) => {
      if (!network || typeof network !== "object") {
        throw new Error(`Invalid network at index ${index}: not an object`);
      }
      if (!network.chainId || !network.name || !network.currency) {
        throw new Error(
          `Invalid network at index ${index}: missing required properties`
        );
      }
    });
    chains = [...supportedNetworks];
  } else {
    console.warn(
      "supportedNetworks is empty or invalid, using fallback chains"
    );
    // chains = [mainnet, polygon];
  }
} catch (error) {
  console.error("Error with supportedNetworks:", error);
  // chains = [mainnet, polygon];
}
chains = [mainnet, polygon];

// export const chains = [mainnet, polygon];

console.log("Creating AppKit at module level with:", {
  projectId: projectId.substring(0, 10) + "...",
  chainsCount: Array.isArray(chains) ? chains.length : 0,
  metadata: metadata.name,
});

// initializeAppKit (guard against multiple inits on Fast Refresh)
const APPKIT_GLOBAL_KEY = "__REOWN_APPKIT_INITIALIZED__" as const;

if (!(globalThis as any)[APPKIT_GLOBAL_KEY]) {
  createAppKit({
    projectId,
    metadata,
    chains,
    config,
    enableAnalytics: true,
    // relayUrl: "wss://relay.walletconnect.com",
    // relayUrl: "wss://relay.walletconnect.org"

  });

  (globalThis as any)[APPKIT_GLOBAL_KEY] = true;
  console.log("AppKit created at module level");
} else {
  console.log("AppKit already initialized, skipping.");
}
