import React, { type PropsWithChildren } from 'react';
import { cleanup, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../../services/supabase';
import { useTranscriptTranslation } from '../../hooks/useTranscript';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../services/supabase', () => ({ supabase: { from: jest.fn() } }));
afterEach(cleanup);

it('reads a cached regional translation using the server language tag', () => {
  const client = new QueryClient();
  const translation = { status: 'ready', segments: [{ start: 0, end: 2, text: '你好' }], summary: null, chapters: [], error: null };
  client.setQueryData(['transcript-translation', 'transcript', 'zh-tw'], translation);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useTranscriptTranslation('transcript', 'zh-TW', true), { wrapper });
  expect(result.current.translation).toEqual(translation);
  expect(supabase.from).not.toHaveBeenCalled();
});
