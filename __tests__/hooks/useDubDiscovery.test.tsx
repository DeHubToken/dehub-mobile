import React from 'react';
import { act, render } from '@testing-library/react-native';
import { UserContext } from '../../context/AuthContext';
import { useDubDiscovery } from '../../hooks/useDubDiscovery';
import { supabase } from '../../services/supabase';
import { toastInfo } from '../../libs/toast';

const mockRpc = supabase.rpc as jest.Mock;
const mockToast = toastInfo as jest.Mock;
let mockOn = false, mockAt = 0;
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../context/AuthContext', () => ({ UserContext: require('react').createContext(undefined) }));
jest.mock('../../services/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../libs/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));
jest.mock('../../libs/toast', () => ({ toastInfo: jest.fn() }));
jest.mock('../../hooks/useVideoDub', () => ({ getDubSettings: () => ({ on: mockOn }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function player() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    playing: true, muted: false, volume: 1, currentTime: 0, duration: 30, playbackRate: 1,
    addListener: (event: string, listener: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return { remove: () => listeners.get(event)!.delete(listener) };
    },
    emit: (event: string) => listeners.get(event)?.forEach(listener => listener()),
  };
}
function Harness({ p, wallet, source = 'es', open }: { p: ReturnType<typeof player>; wallet: string | null; source?: string; open: () => void }) {
  return <UserContext.Provider value={{ user: wallet ? { address: wallet } : null } as any}>
    <Listener p={p} source={source} open={open} />
  </UserContext.Provider>;
}
function Listener({ p, source, open }: { p: ReturnType<typeof player>; source: string; open: () => void }) {
  useDubDiscovery(p as any, '6543', source, 'en', true, mockOn, open); return null;
}
function pass(p: ReturnType<typeof player>) {
  for (let second = 1; second <= 12; second++) { mockAt += 1000; p.currentTime = second; p.emit('timeUpdate'); }
}
beforeEach(() => {
  mockOn = false; mockAt = 0; mockRpc.mockReset(); mockToast.mockReset();
  mockRpc.mockResolvedValue({ data: true, error: null });
  jest.spyOn(Date, 'now').mockImplementation(() => mockAt);
});
afterEach(() => jest.restoreAllMocks());
it('claims once after an audible replay and opens controls without enabling dubbing', async () => {
  const p = player(), open = jest.fn();
  render(<Harness p={p} wallet="0x4444444444444444444444444444444444444444" open={open} />);
  await act(async () => {});
  pass(p); expect(mockRpc).not.toHaveBeenCalled();
  p.currentTime = 0; p.emit('timeUpdate'); pass(p); await act(async () => {});
  expect(mockRpc).toHaveBeenCalledTimes(1); expect(mockToast).toHaveBeenCalledTimes(1);
  p.playing = false; mockToast.mock.calls[0][1].onActionPress();
  expect(open).toHaveBeenCalledTimes(1); expect(mockOn).toBe(false);
});
it('does not claim for muted playback, unknown language or signed-out playback', () => {
  const p = player(); p.muted = true;
  const view = render(<Harness p={p} wallet="0x5555555555555555555555555555555555555555" open={jest.fn()} />);
  pass(p); p.currentTime = 0; p.emit('timeUpdate'); pass(p);
  p.muted = false;
  view.rerender(<Harness p={p} wallet={null} open={jest.fn()} />); pass(p);
  view.rerender(<Harness p={p} source="und" wallet="0x5555555555555555555555555555555555555555" open={jest.fn()} />); pass(p);
  expect(mockRpc).not.toHaveBeenCalled();
});
