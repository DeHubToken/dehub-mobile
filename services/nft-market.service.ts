/**
 * NFT market: API reads (api.dehub.io /api/market) and the wallet steps that
 * trade on Seaport. Same backend and order shape as dehub.io/nfts.
 *
 * Signing happens on the chain the wallet is signed in for (switching chain is
 * a full re-auth in the app), so a trade on the other chain is refused up front
 * with a clear message instead of being sent to the wrong network.
 */
import { ethers } from "ethers";
import { apiClient } from "../libs/api.client";
import { writeContractAA } from "../libs/aa.write";
import { receiptRpcUrls } from "../libs/transaction-receipt";
import { buildContract } from "../hooks/use-web3";
import {
  NFT_ABI,
  SEAPORT_ABI,
  SEAPORT_ADDRESS,
  fillerTokenSpend,
  nativeValue,
  toOrderParameters,
  typedDataJson,
  type FeeTerms,
  type OrderComponents,
} from "../libs/market/seaport";

export const MARKET_CHAINS = [56, 8453, 1, 4663] as const;
export const CHAIN_LABEL: Record<number, string> = { 56: "BNB", 8453: "Base", 1: "Ethereum", 4663: "Robinhood" };
export const EXPLORER: Record<number, string> = {
  56: "https://bscscan.com",
  8453: "https://basescan.org",
  1: "https://etherscan.io",
  4663: "https://robinhoodchain.blockscout.com",
};

/** Read-only RPCs for the market's chains (receiptRpcUrls covers BNB and Base). */
const MARKET_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  4663: "https://rpc.mainnet.chain.robinhood.com",
};

export interface MarketCurrency {
  address: string;
  symbol: string;
  decimals: number;
  feeBps: number;
}

export interface MarketConfig {
  seaport: string;
  feeRecipient: string | null;
  maxRoyaltyBps: number;
  chains: { chainId: number; currencies: MarketCurrency[] }[];
}

export interface MarketOrder {
  orderHash: string;
  kind: "listing" | "offer";
  chainId: number;
  maker: string;
  contract: string;
  tokenId: string;
  standard: "erc721" | "erc1155";
  amount: string;
  currency: string;
  currencySymbol: string;
  currencyDecimals: number;
  price: string;
  fee: string;
  royalty: string;
  status: "active" | "unfillable" | "filled" | "cancelled" | "expired";
  startTime: string;
  endTime: string;
  taker: string | null;
  fillTxHash: string | null;
  filledAt: string | null;
  nftName: string | null;
  nftImage: string | null;
  collectionName: string | null;
  isDehub: boolean;
  createdAt: string;
  components: OrderComponents;
  signature: string;
  /** Every NFT in the order (several for a bundle); tokenId "*" = any in the collection. */
  items?: { contract: string; tokenId: string; standard: "erc721" | "erc1155"; amount: string; name?: string | null; image?: string | null }[];
  /** An offer on any NFT of the collection. */
  isCollection?: boolean;
  /** Price at the end of a price-drop auction (equals price otherwise). */
  endPrice?: string;
  makerProfile?: { username: string | null; displayName: string | null; avatarImageUrl: string | null } | null;
}

export interface WalletNft {
  contract: string;
  tokenId: string;
  standard: "erc721" | "erc1155";
  name: string | null;
  image: string | null;
  collectionName: string | null;
  balance: string;
}

export interface NftDetail {
  nft: { contract: string; tokenId: string; name: string | null; image: string | null; collectionName: string | null; standard?: string };
  chainId: number;
  isDehub: boolean;
  listings: MarketOrder[];
  offers: MarketOrder[];
  sales: MarketOrder[];
}

/** What the sheet is opened on: an order, or an NFT someone holds. */
export interface NftTarget {
  chainId: number;
  contract: string;
  tokenId: string;
  standard?: "erc721" | "erc1155";
  name?: string | null;
  image?: string | null;
  collectionName?: string | null;
}

export interface MarketAlert {
  id: string;
  chainId: number;
  contract: string;
  tokenId: string | null;
  /** In whole tokens (e.g. 0.5), not wei. */
  maxPrice: number | null;
  currency: string | null;
  createdAt: string;
}

export interface MarketCollection {
  chainId: number;
  contract: string;
  name: string | null;
  image: string | null;
  isDehub: boolean;
  listed: number;
  floor: { amount: string; symbol: string; decimals: number } | null;
  /** Riftn Posts: how many are minted (listed or not). */
  minted?: number;
  /** Sales so far and their total, in the coin it sells in most. */
  sales?: number;
  volume?: { amount: number; symbol: string } | null;
}

export interface BestOffer {
  contract: string;
  tokenId: string;
  orderHash: string;
  price: string;
  currencySymbol: string;
  currencyDecimals: number;
  isCollection: boolean;
}

/** A listing on OpenSea, bought through their fulfillment API. */
export interface OpenSeaListing {
  source: "opensea";
  orderHash: string;
  protocolAddress: string;
  chainId: number;
  contract: string;
  tokenId: string;
  standard: "erc721" | "erc1155";
  price: string;
  currencySymbol: string;
  currencyDecimals: number;
  collectionName: string | null;
  collectionSlug: string;
  nftName: string | null;
  nftImage: string | null;
}

/** Chains OpenSea lists that the market also runs on. */
export const OPENSEA_CHAINS = [8453, 1] as const;

/** "1.24 ETH" style, short. */
export function formatVolume(v: { amount: number; symbol: string }): string {
  const n = v.amount;
  const s = n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
  return `${s} ${v.symbol}`;
}

export interface ShowcaseNft {
  chainId: number;
  contract: string;
  tokenId: string;
  name: string;
  image: string | null;
  minter: string | null;
}

// ─── Reads ───────────────────────────────────────────────────────────────

const open = { isAuthRequired: false, quiet: true } as const;

export const nftMarket = {
  config: () => apiClient.fetch<MarketConfig>("/market/config", open),
  orders: (params: Record<string, string | number | undefined>) =>
    apiClient.fetch<{ items: MarketOrder[]; hasMore: boolean }>("/market/orders", { ...open, params }),
  collections: (params: Record<string, string | number | undefined>) =>
    apiClient.fetch<{ items: MarketCollection[] }>("/market/collections", { ...open, params }),
  showcase: (params: Record<string, string | number | undefined>) =>
    apiClient.fetch<{ items: ShowcaseNft[]; collections: { chainId: number; contract: string; name: string; image: string | null; minted: number }[] }>(
      "/market/showcase",
      { ...open, params },
    ),
  nft: (chainId: number, contract: string, tokenId: string) =>
    apiClient.fetch<NftDetail>(`/market/nft/${chainId}/${contract}/${tokenId}`, open),
  wallet: (address: string, chainId: number, pageKey?: string) =>
    apiClient.fetch<{ items: WalletNft[]; pageKey: string | null }>(`/market/wallet/${address}`, { ...open, params: { chainId, pageKey } }),
  terms: (params: { chainId: number; contract: string; tokenId: string; price: string; currency: string }) =>
    apiClient.fetch<FeeTerms & { fee: string }>("/market/terms", { ...open, params }),
  sync: (orderHash: string, txHash?: string) =>
    apiClient.fetch<{ order: MarketOrder }>(`/market/orders/${orderHash}/sync`, { ...open, method: "POST", body: txHash ? { txHash } : {} }),
  post: (body: { kind: "listing" | "offer"; chainId: number; components: OrderComponents; signature: string }) =>
    apiClient.fetch<{ order: MarketOrder }>("/market/orders", { method: "POST", body }),
  bestOffers: (chainId: number, items: { contract: string; tokenId: string }[]) =>
    apiClient.fetch<{ items: BestOffer[] }>("/market/best-offers", { ...open, method: "POST", body: { chainId, items: items.slice(0, 100) } }),
  openSea: (chainId: number) => apiClient.fetch<{ items: OpenSeaListing[] }>("/market/opensea", { ...open, params: { chainId } }),
  openSeaFulfill: (body: { chainId: number; orderHash: string; protocolAddress: string; fulfiller: string }) =>
    apiClient.fetch<{ to: string; value: string; data: string; function: string; chainId: number }>("/market/opensea/fulfill", { ...open, method: "POST", body }),
  alerts: () => apiClient.fetch<{ items: MarketAlert[] }>("/market/alerts", { quiet: true }),
  addAlert: (body: { chainId: number; contract: string; tokenId?: string | null; maxPrice?: number | null; currency?: string | null }) =>
    apiClient.fetch<{ alert: MarketAlert }>("/market/alerts", { method: "POST", body }),
  removeAlert: (id: string) => apiClient.fetch<{ ok: boolean }>(`/market/alerts/${id}`, { method: "DELETE" }),
};

// ─── Chain reads ─────────────────────────────────────────────────────────

const readers = new Map<number, ethers.providers.StaticJsonRpcProvider>();
function reader(chainId: number) {
  let p = readers.get(chainId);
  if (!p) {
    p = new ethers.providers.StaticJsonRpcProvider({ url: MARKET_RPC[chainId] ?? receiptRpcUrls(chainId)[0], timeout: 10000 }, chainId);
    readers.set(chainId, p);
  }
  return p;
}

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

export async function counterOf(address: string, chainId: number): Promise<string> {
  const seaport = new ethers.Contract(SEAPORT_ADDRESS, SEAPORT_ABI, reader(chainId));
  return (await seaport.getCounter(address)).toString();
}

/** How many of this NFT `owner` holds right now (0 or 1 for an ERC-721). */
export async function holding(owner: string, target: NftTarget): Promise<bigint> {
  const nft = new ethers.Contract(target.contract, NFT_ABI, reader(target.chainId));
  try {
    if (target.standard === "erc1155") return BigInt((await nft.balanceOf(owner, target.tokenId)).toString());
    const who: string = await nft.ownerOf(target.tokenId);
    return who.toLowerCase() === owner.toLowerCase() ? 1n : 0n;
  } catch {
    return 0n;
  }
}

export async function tokenBalance(token: string, owner: string, chainId: number): Promise<bigint> {
  const erc20 = new ethers.Contract(token, ERC20_ABI, reader(chainId));
  return BigInt((await erc20.balanceOf(owner)).toString());
}

// ─── Wallet steps ────────────────────────────────────────────────────────

export class WrongChainError extends Error {}

export interface Signer {
  /** EIP-1193 provider of the signed-in wallet. */
  provider: any;
  /** The signed-in address (the Safe for most accounts). */
  account: string;
  /** The chain that wallet signs on. */
  chainId: number;
}

function assertChain(s: Signer, chainId: number) {
  if (Number(s.chainId) !== Number(chainId)) {
    throw new WrongChainError(CHAIN_LABEL[chainId] ?? String(chainId));
  }
}

async function sent(res: { hash?: string; wait: (n?: number) => Promise<any> }) {
  const receipt = await res.wait(1);
  if (receipt && receipt.status !== 1) throw new Error("The transaction failed");
  return (res.hash || receipt?.transactionHash || "") as string;
}

async function ensureNftApproval(s: Signer, contract: string) {
  const ro = new ethers.Contract(contract, NFT_ABI, reader(s.chainId));
  const approved = await ro.isApprovedForAll(s.account, SEAPORT_ADDRESS).catch(() => false);
  if (approved) return;
  const c = await buildContract(s.provider, NFT_ABI, contract, true);
  if (!c) throw new Error("Wallet not ready");
  await sent(await writeContractAA(c, "setApprovalForAll", [SEAPORT_ADDRESS, true], { context: "nft-approve" }));
}

async function ensureTokenAllowance(s: Signer, token: string, amount: bigint) {
  const ro = new ethers.Contract(token, ERC20_ABI, reader(s.chainId));
  const allowance = BigInt((await ro.allowance(s.account, SEAPORT_ADDRESS).catch(() => 0)).toString());
  if (allowance >= amount) return;
  const c = await buildContract(s.provider, ERC20_ABI, token, true);
  if (!c) throw new Error("Wallet not ready");
  await sent(await writeContractAA(c, "approve", [SEAPORT_ADDRESS, amount.toString()], { context: "approve" }));
}

async function signOrder(s: Signer, components: OrderComponents): Promise<string> {
  return (await s.provider.request({
    method: "eth_signTypedData_v4",
    params: [s.account, typedDataJson(components, s.chainId)],
  })) as string;
}

/** List an NFT you hold: approve the collection once, sign, post. */
export async function listNft(s: Signer, contract: string, build: (counter: string) => OrderComponents) {
  await ensureNftApproval(s, contract);
  return postSigned(s, "listing", build);
}

/** Offer a token on an NFT: allowance for the amount, sign, post. */
export async function offerOnNft(s: Signer, token: string, amount: bigint, build: (counter: string) => OrderComponents) {
  await ensureTokenAllowance(s, token, amount);
  return postSigned(s, "offer", build);
}

async function postSigned(s: Signer, kind: "listing" | "offer", build: (counter: string) => OrderComponents) {
  const components = build(await counterOf(s.account, s.chainId));
  const signature = await signOrder(s, components);
  const { order } = await nftMarket.post({ kind, chainId: s.chainId, components, signature });
  return order;
}

export function checkChain(s: Signer, chainId: number) {
  assertChain(s, chainId);
}

/**
 * Buy a listing, or accept an offer on an NFT you hold. A collection offer
 * names no token, so `tokenId` says which of yours it takes.
 */
export async function fillOrder(s: Signer, order: MarketOrder, tokenId?: string): Promise<string> {
  assertChain(s, order.chainId);
  if (order.kind === "offer") await ensureNftApproval(s, order.contract);
  const spend = fillerTokenSpend(order.components, order.kind);
  if (spend && spend.amount > 0n) await ensureTokenAllowance(s, spend.token, spend.amount);
  const seaport = await buildContract(s.provider, SEAPORT_ABI, SEAPORT_ADDRESS, true);
  if (!seaport) throw new Error("Wallet not ready");
  const context = order.kind === "listing" ? "nft-buy" : "nft-accept";
  const tx = order.isCollection
    ? await writeContractAA(
        seaport,
        "fulfillAdvancedOrder",
        [
          { parameters: toOrderParameters(order.components), numerator: 1, denominator: 1, signature: order.signature, extraData: "0x" },
          // side 1 = consideration: the NFT the offerer asked for, resolved to the one being sold.
          [{ orderIndex: 0, side: 1, index: 0, identifier: tokenId ?? order.tokenId, criteriaProof: [] }],
          ethers.constants.HashZero,
          ethers.constants.AddressZero,
        ],
        { context },
      )
    : await (async () => {
        // A price-drop auction is sent at its start price; Seaport refunds the difference.
        const value = nativeValue(order.components);
        return writeContractAA(
          seaport,
          "fulfillOrder",
          [{ parameters: toOrderParameters(order.components), signature: order.signature }, ethers.constants.HashZero],
          { value: value > 0n ? value.toString() : undefined, context },
        );
      })();
  const hash = await sent(tx);
  await nftMarket.sync(order.orderHash, hash || undefined).catch(() => undefined);
  return hash;
}

/**
 * Buy several listings in one transaction (the cart). All on one chain, in
 * one currency; a listing that sold meanwhile is skipped and refunded.
 */
export async function fillListings(s: Signer, orders: MarketOrder[]): Promise<string> {
  if (!orders.length) throw new Error("Nothing to buy");
  if (orders.length === 1) return fillOrder(s, orders[0]);
  const chainId = orders[0].chainId;
  if (orders.some((o) => o.kind !== "listing" || o.chainId !== chainId || o.currency !== orders[0].currency)) {
    throw new Error("Pick listings on one chain, in one currency");
  }
  assertChain(s, chainId);
  const spends = orders.map((o) => fillerTokenSpend(o.components, "listing")).filter((x): x is { token: string; amount: bigint } => !!x);
  const spendTotal = spends.reduce((sum, x) => sum + x.amount, 0n);
  if (spends.length && spendTotal > 0n) await ensureTokenAllowance(s, spends[0].token, spendTotal);
  const seaport = await buildContract(s.provider, SEAPORT_ABI, SEAPORT_ADDRESS, true);
  if (!seaport) throw new Error("Wallet not ready");
  const value = orders.reduce((sum, o) => sum + nativeValue(o.components), 0n);
  const hash = await sent(
    await writeContractAA(
      seaport,
      "fulfillAvailableOrders",
      [
        orders.map((o) => ({ parameters: toOrderParameters(o.components), signature: o.signature })),
        orders.flatMap((o, i) => o.components.offer.map((_, j) => [{ orderIndex: i, itemIndex: j }])),
        orders.flatMap((o, i) => o.components.consideration.map((_, j) => [{ orderIndex: i, itemIndex: j }])),
        ethers.constants.HashZero,
        orders.length,
      ],
      { value: value > 0n ? value.toString() : undefined, context: "nft-buy" },
    ),
  );
  await Promise.all(orders.map((o) => nftMarket.sync(o.orderHash, hash || undefined).catch(() => undefined)));
  return hash;
}

/**
 * Buy one OpenSea listing. OpenSea returns the signed transaction data; it is
 * rebuilt by function name here so it goes through the same wallet path.
 */
export async function buyOpenSea(s: Signer, l: OpenSeaListing): Promise<string> {
  assertChain(s, l.chainId);
  const tx = await nftMarket.openSeaFulfill({ chainId: l.chainId, orderHash: l.orderHash, protocolAddress: l.protocolAddress, fulfiller: s.account });
  if (tx.to.toLowerCase() !== l.protocolAddress.toLowerCase()) throw new Error("That listing cannot be bought here");
  const fragment = `function ${tx.function} payable`;
  const iface = new ethers.utils.Interface([fragment]);
  const name = Object.values(iface.functions)[0].name;
  const args = iface.decodeFunctionData(name, tx.data);
  const c = await buildContract(s.provider, [fragment], tx.to, true);
  if (!c) throw new Error("Wallet not ready");
  return sent(await writeContractAA(c, name, [...args], { value: BigInt(tx.value) > 0n ? tx.value : undefined, context: "nft-buy" }));
}

/** Cancel on-chain so a copy of the signed order can never be filled later. */
export async function cancelOrder(s: Signer, order: MarketOrder): Promise<string> {
  assertChain(s, order.chainId);
  const seaport = await buildContract(s.provider, SEAPORT_ABI, SEAPORT_ADDRESS, true);
  if (!seaport) throw new Error("Wallet not ready");
  const hash = await sent(await writeContractAA(seaport, "cancel", [[order.components]], { context: "nft-cancel" }));
  await nftMarket.sync(order.orderHash, hash || undefined).catch(() => undefined);
  return hash;
}
