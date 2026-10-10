import { useContext } from 'react';
import { NavigationRouteContext } from '@react-navigation/native';
import { useDraftState, type DraftSetter } from './useDraftState';

export function draftIdentity(entity: unknown): string | null {
  if (typeof entity === 'string' || typeof entity === 'number') return String(entity);
  if (Array.isArray(entity)) {
    const parts = entity.map(draftIdentity);
    return parts.every(part => part !== null) ? JSON.stringify(parts) : null;
  }
  if (!entity || typeof entity !== 'object') return null;
  const record = entity as Record<string, unknown>;
  for (const key of ['tokenId', 'id', '_id', 'projectId', 'wallet_address', 'address', 'slug']) {
    if (typeof record[key] === 'string' || typeof record[key] === 'number') return `${key}:${record[key]}`;
  }
  return null;
}

/** Navigation keys change on reopen; retain only stable entity identifiers from params. */
export function useSurfaceDraft<T>(field: string, initial: T | (() => T), identity?: string | number | null): [T, DraftSetter<T>] {
  const route = useContext(NavigationRouteContext);
  const params = Object.entries(route?.params ?? {})
    .filter(([key, value]) => /(?:^id$|Id$|Address$|^slug$)/.test(key) && (typeof value === 'string' || typeof value === 'number'))
    .sort(([a], [b]) => a.localeCompare(b));
  const place = identity === undefined ? JSON.stringify([route?.name ?? 'app', params]) : identity;
  return useDraftState(place === null ? null : `field:${JSON.stringify([field, place])}`, initial);
}
