/**
 * Who owns the fractions of one post, port of web's lib/api/token-holders.
 *
 * Every post is an ERC-1155 id with 1000 fractions. The addresses come from
 * the collection's TransferSingle events over roughly the last two weeks on
 * Base (the same window web scans), then each address's current balance is
 * read with balanceOf, so a seller who has since sold out drops off.
 */
import { STREAM_COLLECTION_CONTRACT_ADDRESSES } from "../config/web3.constants";
import { rpc, rpcUrlFor } from "./dao-treasury";

export interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

export const TOTAL_FRACTIONS = 1000;
/** keccak256("TransferSingle(address,address,address,uint256,uint256)") */
const TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
/** balanceOf(address,uint256) */
const BALANCE_OF = "0x00fdd58e";
const RECENT_BLOCKS = BigInt(500_000);
const ZERO = "0x0000000000000000000000000000000000000000";

type Log = { topics: string[]; data: string };

const pad = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const topicAddress = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

export async function getTokenHolders(tokenId: number | string, chainId = 8453): Promise<TokenHolder[]> {
  const contract = (STREAM_COLLECTION_CONTRACT_ADDRESSES as Record<number, string>)[chainId];
  if (!contract) return [];
  const id = BigInt(tokenId);
  const url = await rpcUrlFor(chainId);
  const latest = BigInt(await rpc<string>(url, "eth_blockNumber", []));
  const from = latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : BigInt(0);
  const logs = await rpc<Log[]>(url, "eth_getLogs", [
    { address: contract, topics: [TRANSFER_SINGLE], fromBlock: `0x${from.toString(16)}`, toBlock: "latest" },
  ]);

  const addresses = new Set<string>();
  for (const log of logs) {
    // data = id (32 bytes) then value (32 bytes); id is not indexed.
    if (!log.data || log.data.length < 66 || BigInt(log.data.slice(0, 66)) !== id) continue;
    for (const topic of [log.topics[2], log.topics[3]]) {
      if (!topic) continue;
      const addr = topicAddress(topic);
      if (addr !== ZERO) addresses.add(addr);
    }
  }

  const holders: TokenHolder[] = [];
  const list = [...addresses];
  for (let i = 0; i < list.length; i += 10) {
    const batch = await Promise.all(
      list.slice(i, i + 10).map(async (addr) => {
        try {
          const data = `${BALANCE_OF}${pad(addr)}${pad(id.toString(16))}`;
          const result = await rpc<string>(url, "eth_call", [{ to: contract, data }, "latest"]);
          return { addr, balance: Number(BigInt(result && result !== "0x" ? result : "0x0")) };
        } catch {
          return { addr, balance: 0 };
        }
      }),
    );
    for (const { addr, balance } of batch) {
      if (balance > 0) {
        holders.push({ address: addr, balance, percentage: Math.round((balance / TOTAL_FRACTIONS) * 1000) / 10 });
      }
    }
  }
  return holders.sort((a, b) => b.balance - a.balance);
}
