/**
 * Seaport 1.6 orders for the DeHub NFT market (ethers v5 port of dehubweb
 * src/lib/market/seaport.ts).
 *
 * The backend (dehub-stream-backend src/market/seaport.ts) refuses any order
 * shaped differently from what this file builds, so keep all three in step:
 * no zone, no conduit, FULL_OPEN, fixed price, consideration = [seller or NFT,
 * DeHub fee, royalty].
 */
import { ethers } from "ethers";

export const SEAPORT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395";
export const NATIVE = ethers.constants.AddressZero.toLowerCase();
const ZERO_HASH = ethers.constants.HashZero;

export enum ItemType {
  NATIVE = 0,
  ERC20 = 1,
  ERC721 = 2,
  ERC1155 = 3,
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

export const SEAPORT_ABI = [
  `function fulfillOrder((${PARAMS} parameters, bytes signature) order, bytes32 fulfillerConduitKey) payable returns (bool)`,
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

export interface FeeTerms {
  feeRecipient: string;
  feeBps: number;
  royalty: { receiver: string; amount: string } | null;
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
    zone: NATIVE,
    orderType: 0,
    startTime: String(now - 60),
    endTime: String(now + Math.max(1, Math.min(180, days)) * DAY),
    zoneHash: ZERO_HASH,
    salt: ethers.BigNumber.from(ethers.utils.randomBytes(16)).toString(),
    conduitKey: ZERO_HASH,
    counter,
  };
}

/** Royalty owed by someone other than the seller, or nothing. */
function royaltyFor(terms: FeeTerms, seller: string): bigint {
  if (!terms.royalty) return 0n;
  if (terms.royalty.receiver.toLowerCase() === seller.toLowerCase()) return 0n;
  return BigInt(terms.royalty.amount);
}

export function feeOf(price: bigint, terms: FeeTerms): bigint {
  return (price * BigInt(terms.feeBps)) / 10000n;
}

/** What the seller keeps from a sale at `price`. */
export function sellerProceeds(price: bigint, terms: FeeTerms, seller: string): bigint {
  return price - feeOf(price, terms) - royaltyFor(terms, seller);
}

export function royaltyPaid(terms: FeeTerms, seller: string): bigint {
  return royaltyFor(terms, seller);
}

function feeItems(itemType: number, currency: string, price: bigint, terms: FeeTerms, seller: string): ConsiderationItem[] {
  const out: ConsiderationItem[] = [];
  const fee = feeOf(price, terms);
  const item = (amount: bigint, recipient: string): ConsiderationItem => ({
    itemType,
    token: currency,
    identifierOrCriteria: "0",
    startAmount: amount.toString(),
    endAmount: amount.toString(),
    recipient: recipient.toLowerCase(),
  });
  if (fee > 0n) out.push(item(fee, terms.feeRecipient));
  const royalty = royaltyFor(terms, seller);
  if (royalty > 0n) out.push(item(royalty, terms.royalty!.receiver));
  return out;
}

/** A listing: the NFT for `price` (total the buyer pays) in `currency`. */
export function buildListing(args: {
  seller: string;
  nft: NftRef;
  currency: string;
  price: bigint;
  terms: FeeTerms;
  days: number;
  counter: string;
}): OrderComponents {
  const currency = args.currency.toLowerCase();
  const itemType = currency === NATIVE ? ItemType.NATIVE : ItemType.ERC20;
  const proceeds = sellerProceeds(args.price, args.terms, args.seller);
  if (proceeds <= 0n) throw new Error("Price is too low to cover fees");
  return {
    ...base(args.seller, args.days, args.counter),
    offer: [nftItem(args.nft)],
    consideration: [
      {
        itemType,
        token: currency,
        identifierOrCriteria: "0",
        startAmount: proceeds.toString(),
        endAmount: proceeds.toString(),
        recipient: args.seller.toLowerCase(),
      },
      ...feeItems(itemType, currency, args.price, args.terms, args.seller),
    ],
  };
}

/** An offer: `price` of an ERC-20 for the NFT; fees come out of the offer. */
export function buildOffer(args: {
  buyer: string;
  nft: NftRef;
  currency: string;
  price: bigint;
  terms: FeeTerms;
  days: number;
  counter: string;
  holder?: string;
}): OrderComponents {
  const currency = args.currency.toLowerCase();
  if (currency === NATIVE) throw new Error("Offers are made in a token, not the native coin");
  return {
    ...base(args.buyer, args.days, args.counter),
    offer: [{ itemType: ItemType.ERC20, token: currency, identifierOrCriteria: "0", startAmount: args.price.toString(), endAmount: args.price.toString() }],
    consideration: [
      { ...nftItem(args.nft), recipient: args.buyer.toLowerCase() },
      ...feeItems(ItemType.ERC20, currency, args.price, args.terms, args.holder ?? NATIVE),
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
