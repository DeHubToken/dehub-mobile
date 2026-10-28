import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCachedVideoDub } from '../../hooks/useCachedVideoDub';
import { supabase } from '../../services/supabase';
jest.mock('../../services/supabase', () => ({ supabase: {
  from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn(), functions: { invoke: jest.fn() },
} }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: jest.requireActual('react').createElement }));
afterEach(cleanup);
it('keeps newer realtime completion when a request finishes late, and isolates languages', async () => {
  let receive!: (event: any) => void;
  let finish!: (value: any) => void;
  const db: any = { select: () => db, eq: () => db, maybeSingle: async () => ({ data: null }) };
  (supabase.from as any).mockReturnValue(db);
  (supabase.functions.invoke as any).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  (supabase.channel as any).mockImplementation(() => {
    const channel: any = { on: (_type: any, _filter: any, callback: any) => { receive = callback; return channel; }, subscribe: () => channel };
    return channel;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client, children });
  const hook = renderHook(() => useCachedVideoDub('t1', 'es', true), { wrapper });
  await waitFor(() => expect(finish).toBeDefined());
  act(() => receive({ new: { language: 'es', provider: 'chatterbox-multilingual-v3', status: 'ready', audio_url: 'voice.m4a' } }));
  await act(async () => finish({ data: { status: 'processing' } }));
  await waitFor(() => expect(hook.result.current?.status).toBe('ready'));
  expect(hook.result.current?.audioUrl).toBe('voice.m4a');
  act(() => receive({ new: { language: 'fr', provider: 'chatterbox-multilingual-v3', status: 'failed' } }));
  expect(client.getQueryData(['cached-video-dub', 't1', 'es'])).toMatchObject({ status: 'ready' });
  hook.unmount(); client.clear();
});
