import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockGetAccount = jest.fn();

jest.mock("../../services/user.service", () => ({
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  removeFollower: jest.fn(),
}));
jest.mock("../../services/block.service", () => ({ blockUser: jest.fn(), unblockUser: jest.fn() }));
jest.mock("../../libs/misc", () => ({
  getAvatarUrl: () => "",
  getCoverUrl: () => "",
  getBadgeName: () => "",
  getBadgeUrl: () => "",
  resolveBadgeBalance: () => 0,
  resolveBadgeLock: () => undefined,
  resolveBadgeUsername: () => undefined,
  getDefaultBanner: () => null,
  shareProfile: jest.fn(),
}));
jest.mock("../../libs/strings.util", () => ({ truncateAddress: (value: string) => value }));
jest.mock("../../libs/date.util", () => ({ formatJoinedDate: () => "" }));
jest.mock("../../libs", () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
jest.mock("../../libs/error-feedback", () => ({ reportActionError: jest.fn() }));
jest.mock("../../libs/validators.util", () => ({ maxStacked: () => 0 }));
jest.mock("../../libs/numbers.util", () => ({ resolveCount: () => 0 }));
jest.mock("../../config", () => ({ WEBSITE_LINK: "https://dehub.io" }));
jest.mock("../../context/AuthContext", () => ({
  useUser: () => null,
  useAuthActions: () => ({ requireAuth: jest.fn(), patchUser: jest.fn() }),
}));
jest.mock("../../hooks/useDM", () => ({ useDM: () => ({ conversations: [] }) }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

import { useUserProfileData } from "../../hooks/useUserProfileData";

const httpError = (status?: number) => Object.assign(new Error("request failed"), status ? { status } : {});
const account = (username: string) => ({ result: { _id: `id-${username}`, address: `0x${username}`, username } });

// The profile cache is module-level, so every test asks for a different person.
describe("useUserProfileData load errors", () => {
  beforeEach(() => {
    mockGetAccount.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore?.();
  });

  it("reports notFound for a 404 instead of leaving the skeleton up", async () => {
    mockGetAccount.mockRejectedValueOnce(httpError(404));
    const { result } = renderHook(() => useUserProfileData(true, "ghost404"));
    await waitFor(() => expect(result.current.error).toBe("notFound"));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reports notFound for an empty 200 shell and does not cache it", async () => {
    mockGetAccount.mockResolvedValue({ result: { balanceData: [], followersList: [], followingsList: [] } });
    const { result, unmount } = renderHook(() => useUserProfileData(true, "0xdead"));
    await waitFor(() => expect(result.current.error).toBe("notFound"));
    expect(result.current.data).toBeNull();
    unmount();

    renderHook(() => useUserProfileData(true, "0xdead"));
    await waitFor(() => expect(mockGetAccount).toHaveBeenCalledTimes(2));
  });

  it("reports failed for a network error, and retry recovers", async () => {
    mockGetAccount.mockRejectedValueOnce(httpError()).mockResolvedValueOnce(account("flaky"));
    const { result } = renderHook(() => useUserProfileData(true, "flaky"));
    await waitFor(() => expect(result.current.error).toBe("failed"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data?.username).toBe("flaky"));
    expect(result.current.error).toBeNull();
    expect(mockGetAccount).toHaveBeenCalledTimes(2);
  });

  it("drops the previous person's profile when the next one fails", async () => {
    mockGetAccount.mockResolvedValueOnce(account("alice")).mockRejectedValueOnce(httpError(500));
    const { result, rerender } = renderHook(
      ({ who }: { who: string }) => useUserProfileData(true, who),
      { initialProps: { who: "alice" } },
    );
    await waitFor(() => expect(result.current.data?.username).toBe("alice"));

    rerender({ who: "bob" });
    await waitFor(() => expect(result.current.error).toBe("failed"));
    expect(result.current.data).toBeNull();
  });

  it("clears the error when the sheet closes", async () => {
    mockGetAccount.mockRejectedValueOnce(httpError(404));
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useUserProfileData(visible, "closer"),
      { initialProps: { visible: true } },
    );
    await waitFor(() => expect(result.current.error).toBe("notFound"));

    rerender({ visible: false });
    expect(result.current.error).toBeNull();
  });
});
