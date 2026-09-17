import { Connection, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { getSolanaKeypair } from './solana.service';
import { getSolanaRpcUrl } from '../config/solana.constants';
import { apiClient } from '../libs/api.client';
import type { Purchase } from '../libs/crypto-purchase';

export async function sendSolanaPurchase(receipt: Purchase): Promise<string> {
  const keypair = await getSolanaKeypair();
  if (keypair.publicKey.toBase58() !== receipt.refundTo) throw new Error('Connected Solana wallet does not match this purchase.');
  if (receipt.expiresAt * 1000 <= Date.now()) throw new Error('This payment quote expired.');
  const build = await apiClient.post<{ transaction: string }>('/dpay/crypto/direct/transaction', { id: receipt.id }, { isAuthRequired: true });
  const tx = Transaction.from(Buffer.from(build.transaction, 'base64'));
  if (tx.feePayer?.toBase58() !== receipt.refundTo) throw new Error('Invalid payment wallet.');
  tx.partialSign(keypair);
  return new Connection(getSolanaRpcUrl(), 'confirmed').sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
}

export async function connectPurchaseSolanaWallet(baseAddress: string): Promise<void> {
  const { ed25519 } = await import('@noble/curves/ed25519');
  const { base58Encode } = await import('../libs/base58');
  const { buildDeHubLoginMessage } = await import('../libs/dehub-login-message');
  const keypair = await getSolanaKeypair();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = base58Encode(ed25519.sign(Buffer.from(buildDeHubLoginMessage(baseAddress, timestamp), 'utf8'), keypair.secretKey.slice(0, 32)));
  await apiClient.post('/solana/link', { solanaAddress: keypair.publicKey.toBase58(), signature, timestamp }, { isAuthRequired: true });
}
