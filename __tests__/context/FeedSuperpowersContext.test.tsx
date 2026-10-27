import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, act } from '@testing-library/react-native';
import { FeedSuperpowersProvider, useFeedSuperpowers } from '../../context/FeedSuperpowersContext';
import { fetchSuperpowerStatus } from '../../services/superpower.service';
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../services/superpower.service', () => ({ fetchSuperpowerStatus: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: 'wallet' }) }));

it('uses one observer for many cards and propagates mutation invalidation', async () => {
  const fetchStatus = fetchSuperpowerStatus as jest.Mock;
  fetchStatus.mockResolvedValue({ powers: [], boostsLeft: 2 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const observed: number[] = [];
  function Card() { const status = useFeedSuperpowers(); observed.push(status?.boostsLeft ?? -1); return null; }
  const tree = (count: number) => <QueryClientProvider client={client}><FeedSuperpowersProvider>
    {Array.from({ length: count }, (_, i) => <Card key={i} />)}
  </FeedSuperpowersProvider></QueryClientProvider>;
  const view = render(tree(50));
  await waitFor(() => expect(observed).toContain(2));
  view.rerender(tree(100));
  expect(client.getQueryCache().find({ queryKey: ['superpowers', 'status'] })?.getObserversCount()).toBe(1);
  expect(fetchStatus).toHaveBeenCalledTimes(1);
  fetchStatus.mockResolvedValue({ powers: [], boostsLeft: 1 });
  await act(async () => { await client.invalidateQueries({ queryKey: ['superpowers', 'status'] }); });
  await waitFor(() => expect(observed).toContain(1));
  expect(fetchStatus).toHaveBeenCalledTimes(2);
  view.unmount(); client.clear();
});
