import React, { useContext, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { NavigationRouteContext } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import { useKeywordFilters } from "../../hooks/useKeywordFilters";
import { filterContextForRoute, matchKeywordFilter } from "../../libs/keyword-filters";
import type { FilterContext } from "../../services/keyword-filter.service";

/**
 * Applies the viewer's keyword filters (Settings → Privacy → Muted words) to
 * whatever it wraps. A "hide" match draws nothing; a "warn" match folds it
 * behind one line naming the filter, with a button to show it anyway. Your
 * own posts and comments are never filtered. Same rule as web's
 * KeywordFilterGate.
 */
export default function KeywordFilterGate({
  texts,
  authorAddress,
  own: knownOwn,
  context,
  children,
}: {
  /** Everything the filter reads: title, body, content warning, alt text. */
  texts: Array<string | null | undefined>;
  /** The author's address, so your own posts pass. */
  authorAddress?: string | null;
  /** Set when the caller already knows this is the viewer's own (a comment). */
  own?: boolean;
  /** Where this is shown; worked out from the screen when not given. */
  context?: FilterContext;
  children: React.ReactNode;
}) {
  const filters = useKeywordFilters();
  const user = useUser();
  // The context, not useRoute: a card drawn outside a screen (a portal, a
  // sheet) has no route, and useRoute throws there.
  const route = useContext(NavigationRouteContext);
  const [shown, setShown] = useState(false);
  const place = context ?? filterContextForRoute(route?.name);
  const viewer = (user?.address || (user as any)?.walletAddress || "").toLowerCase();
  const own = !!knownOwn || (!!viewer && !!authorAddress && authorAddress.toLowerCase() === viewer);
  const textKey = texts.join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const match = useMemo(() => (own ? null : matchKeywordFilter(texts, filters, place)), [own, textKey, filters, place]);

  if (!match || shown) return <>{children}</>;
  if (match.action === "hide") return null;
  return <KeywordFilteredNotice phrase={match.phrase} onShow={() => setShown(true)} />;
}

/** The folded line a "warn" filter leaves in place of what it caught. */
export function KeywordFilteredNotice({ phrase, onShow }: { phrase: string; onShow: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      testID="keyword-filtered"
      className="mx-4 my-2 flex-row items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
    >
      <Icon name="Funnel" size={16} color="#8B8D90" />
      <Text className="ml-3 flex-1 text-sm text-theme-neutrals-300">{t("keywordFilters.filtered", { phrase })}</Text>
      <TouchableOpacity
        onPress={onShow}
        accessibilityRole="button"
        className="ml-3 rounded-full border border-white/15 px-3 py-1"
      >
        <Text className="text-xs font-medium text-white">{t("keywordFilters.showAnyway")}</Text>
      </TouchableOpacity>
    </View>
  );
}
