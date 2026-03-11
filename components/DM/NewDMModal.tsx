import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { User } from "../../context/AuthContext";
import { usersSearch } from "../../services/user.service";
import { useDebounceCallback } from "../../hooks/useDebounceCallback";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import GlassModal from "../ui/GlassModal";
import { useDM } from "../../hooks/useDM";
import { useAuth } from "../../context/AuthContext";
import { toastInfo } from "../../libs/toast";

// Row component to avoid inline functions and improve list performance
type ResultRowProps = {
  item: User;
  onPress: (u: User) => void;
  inContacts: boolean;
};
const ResultRow: React.FC<ResultRowProps> = ({ item, onPress, inContacts }) => {
  const addr = (item.walletAddress || (item as any).address) as string;
  const display =
    (item as any).displayName ||
    (item as any).username ||
    truncateAddress(addr);
  const subtitle = (item as any).username
    ? `@${(item as any).username}`
    : truncateAddress(addr);
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  return (
    <TouchableOpacity
      className="flex-row items-center py-2.5 px-1"
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Avatar uri={getAvatarUrl((item as any).avatarImageUrl)} size={44} name={display} />
      <View className="ml-3 flex-1">
        <Text className="text-white text-[15px] font-medium" numberOfLines={1}>
          {display}
        </Text>
        <Text className="text-theme-neutrals-400 text-[12px] mt-0.5" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {inContacts && (
        <View className="bg-theme-neutrals-700/60 rounded-full px-2.5 py-1">
          <Text className="text-theme-neutrals-300 text-[11px]">Message</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export type NewDMModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (user: User) => void;
};

const NewDMModal: React.FC<NewDMModalProps> = ({
  open,
  onOpenChange,
  onSelect,
}) => {
  const { user } = useAuth();
  const selfAddr = ((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase();
  // Reset all local state
  const searchRef = useRef<TextInput | null>(null);
  const searchIdRef = useRef<number>(0);
  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    setLoading(false);
    searchIdRef.current++;
  }, []);

  const close = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [onOpenChange, reset]);
  const handleSelect = useCallback(
    (u: User) => {
      onSelect(u);
      // Close after navigating
      setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 100);
    },
    [onSelect, onOpenChange, reset]
  );

  // Local state for user/address search
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<User[]>([]);
  const [showResults, setShowResults] = useState<boolean>(false);
  // Simplified: treat query as username or address identically and just search
  const { conversations } = useDM();
  const inContactsSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations as any[]) {
      const parts = Array.isArray(c?.participants) ? c.participants : [];
      for (const p of parts) {
        const a = (p?.participant?.address || "").toLowerCase();
        if (a) set.add(a);
      }
    }
    return set;
  }, [conversations]);

  // Suggestions (quick picks from existing contacts) when no active query
  const suggestions = useMemo(() => {
    const out: Partial<User & { address?: string }>[] = [];
    if (!open) return out;
    const q = (query || "").trim();
    if (q.length >= 2) return out;
    const seen = new Set<string>();
    for (const c of conversations as any[]) {
      const other = c?.participants?.[0]?.participant;
      const addr = (other?.address || "").toLowerCase();
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      out.push({
        username: other?.username,
        displayName: other?.displayName,
        walletAddress: other?.address,
        address: other?.address,
        avatarImageUrl: other?.avatarImageUrl,
      } as any);
      if (out.length >= 8) break;
    }
    return out;
  }, [open, query, conversations]);

  const performSearch = useCallback(
    async (text: string) => {
      const q = (text || "").trim();
      if (!showResults || q.length < 2) {
        setLoading(false);
        if (q.length === 0) setResults([]);
        return;
      }
      const reqId = ++searchIdRef.current;
      try {
        setLoading(true);
        const res: any = await usersSearch(q);
        if (searchIdRef.current === reqId) {
          const arr = (res?.data?.result || res?.result || []) as User[];
          // Filter out self
          const filtered = Array.isArray(arr)
            ? arr.filter((u: any) => ((u?.walletAddress || u?.address || "").toLowerCase() !== selfAddr))
            : [];
          setResults(filtered as User[]);
        }
      } catch (e) {
        if (searchIdRef.current === reqId) {
          console.warn("[NewDMModal] usersSearch failed", e);
        }
      } finally {
        if (searchIdRef.current === reqId) setLoading(false);
      }
    },
    [showResults, selfAddr]
  );
  const debouncedSearch = useDebounceCallback(performSearch, 250);

  useEffect(() => {
    if (!open) return;
    debouncedSearch(query);
  }, [query, debouncedSearch, open]);

  useEffect(() => {
    if (open) {
      reset();
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      reset();
    }
  }, [open, reset]);

  const onChangeSearch = useCallback((t: string) => {
    setQuery(t);
    const trimmed = (t || "").trim();
    if (trimmed.length === 0) {
      setLoading(false);
      setShowResults(false);
      setResults([]);
      searchIdRef.current++;
    } else {
      setLoading(trimmed.length >= 2);
      setShowResults(trimmed.length >= 2);
    }
  }, []);

  const startDMWith = useCallback(
    (u: User) => {
      Keyboard.dismiss();
      setShowResults(false);
      const addr = ((u as any)?.walletAddress || (u as any)?.address || "").toLowerCase();
      if (addr && addr === selfAddr) {
        toastInfo("You can’t message yourself");
        return;
      }
      handleSelect(u);
    },
    [handleSelect, selfAddr]
  );

  return (
    <GlassModal
      visible={open}
      onClose={close}
      presentation="center"
      blurIntensity={40}
    >
      <View className="rounded-shadow-xl">
        {/* Instagram-style header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-theme-neutrals-700/50">
          <TouchableOpacity
            onPress={close}
            className="w-9 h-9 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#F9FBFF" />
          </TouchableOpacity>
          <Text className="text-white text-[17px] font-semibold">
            New Message
          </Text>
          <View className="w-9" />
        </View>

        {/* "To:" search field */}
        <View className="flex-row items-center px-4 py-2.5 border-b border-theme-neutrals-700/30">
          <Text className="text-theme-neutrals-400 text-[15px] font-medium mr-2">
            To:
          </Text>
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={onChangeSearch}
            placeholder="Search..."
            placeholderTextColor="#6B7280"
            className="flex-1 text-white text-[15px]"
            returnKeyType="search"
            onFocus={() => setShowResults((query || "").trim().length >= 2)}
            autoFocus
            onSubmitEditing={() => {
              const trimmed = (query || "").trim();
              if (trimmed.length >= 2) setShowResults(true);
            }}
          />
          {query ? (
            <TouchableOpacity
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              className="w-7 h-7 rounded-full bg-theme-neutrals-700 items-center justify-center"
            >
              <Ionicons name="close" size={14} color="#B4B8BE" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="px-4 max-h-[55vh]">
          {/* Suggested contacts when no query */}
          {suggestions.length > 0 && (query || "").trim().length < 2 ? (
            <View className="mt-3">
              <Text className="text-white text-[14px] font-semibold mb-2.5">
                Suggested
              </Text>
              <FlatList
                data={suggestions as any[]}
                keyExtractor={(item: any) =>
                  String(item?.address || item?.walletAddress)
                }
                renderItem={({ item }) => {
                  const addr = String(
                    item?.walletAddress || item?.address || ""
                  );
                  const display =
                    (item as any)?.displayName ||
                    (item as any)?.username ||
                    truncateAddress(addr);
                  const subtitle = (item as any)?.username
                    ? `@${(item as any).username}`
                    : truncateAddress(addr);
                  const onPress = () => startDMWith(item as User);
                  return (
                    <TouchableOpacity
                      className="flex-row items-center py-2"
                      onPress={onPress}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <Avatar
                        uri={getAvatarUrl((item as any)?.avatarImageUrl)}
                        size={44}
                        name={display}
                      />
                      <View className="ml-3 flex-1">
                        <Text
                          className="text-white text-[15px] font-medium"
                          numberOfLines={1}
                        >
                          {display}
                        </Text>
                        <Text
                          className="text-theme-neutrals-400 text-[12px] mt-0.5"
                          numberOfLines={1}
                        >
                          {subtitle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          ) : null}

          {/* Search results */}
          {showResults ? (
            <View className="mt-2">
              {loading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator size="small" color="#9CA3AF" />
                </View>
              ) : results.length > 0 ? (
                <FlatList
                  data={results}
                  keyExtractor={(item) =>
                    String((item as any).address || item.walletAddress)
                  }
                  renderItem={({ item }) => (
                    <ResultRow
                      item={item}
                      onPress={startDMWith}
                      inContacts={inContactsSet.has(
                        (
                          item.walletAddress ||
                          (item as any).address ||
                          ""
                        ).toLowerCase()
                      )}
                    />
                  )}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  removeClippedSubviews
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  showsVerticalScrollIndicator={false}
                />
              ) : (
                <View className="py-10 items-center">
                  <Ionicons name="person-outline" size={40} color="#4B5563" />
                  <Text className="text-theme-neutrals-300 text-[14px] mt-3">
                    No accounts found
                  </Text>
                  <Text className="text-theme-neutrals-500 text-[12px] mt-1 text-center px-4">
                    Try searching with their username or wallet address
                  </Text>
                </View>
              )}
            </View>
          ) : !suggestions.length ? (
            <View className="py-10 items-center">
              <Ionicons name="chatbubble-ellipses-outline" size={40} color="#4B5563" />
              <Text className="text-theme-neutrals-400 text-[13px] mt-3 text-center px-4">
                Search for a user by username or paste their wallet address to start chatting
              </Text>
            </View>
          ) : null}
        </View>

        {/* Bottom padding */}
        <View className="h-4" />
      </View>
    </GlassModal>
  );
};

export default NewDMModal;
