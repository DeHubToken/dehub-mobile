import React, { FC, useState, useEffect, useCallback } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { performSearchByType } from "../../services/search.service";
import SearchAccountsList from "./SearchAccountsList";
import SearchMediaList from "./SearchMediaList";

export interface SearchResultsTabsProps {
  query: string;
  accounts: any[];
  videos: any[];
  livestreams: any[];
  pageAccounts: number;
  pageVideos: number;
  pageLivestreams: number;
  setAccounts: (v: any[]) => void;
  setVideos: (v: any[]) => void;
  setLivestreams: (v: any[]) => void;
  setPageAccounts: (n: number) => void;
  setPageVideos: (n: number) => void;
  setPageLivestreams: (n: number) => void;
}

const SearchResultsTabs: FC<SearchResultsTabsProps> = ({
  query,
  accounts,
  videos,
  livestreams,
  pageAccounts,
  pageVideos,
  pageLivestreams,
  setAccounts,
  setVideos,
  setLivestreams,
  setPageAccounts,
  setPageVideos,
  setPageLivestreams,
}) => {
  const [active, setActive] = useState<"accounts" | "videos" | "livestreams">(
    "videos"
  );
  const [loadingMore, setLoadingMore] = useState(false);

  // hasMore flags per type (assume more only if first page filled PAGE_SIZE)
  const PAGE_SIZE = 20;
  const [hasMoreVideos, setHasMoreVideos] = useState(
    videos.length === PAGE_SIZE
  );
  const [hasMoreLivestreams, setHasMoreLivestreams] = useState(
    livestreams.length === PAGE_SIZE
  );
  const [hasMoreAccounts, setHasMoreAccounts] = useState(
    accounts.length === PAGE_SIZE
  );

  // Reset hasMore flags & active tab when a new search (query change) occurs
  useEffect(() => {
    setHasMoreVideos(videos.length === PAGE_SIZE);
    setHasMoreLivestreams(livestreams.length === PAGE_SIZE);
    setHasMoreAccounts(accounts.length === PAGE_SIZE);
    // Auto select first non-empty tab if current active has no data
    const ordered: Array<"videos" | "livestreams" | "accounts"> = [
      "videos",
      "livestreams",
      "accounts",
    ];
    const datasetByKey: Record<"videos" | "livestreams" | "accounts", any[]> = {
      videos,
      livestreams,
      accounts,
    };
    if (datasetByKey[active]?.length === 0) {
      const firstWithData = ordered.find((k) => datasetByKey[k].length > 0);
      if (firstWithData) setActive(firstWithData);
    }
  }, [query, videos, livestreams, accounts]);

  // Ensure if active tab becomes empty (e.g. data cleared) we jump to another that has data
  useEffect(() => {
    const datasetByKey: Record<"videos" | "livestreams" | "accounts", any[]> = {
      videos,
      livestreams,
      accounts,
    };
    if (datasetByKey[active]?.length === 0) {
      const order: Array<"videos" | "livestreams" | "accounts"> = [
        "videos",
        "livestreams",
        "accounts",
      ];
      const firstWithData = order.find((k) => datasetByKey[k].length > 0);
      if (firstWithData && firstWithData !== active) setActive(firstWithData);
    }
  }, [active, videos.length, livestreams.length, accounts.length]);

  const tabs = [
    { key: "videos" as const, label: "Videos", count: videos.length },
    {
      key: "livestreams" as const,
      label: "Livestreams",
      count: livestreams.length,
    },
    { key: "accounts" as const, label: "Accounts", count: accounts.length },
  ].filter((t) => t.count > 0);

  const fmt = (n: number) => (n >= 99 ? "99+" : String(n));

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    // Determine active dataset & hasMore flag
    const hasMoreMap: Record<"videos" | "livestreams" | "accounts", boolean> = {
      videos: hasMoreVideos,
      livestreams: hasMoreLivestreams,
      accounts: hasMoreAccounts,
    };
    const dataMap: Record<"videos" | "livestreams" | "accounts", any[]> = {
      videos,
      livestreams,
      accounts,
    };
    if (!hasMoreMap[active]) return; // already at end
    if (dataMap[active].length < PAGE_SIZE) return; // guard: dataset smaller than a page -> no further fetch
    setLoadingMore(true);
    const currentPage =
      active === "videos"
        ? pageVideos
        : active === "livestreams"
          ? pageLivestreams
          : pageAccounts;
    const res = await performSearchByType(query, active, {
      page: currentPage,
      unit: PAGE_SIZE,
    });
    if (active === "videos") {
      if (res.videos.length) {
        setVideos([...videos, ...res.videos]);
        setPageVideos(currentPage + 1);
        if (res.videos.length < PAGE_SIZE) setHasMoreVideos(false);
      } else {
        setHasMoreVideos(false);
      }
    } else if (active === "livestreams") {
      if (res.livestreams.length) {
        setLivestreams([...livestreams, ...res.livestreams]);
        setPageLivestreams(currentPage + 1);
        if (res.livestreams.length < PAGE_SIZE) setHasMoreLivestreams(false);
      } else {
        setHasMoreLivestreams(false);
      }
    } else {
      if (res.accounts.length) {
        setAccounts([...accounts, ...res.accounts]);
        setPageAccounts(currentPage + 1);
        if (res.accounts.length < PAGE_SIZE) setHasMoreAccounts(false);
      } else {
        setHasMoreAccounts(false);
      }
    }
    setLoadingMore(false);
  }, [
    loadingMore,
    active,
    hasMoreVideos,
    hasMoreLivestreams,
    hasMoreAccounts,
    videos,
    livestreams,
    accounts,
    pageVideos,
    pageLivestreams,
    pageAccounts,
    query,
  ]);

  const body =
    active === "accounts" ? (
      <SearchAccountsList
        data={accounts}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        hasMore={hasMoreAccounts}
      />
    ) : active === "videos" ? (
      <SearchMediaList
        data={videos}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        hasMore={hasMoreVideos}
        queryType="videos"
      />
    ) : (
      <SearchMediaList
        data={livestreams}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        hasMore={hasMoreLivestreams}
        queryType="livestreams"
      />
    );

  return (
    <View className="flex-1">
      <View className="flex-row px-3 py-3">
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setActive(t.key)}
            className={`px-4 py-2 rounded-md mr-2 ${active === t.key ? "bg-theme-accent" : "bg-theme-neutrals-800"}`}
          >
            <Text
              className={`text-xs font-semibold ${active === t.key ? "text-theme-neutrals-900" : "text-white"}`}
            >
              {t.label} ({fmt(t.count)})
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {body}
    </View>
  );
};

export default SearchResultsTabs;
