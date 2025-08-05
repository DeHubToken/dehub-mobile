import "@walletconnect/react-native-compat";
import "@ethersproject/shims";
import {
  createAppKit,
  defaultConfig,
} from "@reown/appkit-ethers5-react-native";
import env from "./env";
import { supportedNetworks } from "./web3.constants";

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
    native: "dehub://",
  },
};

export const config = defaultConfig({ metadata });

// 3. Define fallback chains
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

// 4. Validate and prepare chains
// let chains;
// try {
//   if (Array.isArray(supportedNetworks) && supportedNetworks.length > 0) {
//     // Validate each network has required properties
//     supportedNetworks.forEach((network, index) => {
//       if (!network || typeof network !== "object") {
//         throw new Error(`Invalid network at index ${index}: not an object`);
//       }
//       if (!network.chainId || !network.name || !network.currency) {
//         throw new Error(
//           `Invalid network at index ${index}: missing required properties`
//         );
//       }
//     });
//     chains = [...supportedNetworks];
//   } else {
//     console.warn(
//       "supportedNetworks is empty or invalid, using fallback chains"
//     );
//     chains = [mainnet, polygon];
//   }
// } catch (error) {
//   console.error("Error with supportedNetworks:", error);
//   chains = [mainnet, polygon];
// }

export const chains = [mainnet, polygon];

// 5. Create modal
export const initAppKit = () => {
  try {
    console.log("Initializing AppKit with:", {
      projectId: projectId.substring(0, 10) + "...", // Log partial ID for security
      chainsCount: chains.length,
      metadata: metadata.name,
    });

    return createAppKit({
      projectId,
      metadata,
      chains,
      config,
      enableAnalytics: true,
      features: {
        analytics: true,
        toast: true,
      },
    });
  } catch (error) {
    console.error("Failed to initialize AppKit:", error);
    throw error;
  }
};
