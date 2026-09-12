import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';

export interface CreatorAsset {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'model3d';
  prompt: string;
  modelName: string;
  url?: string;
  transcript?: string;
  createdAt: number;
}

export async function listCreatorAssets(offset = 0): Promise<{ jobs: CreatorAsset[]; nextOffset: number | null }> {
  const headers = await dehubAuthHeaders();
  if (!headers['x-dehub-token']) throw new Error('Sign in to see your generations.');
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/creator-library`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'list', offset }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load your generations.');
  return data;
}
