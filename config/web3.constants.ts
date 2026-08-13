import { ChainId, isDevMode } from "./constants";
import env from "./env";

export const VAULT_CONTRACT_ADDRESSES = {
  [ChainId.BSC_TESTNET]: "0xc90f5CbB3bb3e9a181b8Fed7d8a4835B291b7c9F",
  [ChainId.GORLI]: "0x067e7613BFe063A778D1799A58Ee78419A0d9B73",
  [ChainId.MAINNET]: "0xfBA69f9a77CAB5892D568144397DC6A2068EceD3",
  [ChainId.BSC_MAINNET]: "0xfBA69f9a77CAB5892D568144397DC6A2068EceD3",
  [ChainId.POLYGON_MAINNET]: "0xfBA69f9a77CAB5892D568144397DC6A2068EceD3",
};

/**
 * Robinhood Chain ships dark until its v3 stream contracts are deployed.
 *
 * Everything else about the chain is wired below — RPC, explorer, wallet-add
 * payload — so turning it on is this flag plus the two addresses. A picker
 * entry whose controller address is empty is an option that fails the moment
 * someone presses send.
 */
export const ROBINHOOD_ENABLED = false;
export const ROBINHOOD_STREAM_COLLECTION = "";
export const ROBINHOOD_STREAM_CONTROLLER = "";

export const STREAM_CONTROLLER_CONTRACT_ADDRESSES = {
  // live networks
  [ChainId.MAINNET]: "0x6e19ba22da239c46941582530c0ef61400b0e3e6",
  [ChainId.BSC_MAINNET]: "0x6e19ba22da239c46941582530c0ef61400b0e3e6",
  [ChainId.POLYGON_MAINNET]: "0x6e19ba22da239c46941582530c0ef61400b0e3e6",
  [ChainId.BASE_MAINNET]: "0x4fa30dAef50c6dc8593470750F3c721CA3275581",
  [ChainId.ROBINHOOD_MAINNET]: ROBINHOOD_STREAM_CONTROLLER,
  // testnets
  [ChainId.GORLI]: "0x2B44a04d2e62d84395EB30f9cF71a256Bc7b158A",
  [ChainId.BSC_TESTNET]: "0x6e19ba22da239c46941582530c0ef61400b0e3e6",
};

export const STAKING_CONTRACT_ADDRESSES = {
  [ChainId.BSC_MAINNET]: "0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6",
};

export const STREAM_COLLECTION_CONTRACT_ADDRESSES = {
  // live networks
  [ChainId.MAINNET]: "0x1065F5922a336C75623B55D22c4a0C760efCe947",
  [ChainId.BSC_MAINNET]: "0x1065F5922a336C75623B55D22c4a0C760efCe947",
  [ChainId.POLYGON_MAINNET]: "0x1065F5922a336C75623B55D22c4a0C760efCe947",
  [ChainId.BASE_MAINNET]: "0x9f8012074d27F8596C0E5038477ACB52057BC934",
  [ChainId.ROBINHOOD_MAINNET]: ROBINHOOD_STREAM_COLLECTION,
  // testnets
  [ChainId.GORLI]: "0xfdFe40A30416e0aEcF4814d1d140e027253c00c7",
  [ChainId.BSC_TESTNET]: "0xfdFe40A30416e0aEcF4814d1d140e027253c00c7",
  // BSC_TESTNET old "0xfdFe40A30416e0aEcF4814d1d140e027253c00c7",
  //BSC_TESTNET dummy 0x5ae62df56ff1e68fb1772a337859b856caeefab6
};

const alchemyKey = env.ALCHEMY_API_KEY;
export const NETWORK_URLS: {
  [chainId: number]: string;
} = {
  // Alchemy when a key is configured, matching the backend. The key is optional
  // in this app, so fall back to a public endpoint rather than shipping a URL
  // with an empty key in it — Ethereum is a supported chain for minting and for
  // the wallet-add payload below, so this has to resolve either way.
  [ChainId.MAINNET]: alchemyKey
    ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : "https://ethereum-rpc.publicnode.com",
  [ChainId.BSC_MAINNET]: "https://binance.nodereal.io",
  [ChainId.BSC_TESTNET]: `https://data-seed-prebsc-1-s2.binance.org:8545`, //'https://bsc-testnet-rpc.publicnode.com',//`
  [ChainId.POLYGON_MAINNET]: "https://polygon-rpc.co",
  // Prefer the public Base RPC for broad compatibility; avoids Alchemy key/timeouts for local providers
  [ChainId.BASE_MAINNET]: `https://mainnet.base.org`,
  // Public sequencer RPC, same reasoning as Base.
  [ChainId.ROBINHOOD_MAINNET]: `https://rpc.mainnet.chain.robinhood.com`,
  [ChainId.ROBINHOOD_TESTNET]: `https://rpc.testnet.chain.robinhood.com`,
};
const testNetworks = [
  {
    id: ChainId.BSC_TESTNET,
    chainId: ChainId.BSC_TESTNET,
    ticker: "BNB",
    currency: "BNB",
    name: "BNB Testnet",
    shortName: "BSC Testnet",
    rpcUrl: NETWORK_URLS[ChainId.BSC_TESTNET],
    explorerUrl: "https://testnet.bscscan.com/",
    value: "BNB Testnet",
    label: "BNB Testnet",
    customAbbreviation: "bsc_test",
  },
];

const mainNetworks = [
  {
    id: ChainId.MAINNET,
    chainId: ChainId.MAINNET,
    ticker: "ETH",
    currency: "ETH",
    name: "Ethereum",
    shortName: "Ethereum",
    rpcUrl: NETWORK_URLS[ChainId.MAINNET],
    explorerUrl: "https://etherscan.io/",
    value: "Ethereum",
    label: "Ethereum",
    customAbbreviation: "eth",
    iconUrl: "",
  },
  {
    id: ChainId.BSC_MAINNET,
    chainId: ChainId.BSC_MAINNET,
    ticker: "BNB",
    currency: "BNB",
    name: "BNB Chain",
    shortName: "BNBChain",
    rpcUrl: NETWORK_URLS[ChainId.BSC_MAINNET],
    explorerUrl: "https://bscscan.com/",
    value: "BNB Chain",
    label: "BNB Chain",
    customAbbreviation: "bnb_chain",
    iconUrl: "",
  },
  {
    id: ChainId.BASE_MAINNET,
    chainId: ChainId.BASE_MAINNET,
    ticker: "ETH",
    currency: "ETH",
    name: "Base",
    shortName: "Base",
    rpcUrl: NETWORK_URLS[ChainId.BASE_MAINNET],
    explorerUrl: "https://basescan.org/",
    value: "Base",
    label: "Base",
    customAbbreviation: "base",
    iconUrl:
      "https://basescan.org/assets/base/images/svg/logos/chain-light.svg?v=25.1.2.0",
  },
  ...(ROBINHOOD_ENABLED
    ? [
        {
          id: ChainId.ROBINHOOD_MAINNET,
          chainId: ChainId.ROBINHOOD_MAINNET,
          ticker: "ETH",
          currency: "ETH",
          name: "Robinhood Chain",
          shortName: "Robinhood",
          rpcUrl: NETWORK_URLS[ChainId.ROBINHOOD_MAINNET],
          explorerUrl: "https://robinhoodchain.blockscout.com/",
          value: "Robinhood Chain",
          label: "Robinhood Chain",
          customAbbreviation: "robinhood",
          iconUrl: "",
        },
      ]
    : []),
];

export const supportedNetworks = isDevMode ? testNetworks : mainNetworks;

const TEST_NETWORKS = {
  [ChainId.BSC_TESTNET]: {
    chainId: "0x61",
    chainName: "BSC Testnet",
    nativeCurrency: {
      name: "Binance",
      symbol: "BNB",
      decimals: 18,
    },
    rpcUrls: [NETWORK_URLS[ChainId.BSC_TESTNET]],
    blockExplorerUrls: ["https://testnet.bscscan.com/"],
  },
};

const MAIN_NETWORKS = {
  [ChainId.MAINNET]: {
    chainId: "0x1",
    chainName: "Ethereum",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [NETWORK_URLS[ChainId.MAINNET]],
    blockExplorerUrls: ["https://etherscan.io"],
  },
  [ChainId.FANTOM_MAINNET]: {
    chainId: "0xfa",
    chainName: "Fantom",
    nativeCurrency: {
      name: "Fantom",
      symbol: "FTM",
      decimals: 18,
    },
    rpcUrls: ["https://rpc.ftm.tools"],
    blockExplorerUrls: ["https://ftmscan.com"],
  },
  [ChainId.BSC_MAINNET]: {
    chainId: "0x38",
    chainName: "BNB Chain",
    nativeCurrency: {
      name: "Binance Coin",
      symbol: "BNB",
      decimals: 18,
    },
    rpcUrls: ["https://binance.nodereal.io"],
    blockExplorerUrls: ["https://bscscan.com"],
  },
  [ChainId.AVALANCHE_MAINNET]: {
    chainId: "0xA86A",
    chainName: "Avalanche C",
    nativeCurrency: {
      name: "Avalanche Coin",
      symbol: "AVAX",
      decimals: 18,
    },
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    blockExplorerUrls: ["https://snowtrace.io"],
  },
  [ChainId.OKEX_MAINNET]: {
    chainId: "0x42",
    chainName: "OKC",
    nativeCurrency: {
      name: "OKC Coin",
      symbol: "OKT",
      decimals: 18,
    },
    rpcUrls: ["https://exchainrpc.okex.org"],
    blockExplorerUrls: ["https://www.oklink.com/en/okc"],
  },
  [ChainId.ROBINHOOD_MAINNET]: {
    // 4663. Note the docs print 0x123F on the connection page, which decodes
    // to 4671 — the chain's own eth_chainId answers 0x1237.
    chainId: "0x1237",
    chainName: "Robinhood Chain",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  },
  [ChainId.BASE_MAINNET]: {
    chainId: "0x2105",
    chainName: "Base Mainnet",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
};
export const SUPPORTED_NETWORKS = isDevMode ? TEST_NETWORKS : MAIN_NETWORKS;

export const appScheme = "dehub";
