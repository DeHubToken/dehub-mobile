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
  const title =
    (item as any).username ||
    (item as any).displayName ||
    truncateAddress(addr);
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  return (
    <TouchableOpacity
      className="flex-row items-center p-2 rounded-lg bg-theme-neutrals-800 mb-2"
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <Avatar uri={getAvatarUrl((item as any).avatarImageUrl)} size={32} />
      <View className="ml-2 flex-1">
        <Text className="text-white text-sm" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-theme-neutrals-400 text-[11px]" numberOfLines={1}>
          {truncateAddress(addr)}
        </Text>
      </View>
      <View className="flex-row items-center">
        <Text className="text-theme-neutrals-300 text-[11px] mr-2">
          {inContacts ? "Message" : "Start chat"}
        </Text>
        <Ionicons
          name={inContacts ? "chatbubble" : "chatbubble-ellipses"}
          size={16}
          color="#9CA3AF"
        />
      </View>
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
        <View className="px-5 pt-5">
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-xl bg-theme-brand-primary/15 items-center justify-center mr-2">
              <Ionicons
                name="chatbubble-ellipses-outline"
                color="#6EE7B7"
                size={18}
              />
            </View>
            <Text className="text-theme-neutrals-100 text-[17px] font-semibold">
              Start a new DM
            </Text>
          </View>
          <Text className="text-theme-neutrals-400 text-[12px] mt-2">
            Search by username or paste a wallet address
          </Text>
        </View>

        <View className="px-5 mt-4">
          <View className="flex-row items-center bg-theme-neutrals-800 rounded-2xl pl-4 pr-2 h-13 border border-theme-neutrals-700">
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={onChangeSearch}
              placeholder="Search username or paste address"
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-theme-neutrals-100 px-3 text-[16px]"
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
                className="w-10 h-10 rounded-xl bg-theme-neutrals-700 items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#B4B8BE" />
              </TouchableOpacity>
            ) : null}
          </View>

          {suggestions.length > 0 && (query || "").trim().length < 2 ? (
            <View className="mt-3">
              <Text className="text-theme-neutrals-400 text-[12px] mb-2">
                Quick picks
              </Text>
              <FlatList
                horizontal
                data={suggestions as any[]}
                keyExtractor={(item: any) =>
                  String(item?.address || item?.walletAddress)
                }
                renderItem={({ item }) => {
                  const addr = String(
                    item?.walletAddress || item?.address || ""
                  );
                  const title =
                    (item as any)?.displayName ||
                    (item as any)?.username ||
                    truncateAddress(addr);
                  const onPress = () => startDMWith(item as User);
                  return (
                    <TouchableOpacity
                      className="mr-2 px-3 py-2 rounded-2xl bg-theme-neutrals-800 border border-theme-neutrals-700 items-center"
                      onPress={onPress}
                      accessibilityRole="button"
                    >
                      <View className="flex-row items-center">
                        <Avatar
                          uri={getAvatarUrl((item as any)?.avatarImageUrl)}
                          size={22}
                          className="mr-2"
                        />
                        <Text
                          className="text-theme-neutrals-200 text-[12px]"
                          numberOfLines={1}
                        >
                          {title}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          ) : null}
        </View>

        <View className="px-5 mt-3 max-h-[55vh]">
          {showResults ? (
            <View>
              {loading ? (
                <View className="py-6 items-center">
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
                />
              ) : (
                <View className="py-8 items-center">
                  <Ionicons name="people-outline" size={48} color="#4B5563" />
                  <Text className="text-theme-neutrals-300 mt-2">
                    No users found
                  </Text>
                  <Text className="text-theme-neutrals-500 text-[12px] mt-1">
                    Try a different username or paste their address
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View className="py-4">
              <View className="flex-row items-start bg-theme-neutrals-800/60 border border-theme-neutrals-700 rounded-2xl p-3">
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#9CA3AF"
                  style={{ marginTop: 2 }}
                />
                <Text className="text-theme-neutrals-400 text-[12px] ml-2">
                  Paste an address or type a username to start a chat
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Footer */}
        <View className="px-5 pb-5 pt-2 flex-row justify-end">
          <TouchableOpacity
            onPress={close}
            className="px-4 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center active:opacity-80"
          >
            <Text className="text-theme-neutrals-100">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default NewDMModal;
