// WinterSnow reads the signed-in user for its Santa Snake leaderboard, which
// the app's backdrop never shows.
export function useAuth() {
  return { user: null, walletAddress: null, isAuthenticated: false } as never;
}
