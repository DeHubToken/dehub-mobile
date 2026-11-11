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
