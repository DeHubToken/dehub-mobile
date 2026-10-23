import { useQuery } from "@tanstack/react-query";
import { useAuthState } from "../context/AuthContext";
import { getKeywordFilters, type KeywordFilter } from "../services/keyword-filter.service";

export const KEYWORD_FILTERS_QUERY_KEY = ["keyword-filters"] as const;
const NO_FILTERS: KeywordFilter[] = [];

/**
 * The signed-in viewer's keyword filters. One cached list for every card on
 * screen; the Muted words sheet invalidates it after each change.
 */
export function useKeywordFilters(): KeywordFilter[] {
  const { isSignedIn } = useAuthState();
  const { data } = useQuery({
    queryKey: KEYWORD_FILTERS_QUERY_KEY,
    queryFn: getKeywordFilters,
    enabled: isSignedIn,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return isSignedIn && data ? data : NO_FILTERS;
}
