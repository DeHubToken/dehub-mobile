jest.mock("../../libs/api.client", () => ({ apiClient: { get: jest.fn() } }));

import { parseHypeTrain } from "../../services/live-hype.service";

describe("hype train", () => {
  it("reads the stream API's train like web", () => {
    const t = parseHypeTrain({ streamId: "s1", active: true, level: 0, into: 40, need: 0, top: [{ username: "mal", points: "12" }, {}, {}, {}] });
    expect(t).toMatchObject({ streamId: "s1", level: 1, need: 1, into: 40, ended: false });
    expect(t!.top).toHaveLength(3);
    expect(t!.top[0]).toMatchObject({ username: "mal", points: 12 });
  });
  it("ignores anything without a stream", () => {
    expect(parseHypeTrain(null)).toBeNull();
    expect(parseHypeTrain({ level: 2 })).toBeNull();
  });
});
