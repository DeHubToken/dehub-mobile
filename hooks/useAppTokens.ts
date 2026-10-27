import { useQuery } from "@tanstack/react-query";
import { useAuthState, useUser } from "../context/AuthContext";
import { getAppTokensConfig, getMyAppTokens } from "../services/app-tokens.service";

export const APP_TOKENS_QUERY_KEY = "app-tokens-me";

/** Whether app tokens are switched on. The server decides, for web and the app at once. */
export function useAppTokensEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["app-tokens-config"],
    queryFn: getAppTokensConfig,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.enabled === true;
}

/** The signed-in account's app-token balance and latest movements. */
export function useAppTokens(enabled = true) {
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const address = user?.walletAddress || user?.address;
  return useQuery({
    queryKey: [APP_TOKENS_QUERY_KEY, address?.toLowerCase() ?? null],
    queryFn: getMyAppTokens,
    enabled: enabled && isSignedIn && !!address,
    staleTime: 15_000,
    retry: false,
  });
}
