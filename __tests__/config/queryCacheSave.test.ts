jest.mock("../../libs/storage", () => ({ storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() } }));
jest.mock("../../libs/errorReporter", () => ({ reportError: jest.fn() }));
jest.mock("react-native", () => ({ AppState: { addEventListener: jest.fn() } }));

import { serializePersistedClient } from "../../config/queryClient";

const query = (key: string, data: unknown) => ({ queryKey: [key], queryHash: key, state: { data, status: "success" } });

it("saves the rest of the cache when one entry cannot be written", () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const client: any = {
    timestamp: 1,
    buster: "v1",
    clientState: { mutations: [], queries: [query("home-feed", { pages: [{ result: [1] }] }), query("balance", { raw: BigInt(5) })] },
  };
  const saved = JSON.parse(serializePersistedClient(client));
  expect(saved.clientState.queries.map((q: any) => q.queryKey[0])).toEqual(["home-feed"]);
  expect(require("../../libs/errorReporter").reportError).toHaveBeenCalledTimes(1);
});

it("writes a clean cache untouched", () => {
  const client: any = { timestamp: 1, buster: "v1", clientState: { mutations: [], queries: [query("home-feed", { pages: [] })] } };
  expect(serializePersistedClient(client)).toBe(JSON.stringify(client));
});

it("saves straight to disk when asked", () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const { queryClient, saveQueryCacheNow } = require("../../config/queryClient");
  const { storage } = require("../../libs/storage");
  queryClient.setQueryData(["home-feed", 1], { pages: [[1], [2]], pageParams: [0, 1] });
  saveQueryCacheNow("test");
  const [key, text] = storage.set.mock.calls[storage.set.mock.calls.length - 1];
  expect(key).toBe("dehub-query-cache");
  const saved = JSON.parse(text);
  expect(saved.buster).toBe("v1");
  expect(saved.clientState.queries[0].state.data.pages).toEqual([[1]]);
  queryClient.clear();
});
