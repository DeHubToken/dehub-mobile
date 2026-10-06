import { readStoredSessionUserId } from "../../libs/supabase-session";

const store = (value: string | null) => ({ getItem: jest.fn().mockResolvedValue(value) });

describe("readStoredSessionUserId", () => {
  it("reads the user id from the stored session without touching the network", async () => {
    const s = store(JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 1, user: { id: "uid-1" } }));
    await expect(readStoredSessionUserId(s, "sb-proj-auth-token")).resolves.toBe("uid-1");
    expect(s.getItem).toHaveBeenCalledWith("sb-proj-auth-token");
  });

  it("returns null when there is no usable stored session", async () => {
    await expect(readStoredSessionUserId(store(null), "k")).resolves.toBeNull();
    await expect(readStoredSessionUserId(store("{oops"), "k")).resolves.toBeNull();
    await expect(readStoredSessionUserId(store(JSON.stringify({ user: {} })), "k")).resolves.toBeNull();
    await expect(readStoredSessionUserId(store("x"), undefined)).resolves.toBeNull();
  });
});
