import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../libs/api.client';

const HISTORY_KEY = 'search_history_v1';
const MAX_HISTORY = 25;

export interface SearchResultItem {
  id?: string | number;
  title?: string;
  type?: string;
  // extend as backend evolves
  [k: string]: any;
}

export interface StructuredSearchResult {
  accounts: any[];
  videos: any[];
  livestreams: any[];
}

export interface SearchResponse { result: SearchResultItem[] | StructuredSearchResult }

export async function fetchSuggestions(q: string): Promise<string[]> {
  if (!q?.trim()) return [];
  try {
    const res = await apiClient.get<string[]>(`/search/suggestions?q=${encodeURIComponent(q.trim())}`);
    return Array.isArray(res) ? res.slice(0, 5) : [];
  } catch (e) {
    console.warn('[search.service] fetchSuggestions error', e);
    return [];
  }
}

export async function performSearch(q: string, opts?: { page?: number; unit?: number; address?: string }): Promise<{ result: StructuredSearchResult }> {
  if (!q?.trim()) return { result: { accounts: [], videos: [], livestreams: [] } };
  const params = new URLSearchParams();
  params.set('q', q.trim());
  if (opts?.page != null) params.set('page', String(opts.page));
  if (opts?.unit != null) params.set('unit', String(opts.unit));
  if (opts?.address) params.set('address', opts.address);
  try {
    const res = await apiClient.get<any>(`/search?${params.toString()}`);
    const raw = (res as any)?.result || res?.result || res;
    if (raw && (raw.accounts || raw.videos || raw.livestreams)) {
      return {
        result: {
          accounts: raw.accounts || [],
          videos: raw.videos || [],
          livestreams: raw.livestreams || [],
        }
      };
    }
    return { result: { accounts: [], videos: [], livestreams: [] } };
  } catch (e) {
    console.warn('[search.service] performSearch error', e);
    return { result: { accounts: [], videos: [], livestreams: [] } };
  }
}

export async function performSearchByType(q: string, type: 'accounts' | 'videos' | 'livestreams', opts?: { page?: number; unit?: number; address?: string }): Promise<StructuredSearchResult> {
  if (!q?.trim()) return { accounts: [], videos: [], livestreams: [] };
  const params = new URLSearchParams();
  params.set('q', q.trim());
  params.set('type', type);
  if (opts?.page != null) params.set('page', String(opts.page));
  if (opts?.unit != null) params.set('unit', String(opts.unit));
  if (opts?.address) params.set('address', opts.address);
  try {
    const res = await apiClient.get<any>(`/search?${params.toString()}`);
    const raw = (res as any)?.result || res?.result || res;
    return {
      accounts: raw.accounts || [],
      videos: raw.videos || [],
      livestreams: raw.livestreams || [],
    };
  } catch (e) {
    console.warn('[search.service] performSearchByType error', e);
    return { accounts: [], videos: [], livestreams: [] };
  }
}

export async function getHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[search.service] getHistory error', e);
    return [];
  }
}

export async function addToHistory(term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return;
  try {
    const current = await getHistory();
    const next = [t, ...current.filter(x => x !== t)].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[search.service] addToHistory error', e);
  }
}

export async function clearHistory() {
  try { await AsyncStorage.removeItem(HISTORY_KEY); } catch (e) { console.warn('[search.service] clearHistory error', e); }
}

export function topHistorySubset(history: string[], limit = 6) {
  return history.slice(0, limit);
}
