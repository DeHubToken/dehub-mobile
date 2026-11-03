/**
 * Seaport 1.6 orders for the DeHub NFT market (ethers v5 port of dehubweb
 * src/lib/market/seaport.ts).
 *
 * The backend (dehub-stream-backend src/market/seaport.ts) refuses any order
 * shaped differently from what this file builds, so keep all three in step:
 * no zone, no conduit, FULL_OPEN, consideration = [seller or NFT, DeHub fee,
 * royalties]. Listings may fall in price over time and hold up to four NFTs;
 * offers may ask for any NFT of a collection.
 */
import { ethers } from "ethers";

export const SEAPORT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395";
export const NATIVE = ethers.constants.AddressZero.toLowerCase();

export enum ItemType {
  NATIVE = 0,
  ERC20 = 1,
  ERC721 = 2,
  ERC1155 = 3,
  ERC721_WITH_CRITERIA = 4,
  ERC1155_WITH_CRITERIA = 5,
}

export const SEAPORT_TYPES = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
};

export interface OfferItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
}
export interface ConsiderationItem extends OfferItem {
  recipient: string;
}
export interface OrderComponents {
  offerer: string;
  zone: string;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: number;
  startTime: string;
  endTime: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  counter: string;
}

const ITEM = "(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)";
const CITEM = "(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)";
const PARAMS = `(address offerer,address zone,${ITEM}[] offer,${CITEM}[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems)`;
const COMPONENTS = `(address offerer,address zone,${ITEM}[] offer,${CITEM}[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)`;

const RESOLVER = "(uint256 orderIndex,uint8 side,uint256 index,uint256 identifier,bytes32[] criteriaProof)";

export const SEAPORT_ABI = [
  `function fulfillOrder((${PARAMS} parameters, bytes signature) order, bytes32 fulfillerConduitKey) payable returns (bool)`,
  `function fulfillAdvancedOrder((${PARAMS} parameters, uint120 numerator, uint120 denominator, bytes signature, bytes extraData) advancedOrder, ${RESOLVER}[] criteriaResolvers, bytes32 fulfillerConduitKey, address recipient) payable returns (bool)`,
  `function cancel(${COMPONENTS}[] orders) returns (bool)`,
  "function getCounter(address offerer) view returns (uint256)",
];

export const NFT_ABI = [
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
];

export function seaportDomain(chainId: number) {
  return { name: "Seaport", version: "1.6", chainId, verifyingContract: SEAPORT_ADDRESS };
}

export function orderHash(c: OrderComponents): string {
  return ethers.utils._TypedDataEncoder.hashStruct("OrderComponents", SEAPORT_TYPES, c).toLowerCase();
}

/** The full EIP-712 payload, as eth_signTypedData_v4 wants it. */
export function typedDataJson(c: OrderComponents, chainId: number): string {
  return JSON.stringify({
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...SEAPORT_TYPES,
    },
    primaryType: "OrderComponents",
    domain: seaportDomain(chainId),
    message: c,
  });
}

export interface NftRef {
  contract: string;
  tokenId: string;
  standard: "erc721" | "erc1155";
  amount?: string;
}

export interface RoyaltyTerm {
  receiver: string;
  amount: string;
}

export interface FeeTerms {
  feeRecipient: string;
  feeBps: number;
  /** One per creator owed (a bundle can owe several), at the start price. */
  royalty: RoyaltyTerm | RoyaltyTerm[] | null;
}

function royalties(terms: FeeTerms): RoyaltyTerm[] {
  if (!terms.royalty) return [];
  return (Array.isArray(terms.royalty) ? terms.royalty : [terms.royalty]).filter((r) => BigInt(r.amount) > 0n);
}

const DAY = 24 * 60 * 60;

function nftItem(nft: NftRef): OfferItem {
  const amount = nft.standard === "erc721" ? "1" : String(nft.amount ?? "1");
  return {
    itemType: nft.standard === "erc721" ? ItemType.ERC721 : ItemType.ERC1155,
    token: nft.contract.toLowerCase(),
    identifierOrCriteria: nft.tokenId,
    startAmount: amount,
    endAmount: amount,
  };
}

function base(offerer: string, days: number, counter: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    offerer: offerer.toLowerCase(),
    zone: ethers.constants.AddressZero.toLowerCase(),
    orderType: 0,
    startTime: String(now - 60),
    endTime: String(now + Math.max(1, Math.min(180, days)) * DAY),
    zoneHash: ethers.constants.HashZero,
    salt: ethers.BigNumber.from(ethers.utils.randomBytes(16)).toString(),
    conduitKey: ethers.constants.HashZero,
    counter,
  };
}

/** Royalties owed to people other than the seller. */
function owedRoyalties(terms: FeeTerms, seller: string): RoyaltyTerm[] {
  return royalties(terms).filter((r) => r.receiver.toLowerCase() !== seller.toLowerCase());
}

/** Total royalty owed by someone other than the seller. */
function royaltyFor(terms: FeeTerms, seller: string): bigint {
  return owedRoyalties(terms, seller).reduce((s, r) => s + BigInt(r.amount), 0n);
}

export function feeOf(price: bigint, terms: FeeTerms): bigint {
  return (price * BigInt(terms.feeBps)) / 10000n;
}

/** Royalty the seller pays to creators other than themselves. */
export function royaltyPaid(terms: FeeTerms, seller: string): bigint {
  return royaltyFor(terms, seller);
}

/** What the seller keeps from a sale at `price`. */
export function sellerProceeds(price: bigint, terms: FeeTerms, seller: string): bigint {
  return price - (price * BigInt(terms.feeBps)) / 10000n - royaltyFor(terms, seller);
}

/**
 * DeHub fee and royalties. With `endPrice` below `price` every amount falls in
 * step (a price-drop auction), worked out the same way the backend checks it.
 */
function feeItems(itemType: number, currency: string, price: bigint, terms: FeeTerms, seller: string, endPrice = price): ConsiderationItem[] {
  const out: ConsiderationItem[] = [];
  const item = (start: bigint, end: bigint, recipient: string): ConsiderationItem => ({
    itemType,
    token: currency,
    identifierOrCriteria: "0",
    startAmount: start.toString(),
    endAmount: end.toString(),
    recipient: recipient.toLowerCase(),
  });
  const bps = BigInt(terms.feeBps);
  const fee = (price * bps) / 10000n;
  if (fee > 0n) out.push(item(fee, (endPrice * bps) / 10000n, terms.feeRecipient));
  for (const r of owedRoyalties(terms, seller)) {
    const start = BigInt(r.amount);
    out.push(item(start, (start * endPrice) / price, r.receiver));
  }
  return out;
}

/**
 * A listing: one NFT, or a bundle of up to four, for `price` (total the buyer
 * pays) in `currency`. With `endPrice` the price falls steadily to it by the
 * end (a price-drop auction).
 */
export function buildListing(args: {
  seller: string;
  nft: NftRef | NftRef[];
  currency: string;
  price: bigint;
  endPrice?: bigint;
  terms: FeeTerms;
  days: number;
  counter: string;
}): OrderComponents {
  const currency = args.currency.toLowerCase();
  const itemType = currency === NATIVE ? ItemType.NATIVE : ItemType.ERC20;
  const endPrice = args.endPrice && args.endPrice > 0n && args.endPrice < args.price ? args.endPrice : args.price;
  const fees = feeItems(itemType, currency, args.price, args.terms, args.seller, endPrice);
  const proceeds = args.price - fees.reduce((s, f) => s + BigInt(f.startAmount), 0n);
  const endProceeds = endPrice - fees.reduce((s, f) => s + BigInt(f.endAmount), 0n);
  if (proceeds <= 0n || endProceeds <= 0n) throw new Error("Price is too low to cover fees");
  const nfts = Array.isArray(args.nft) ? args.nft : [args.nft];
  return {
    ...base(args.seller, args.days, args.counter),
    offer: nfts.map(nftItem),
    consideration: [
      {
        itemType,
        token: currency,
        identifierOrCriteria: "0",
        startAmount: proceeds.toString(),
        endAmount: endProceeds.toString(),
        recipient: args.seller.toLowerCase(),
      },
      ...fees,
    ],
  };
}

/** What a listing costs right now (it falls over time on a price-drop auction). */
export function currentPrice(c: OrderComponents, nowSeconds = Math.floor(Date.now() / 1000)): bigint {
  const start = BigInt(c.startTime);
  const end = BigInt(c.endTime);
  const now = BigInt(Math.min(Math.max(nowSeconds, Number(c.startTime)), Number(c.endTime)));
  return c.consideration
    .filter((i) => i.itemType === ItemType.NATIVE || i.itemType === ItemType.ERC20)
    .reduce((sum, i) => {
      const a = BigInt(i.startAmount);
      const b = BigInt(i.endAmount);
      if (a === b || end <= start) return sum + a;
      // Seaport rounds up for consideration; close enough for display.
      return sum + (a * (end - now) + b * (now - start)) / (end - start);
    }, 0n);
}

/**
 * An offer: `price` of an ERC-20 for the NFT. The fee and royalty are paid out
 * of the offer when the holder accepts, so they keep price minus fees.
 */
export function buildOffer(args: {
  buyer: string;
  nft: NftRef;
  currency: string;
  price: bigint;
  terms: FeeTerms;
  days: number;
  counter: string;
  /** Who currently holds it; a royalty owed to them is skipped. */
  holder?: string;
  /** Any token of the collection (accepted by whoever holds one). */
  collection?: boolean;
}): OrderComponents {
  const currency = args.currency.toLowerCase();
  if (currency === NATIVE) throw new Error("Offers are made in a token, not the native coin");
  const nft = nftItem(args.nft);
  if (args.collection) {
    nft.itemType = args.nft.standard === "erc721" ? ItemType.ERC721_WITH_CRITERIA : ItemType.ERC1155_WITH_CRITERIA;
    nft.identifierOrCriteria = "0";
  }
  return {
    ...base(args.buyer, args.days, args.counter),
    offer: [{ itemType: ItemType.ERC20, token: currency, identifierOrCriteria: "0", startAmount: args.price.toString(), endAmount: args.price.toString() }],
    consideration: [
      { ...nft, recipient: args.buyer.toLowerCase() },
      ...feeItems(ItemType.ERC20, currency, args.price, args.terms, args.holder ?? ethers.constants.AddressZero),
    ],
  };
}

/** The struct fulfillOrder takes: components minus the counter, plus the item count. */
export function toOrderParameters(c: OrderComponents) {
  const { counter: _counter, ...rest } = c;
  return { ...rest, totalOriginalConsiderationItems: String(c.consideration.length) };
}

/** Native coin a buyer must send to fill a listing (zero for token listings). */
export function nativeValue(c: OrderComponents): bigint {
  return c.consideration
    .filter((i) => i.itemType === ItemType.NATIVE)
    .reduce((sum, i) => sum + BigInt(i.startAmount), 0n);
}

/** Token amount the filler pays out of pocket (listing price, or fees on an offer). */
export function fillerTokenSpend(c: OrderComponents, kind: "listing" | "offer"): { token: string; amount: bigint } | null {
  const items = c.consideration.filter((i) => i.itemType === ItemType.ERC20);
  if (!items.length) return null;
  const amount = items.reduce((sum, i) => sum + BigInt(i.startAmount), 0n);
  return kind === "listing" || amount > 0n ? { token: items[0].token, amount } : null;
}
