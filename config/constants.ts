import env from "./env";
import BaseIcon from "../assets/chains/ethereum-icon.png";
import BnbIcon from "../assets/chains/bnb-icon.png";
import BnbTestnet from "../assets/chains/bnb-icon.png";
import GorliTestnet from "../assets/chains/gorli-icon.png";

// export const isDevMode = env.APP_ENV === "development";
export const isDevMode = false;

export enum ChainId {
  MAINNET = 1,
  ROPSTEN = 3,
  RINKEBY = 4,
  GORLI = 5,
  KOVAN = 42,
  BSC_MAINNET = 56,
  BSC_TESTNET = 97,
  HECO_MAINNET = 128,
  HECO_TESTNET = 256,
  FANTOM_MAINNET = 250,
  AVALANCHE_MAINNET = 43114,
  OKEX_MAINNET = 66,
  POLYGON_MAINNET = 137,
  BASE_MAINNET = 8453,
  SEPOLIA = 11155111
}

export const chainIcons: Record<number, any> = {
  [ChainId.BASE_MAINNET]: BaseIcon,
  [ChainId.BSC_MAINNET]: BnbIcon,
  [ChainId.BSC_TESTNET]: BnbTestnet,
  [ChainId.GORLI]:GorliTestnet,
  [ChainId.SEPOLIA]:"https://sepolia.etherscan.io/images/logo-128.png"
};

export const streamInfoKeys = {
  isLockContent: "isLockContent",
  lockContentContractAddress: "lockContentContractAddress",
  lockContentTokenSymbol: "lockContentTokenSymbol",
  lockContentAmount: "lockContentAmount",
  lockContentChainIds: "lockContentChainIds",
  isPayPerView: "isPayPerView",
  payPerViewContractAddress: "payPerViewContractAddress",
  payPerViewTokenSymbol: "payPerViewTokenSymbol",
  payPerViewAmount: "payPerViewAmount",
  payPerViewChainIds: "payPerViewChainIds",
  isAddBounty: "isAddBounty",
  addBountyTokenSymbol: "addBountyTokenSymbol",
  addBountyFirstXViewers: "addBountyFirstXViewers",
  addBountyFirstXComments: "addBountyFirstXComments",
  addBountyAmount: "addBountyAmount",
  addBountyChainId: "addBountyChainId"
};

export const userProfileKeys = {
  username: "username",
  displayName: "displayName",
  email: "email",
  avatarImageUrl: "avatarImageUrl",
  coverImageUrl: "coverImageUrl",
  aboutMe: "aboutMe",
  facebookLink: "facebookLink",
  twitterLink: "twitterLink",
  discordLink: "discordLink",
  instagramLink: "instagramLink",
  tiktokLink: "tiktokLink",
  youtubeLink: "youtubeLink",
  telegramLink: "telegramLink",
  custom1: "custom1",
  custom2: "custom2",
  custom3: "custom3",
  custom4: "custom4",
  custom5: "custom5"
};

export const defaultTokenId = 2;
export const NetworkContextName = "NETWORK";
const devTokens = [
  {
    value: "dhb",
    label: "DHB",
    symbol: "DHB",
    customAbbreviation: "dhb",
    chainId: 97,
    isSubscriptionSupported: true,
    address: "0xeb6ACdcfe1F13187126A504d56f7970bf6f3C5E1",
    iconUrl: "/icons/DHB.png", 
    decimals: 18
  },
  {
    value: "dhb",
    label: "DHB",
    symbol: "DHB",
    customAbbreviation: "dhb",
    chainId: 5,
    address: "0x0F0fBE6FB65AaCE87D84f599924f6524b4F8d858",
    iconUrl: "/icons/DHB.png", 
    decimals: 18
  },
  {
    value: "busd",
    label: "BUSD",
    symbol: "BUSD",
    customAbbreviation: "busd",
    chainId: 97,
    address: "0x53D4A05DF7caAf3302184B774855EcBe2a50bD3E",
    iconUrl: "https://cryptologos.cc/logos/binance-usd-busd-logo.png?v=024",
    decimals: 18
  },
  {
    value: "usdc",
    label: "USDC",
    symbol: "USDC",
    customAbbreviation: "usdc",
    chainId: 97,
    isSubscriptionSupported: true,
    address: "0x4131fd3F1206d48A89410EE610BF1949934e0a72",
    iconUrl: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=024",
    decimals: 18
  },
  {
    value: "eth",
    label: "ETH",
    symbol: "ETH",
    customAbbreviation: "eth",
    chainId: 56,
    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // Update to relevant address if needed
    iconUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=024",
    decimals: 18
  },
  {
    value: "bnb",
    label: "BNB",
    symbol: "BNB",
    customAbbreviation: "bnb",
    chainId: 56,
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // Update to relevant address if needed
    iconUrl: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png?v=024",
    decimals: 18
  }
];

const productionTokens = [
  {
    value: "dhb",
    label: "DHB",
    symbol: "DHB",
    customAbbreviation: "dhb",
    chainId: 8453,
    address: "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c",
    iconUrl: "/icons/DHB.png", 
    mintBlockNumber: 16428469,
    decimals: 18,
    isSubscriptionSupported: true
  },
  {
    value: "usdc",
    label: "USDC",
    symbol: "USDC",
    customAbbreviation: "usdc",
    chainId: 8453,
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    iconUrl: "/icons/tokens/USDC.png",
    decimals: 6,
    isSubscriptionSupported: true
  },
  {
    value: "weth",
    label: "WETH",
    symbol: "WETH",
    customAbbreviation: "weth",
    chainId: 8453,
    address: "0x4200000000000000000000000000000000000006",
    iconUrl: "/icons/tokens/eth.png",
    decimals: 18
  },
  {
    value: "usdt",
    label: "USDT",
    symbol: "USDT",
    customAbbreviation: "usdt",
    chainId: 8453,
    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    iconUrl: "/icons/tokens/USDT.png",
    decimals: 6,
    isSubscriptionSupported: true
  },
];
export const supportedTokens = isDevMode ? devTokens : productionTokens;
export const supportedCurrencies = [
  { code: "usd", enabled: true },
  { code: "aed", enabled: true },
  { code: "ars", enabled: true },
  { code: "aud", enabled: true },
  { code: "bdt", enabled: true },
  { code: "bhd", enabled: true },
  { code: "bmd", enabled: true },
  { code: "brl", enabled: true },
  { code: "cad", enabled: true },
  { code: "chf", enabled: true },
  { code: "clp", enabled: true },
  { code: "cny", enabled: true },
  { code: "czk", enabled: true },
  { code: "dkk", enabled: true },
  { code: "eur", enabled: true },
  { code: "gbp", enabled: true },
  { code: "gel", enabled: true },
  { code: "hkd", enabled: true },
  { code: "huf", enabled: true },
  { code: "idr", enabled: true },
  { code: "ils", enabled: true },
  { code: "inr", enabled: true },
  { code: "jpy", enabled: true },
  { code: "krw", enabled: true },
  { code: "kwd", enabled: true },
  { code: "lkr", enabled: true },
  { code: "mmk", enabled: true },
  { code: "mxn", enabled: true },
  { code: "myr", enabled: true },
  { code: "ngn", enabled: true },
  { code: "nok", enabled: true },
  { code: "nzd", enabled: true },
  { code: "php", enabled: true },
  { code: "pkr", enabled: true },
  { code: "pln", enabled: true },
  { code: "rub", enabled: true },
  { code: "sar", enabled: true },
  { code: "sek", enabled: true },
  { code: "sgd", enabled: true },
  { code: "thb", enabled: true },
  { code: "try", enabled: true },
  { code: "twd", enabled: true },
  { code: "uah", enabled: true },
  { code: "vef", enabled: true },
  { code: "vnd", enabled: true },
  { code: "zar", enabled: true }
];

export const supportedTokensForLockContent = supportedTokens.filter((e) => e.symbol === "DHB");
// export const supportedTokensForPPV = supportedTokens;
// export const supportedTokensForAddBounty = supportedTokens;
export const supportedTokensForPPV = supportedTokensForLockContent;
export const supportedTokensForAddBounty = supportedTokensForLockContent;

export const supportedChainIdsForMinting = [ChainId.BSC_MAINNET, ChainId.BASE_MAINNET];
export const supportedChainIds = isDevMode
  ? [ChainId.BSC_TESTNET, ChainId.GORLI]
  : [ChainId.BSC_MAINNET, ChainId.BASE_MAINNET];
export const defaultChainId = isDevMode ? ChainId.GORLI : ChainId.BASE_MAINNET;
export const defaultTokenSymbol = "DHB";
export const defaultWatchTimeForPPV = 2 * 60 * 60; // second unit
export const devFee = 0.1;
export const publicChatChannelId = "public_chn_prod_1";
export const limitTip = 1_000_000_000;
export const expireSignTime = env.APP_ENV === "development" ? 60 * 60 * 2 : 60 * 60 * 24; // 2 hours

export const ErrMsgEn = {
  lockContent: {},
  ppvContent: {},
  bountyContent: {},
  wallet: {
    connect_to_stream: "Connect wallet to stream",
    connect_to_wallet_to_deposit: "Connect wallet to deposit"
  }
};

export const badges = [
  {
    name: "Crab",
    amount: 10_000
  },
  {
    name: "Lobster",
    amount: 25_000
  },
  {
    name: "Piranha",
    amount: 50_000
  },
  {
    name: "Tortoise",
    amount: 100_000
  },
  {
    name: "Cobra",
    amount: 250_000
  },
  {
    name: "Octopus",
    amount: 500_000
  },
  {
    name: "Crocodite",
    amount: 1_000_000
  },
  {
    name: "Dolphin",
    amount: 2_000_000
  },
  {
    name: "Tiger Shark",
    amount: 3_000_000
  },
  {
    name: "Killer Whale",
    amount: 5_000_000
  },
  {
    name: "Great White Shark",
    amount: 10_000_000
  },
  {
    name: "Blue Whale",
    amount: 20_000_000
  },
  {
    name: "Meglodon",
    amount: 50_000_000
  }
];
export const MAX_CATEGORY_COUNT = 3;

export const MULTICALL2_ADDRESSES: { [chainId: number]: string } = {
  [ChainId.MAINNET]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.ROPSTEN]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.RINKEBY]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.GORLI]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.KOVAN]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.BSC_MAINNET]: "0x41B90b73a88804f2aed1C4672b3dbA74eb9A92ce",
  [ChainId.BSC_TESTNET]: "0x80d0d36d9E3Cb0Bd4561beB1d9d1cC8e1a33F5b1",
  [ChainId.FANTOM_MAINNET]: "0xbb804a896E1A6962837c0813a5F89fDb771d808f",
  [ChainId.AVALANCHE_MAINNET]: "0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154",
  [ChainId.OKEX_MAINNET]: "0xdf4CDd4b8F1790f62a91Bcc4cb793159c641B1bd",
  [ChainId.POLYGON_MAINNET]: "0x275617327c958bD06b5D6b871E7f491D76113dd8",
  [ChainId.BASE_MAINNET]: "0x944afB839712DfF2cCf83D2DaAf34A04B029B2B7"
};

export const DHB_ADDRESSESS: { [chainId: number]: string } = {
  [ChainId.MAINNET]: "0x99BB69Ee1BbFC7706C3ebb79b21C5B698fe58EC0",
  [ChainId.ROPSTEN]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.RINKEBY]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.GORLI]: "0x0F0fBE6FB65AaCE87D84f599924f6524b4F8d858",
  [ChainId.KOVAN]: "0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696",
  [ChainId.BSC_MAINNET]: "0x680D3113caf77B61b510f332D5Ef4cf5b41A761D",
  [ChainId.BSC_TESTNET]: "0x06EdA7889330031a8417f46e4C771C628c0b6418",
  [ChainId.FANTOM_MAINNET]: "0xbb804a896E1A6962837c0813a5F89fDb771d808f",
  [ChainId.AVALANCHE_MAINNET]: "0x84514BeaaF8f9a4cbe25A9C5a7EBdd16B4FE7154",
  [ChainId.OKEX_MAINNET]: "0xdf4CDd4b8F1790f62a91Bcc4cb793159c641B1bd",
  [ChainId.POLYGON_MAINNET]: "0x6051e59eb50BB568415B6C476Fbd394EEF83834D",
  [ChainId.BASE_MAINNET]: "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c"
};

export const SB_ADDRESS: { [chainId: number]: string } = {
  [ChainId.BSC_TESTNET]: "0xEbCea2213AE6c69c74F6f648fcFF6A27842c78F1", //'0x3A76858fb35520c3CA20E826901c7cB73F715251',
  [ChainId.BSC_MAINNET]: "0x64eD1cEf5ba5655DAe565Ee592b6eb229e8CB05C",
  [ChainId.BASE_MAINNET]: "0x91Cb5e924285484Ec666fF969D3941414fcE15d1"
};

export const durations = [
  { title: "1 month", value: 1, tier: 1 },
  { title: "3 months", value: 3, tier: 2 },
  { title: "6 months", value: 6, tier: 3 },
  { title: "1 year", value: 12, tier: 4 },
  { title: "lifetime", value: 999, tier: 5 }
];

export const ActivityActionType = {
  CREATE_LIVE:"CREATE_LIVE",
  UPLOAD_FEED_SIMPLE: "upload-feed-simple",
  UPLOAD_FEED_IMAGES: "upload-feed-images",
  UPLOAD_VIDEO: "upload_video",
  CREATE_PLAN: "create-plan",
  PLAN_PUBLISHED: "plan-published",
  PURCHASE_PLAN: "purchase-plan",
  LIKE: "like",
  DIS_LIKE: "dis-like",
  FOLLOW: "follow",
  REPLY_ON_POST: "reply-on-post",
  COMMENT_ON_POST: "comment-on-post",
  TIP_ON_POST: "tip-on-post",
  TIP_ON_CHAT: "tip-on-chat"
};
export enum StreamStatus {
  OFFLINE = "OFFLINE",
  LIVE = "LIVE",
  ENDED = "ENDED",
  SCHEDULED = "SCHEDULED"
}

export const LIVEPEER_RTMP_SERVER = "rtmp://rtmp.livepeer.com/live";