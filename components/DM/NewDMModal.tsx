/**
 * New message drawer. The + in Messages opens this straight away (no
 * "Start something" chooser first): the To field is focused as the drawer
 * rises, recent chats show as faces, people you follow fill it for a new
 * account, and New group / New channel sit as two pills under the field.
 * Picking someone opens the chat with its message box focused, so the
 * keyboard stays up. Mirrors dehubweb NewMessageDrawer.
 */
import Icon from "../ui/Icon";
import BadgeArtwork from "../common/BadgeArtwork";
import { getBadgeHoverOpticalStyle } from "../../libs/misc";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { User, useUser } from "../../context/AuthContext";
import { getFollowList, usersSearch } from "../../services/user.service";
import { useDebounceCallback } from "../../hooks/useDebounceCallback";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrlFor } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import GlassModal from "../ui/GlassModal";
import { useDM } from "../../hooks/useDM";
import { toastInfo } from "../../libs/toast";
import { useTranslation } from "react-i18next";

type Person = Partial<User> & { address?: string; followsYou?: boolean };

const addrOf = (u: Person | undefined | null) =>
  String((u as any)?.walletAddress || (u as any)?.address || "").toLowerCase();
const nameOf = (u: Person) =>
  (u as any).displayName || (u as any).username || truncateAddress(addrOf(u));

function dmOff(u: Person) {
  const raw = (u as any).dmSettings || (u as any).dmSetting;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return !!(s?.disables?.includes("NEW_DM") || s?.disables?.includes("all"));
}

const PersonRow: React.FC<{ item: Person; sub: string; onPress: (u: Person) => void }> = ({ item, sub, onPress }) => {
  const badgeImg = getBadgeUrlFor(item as any);
  const off = dmOff(item);
  return (
    <TouchableOpacity
      className="flex-row items-center py-2 px-1"
      onPress={() => onPress(item)}
      activeOpacity={0.7}
      disabled={off}
      style={off ? { opacity: 0.5 } : undefined}
      accessibilityRole="button"
      testID={`new-dm-person-${(item as any).username || addrOf(item)}`}
    >
      <Avatar uri={getAvatarUrl((item as any).avatarImageUrl)} size={42} name={nameOf(item)} />
      <View className="ml-3 flex-1">
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <Text className="text-white text-[15px] font-semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {nameOf(item)}
          </Text>
          {badgeImg ? (
            <BadgeArtwork source={badgeImg} style={getBadgeHoverOpticalStyle(badgeImg, 15, 0, 21)} contentFit="contain" />
          ) : null}
        </View>
        {sub ? (
          <Text className="text-theme-neutrals-400 text-[12px] mt-0.5" numberOfLines={1}>{sub}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export type NewDMModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (user: User) => void;
  onGroup?: () => void;
  onChannel?: () => void;
};

const NewDMModal: React.FC<NewDMModalProps> = ({ open, onOpenChange, onSelect, onGroup, onChannel }) => {
  const { t } = useTranslation();
  const user = useUser();
  const me = String((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<TextInput | null>(null);
  const searchIdRef = useRef(0);
  const { conversations } = useDM();

  // Focus on the drawer's first frame, so the keyboard rises with it.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setLoading(false);
    searchIdRef.current++;
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    // Android Modals attach their window a beat late; ask once more.
    const late = setTimeout(() => { if (!searchRef.current?.isFocused()) searchRef.current?.focus(); }, 220);
    return () => { cancelAnimationFrame(raf); clearTimeout(late); };
  }, [open]);

  const recents = useMemo(() => {
    const out: Person[] = [];
    const seen = new Set<string>();
    for (const c of conversations as any[]) {
      const other = c?.participants?.[0]?.participant;
      const a = String(other?.address || "").toLowerCase();
      if (!a || a === me || seen.has(a)) continue;
      seen.add(a);
      out.push({
        username: other?.username,
        displayName: other?.displayName,
        walletAddress: other?.address,
        address: other?.address,
        avatarImageUrl: other?.avatarImageUrl,
      } as Person);
      if (out.length >= 12) break;
    }
    return out;
  }, [conversations, me]);
  const recentSet = useMemo(() => new Set(recents.map(addrOf)), [recents]);

  const { data: following = [] } = useQuery({
    queryKey: ["new-dm-drawer", "following", me],
    enabled: open && !!me,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await getFollowList({ address: me, type: "following", limit: 24 });
      return (res?.result?.items || []).map((i) => ({
        username: i.user?.username,
        displayName: i.user?.displayName,
        walletAddress: i.user?.address,
        address: i.user?.address,
        avatarImageUrl: i.user?.avatarImageUrl,
        followsYou: !!i.user?.followsYou,
      } as Person));
    },
  });
  const suggested = useMemo(
    () => following.filter((u) => addrOf(u) && addrOf(u) !== me && !recentSet.has(addrOf(u))).slice(0, 8),
    [following, recentSet, me],
  );

  const q = query.trim().replace(/^@/, "").toLowerCase();

  const performSearch = useCallback(async (text: string) => {
    const term = (text || "").trim().replace(/^@/, "");
    if (term.length < 2) { setLoading(false); setResults([]); return; }
    const reqId = ++searchIdRef.current;
    try {
      setLoading(true);
      const res: any = await usersSearch(term);
      if (searchIdRef.current !== reqId) return;
      const arr = (res?.data?.result || res?.result || []) as Person[];
      setResults(Array.isArray(arr) ? arr.filter((u) => addrOf(u) !== me) : []);
    } catch (e) {
      if (searchIdRef.current === reqId) console.warn("[NewDMModal] usersSearch failed", e);
    } finally {
      if (searchIdRef.current === reqId) setLoading(false);
    }
  }, [me]);
  const debouncedSearch = useDebounceCallback(performSearch, 250);
  useEffect(() => { if (open) debouncedSearch(query); }, [query, open, debouncedSearch]);

  // People you talk to or follow first, from the very first letter.
  const matches = useMemo(() => {
    if (!q) return [];
    const out: Person[] = [];
    const seen = new Set<string>();
    const add = (u: Person) => {
      const a = addrOf(u);
      if (!a || a === me || seen.has(a)) return;
      seen.add(a);
      out.push(u);
    };
    for (const u of [...recents, ...following]) {
      const hay = `${(u as any).username || ""} ${(u as any).displayName || ""}`.toLowerCase();
      if (hay.includes(q)) add(u);
    }
    for (const u of results) add(u);
    return out.slice(0, 20);
  }, [q, recents, following, results, me]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const pick = useCallback((u: Person) => {
    const a = addrOf(u);
    if (a && a === me) { toastInfo(t("dm.cantMessageYourself")); return; }
    if (dmOff(u)) return;
    // Hand over first: the chat's message box takes the focus while the
    // keyboard is still up, then the drawer goes.
    onSelect(u as User);
    setTimeout(() => onOpenChange(false), 60);
  }, [me, onSelect, onOpenChange, t]);

  const sub = (u: Person) => {
    const parts: string[] = [];
    if ((u as any).username) parts.push(`@${(u as any).username}`);
    if (recentSet.has(addrOf(u))) parts.push(t("dm.newDrawer.chattedBefore", { defaultValue: "You talk" }));
    else if (u.followsYou) parts.push(t("dm.newDrawer.mutual", { defaultValue: "Mutual" }));
    if (dmOff(u)) parts.push(t("dm.newDrawer.dmsOff", { defaultValue: "DMs off" }));
    return parts.join(" · ");
  };

  return (
    <GlassModal surface="theme" visible={open} onClose={close} presentation="bottom" panelHeight="86%">
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <View className="w-8" />
          <Text className="text-white text-[16px] font-bold">
            {t("communities.newChat.message", { defaultValue: "New message" })}
          </Text>
          <TouchableOpacity onPress={close} className="w-8 h-8 items-center justify-center" accessibilityRole="button" accessibilityLabel={t("common.close")}>
            <Ionicons name="close" size={22} color="#A1A1AA" />
          </TouchableOpacity>
        </View>

        <View className="mx-4 flex-row items-center rounded-xl px-3 border border-theme-neutrals-600/60 bg-theme-neutrals-800/60" style={{ height: 44 }}>
          <Text className="text-theme-neutrals-400 text-[15px] font-semibold mr-2">
            {t("dm.newDrawer.to", { defaultValue: "To" })}
          </Text>
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder={t("dm.newDrawer.placeholder", { defaultValue: "Name or @username" })}
            placeholderTextColor="#8B8D90"
            className="flex-1 text-white text-[15px]"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="new-dm-to"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={t("sidebar.clearSearch")} hitSlop={8}
              className="w-7 h-7 rounded-lg bg-theme-neutrals-700 items-center justify-center">
              <Ionicons name="close" size={14} color="#B4B8BE" />
            </TouchableOpacity>
          ) : null}
        </View>

        {!q && (onGroup || onChannel) ? (
          <View className="flex-row px-4 pt-3" style={{ gap: 8 }}>
            {onGroup ? (
              <TouchableOpacity onPress={() => { close(); onGroup(); }} accessibilityRole="button" testID="new-chat-group"
                className="flex-row items-center rounded-full px-3 py-1.5 border border-theme-neutrals-700 bg-theme-neutrals-800/60" style={{ gap: 6 }}>
                <Icon name="Users" size={14} color="#E4E4E7" />
                <Text className="text-white text-[12px] font-semibold">{t("communities.newChat.newGroup")}</Text>
              </TouchableOpacity>
            ) : null}
            {onChannel ? (
              <TouchableOpacity onPress={() => { close(); onChannel(); }} accessibilityRole="button" testID="new-chat-channel"
                className="flex-row items-center rounded-full px-3 py-1.5 border border-theme-neutrals-700 bg-theme-neutrals-800/60" style={{ gap: 6 }}>
                <Icon name="Megaphone" size={14} color="#E4E4E7" />
                <Text className="text-white text-[12px] font-semibold">{t("communities.newChat.newChannel")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {q ? (
          matches.length > 0 ? (
            <FlatList
              data={matches}
              keyExtractor={(u) => addrOf(u)}
              renderItem={({ item }) => <PersonRow item={item} sub={sub(item)} onPress={pick} />}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            />
          ) : loading || q.length < 2 ? (
            <View className="py-8 items-center">
              {q.length < 2
                ? <Text className="text-theme-neutrals-500 text-[12px]">{t("dm.newDrawer.keepTyping", { defaultValue: "Keep typing to search everyone" })}</Text>
                : <ActivityIndicator size="small" color="#9CA3AF" />}
            </View>
          ) : (
            <View className="py-10 items-center px-6">
              <Ionicons name="person-outline" size={36} color="#4B5563" />
              <Text className="text-theme-neutrals-300 text-[14px] mt-3">{t("dm.noAccountsFound")}</Text>
              <Text className="text-theme-neutrals-500 text-[12px] mt-1 text-center">{t("dm.trySearching")}</Text>
            </View>
          )
        ) : (
          <ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {recents.length > 0 ? (
              <>
                <Text className="text-theme-neutrals-500 text-[11px] font-bold px-4 pt-4 pb-2" style={{ letterSpacing: 1 }}>
                  {t("dm.newDrawer.recent", { defaultValue: "RECENT" })}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                  {recents.map((u) => (
                    <TouchableOpacity key={addrOf(u)} onPress={() => pick(u)} style={{ width: 58, alignItems: "center" }} accessibilityRole="button" testID={`new-dm-recent-${(u as any).username || addrOf(u)}`}>
                      <Avatar uri={getAvatarUrl((u as any).avatarImageUrl)} size={56} name={nameOf(u)} />
                      <Text className="text-theme-neutrals-300 text-[11px] mt-1" numberOfLines={1}>{nameOf(u)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}
            {suggested.length > 0 ? (
              <>
                <Text className="text-theme-neutrals-500 text-[11px] font-bold px-4 pt-4 pb-1" style={{ letterSpacing: 1 }}>
                  {recents.length > 0
                    ? t("dm.newDrawer.suggested", { defaultValue: "SUGGESTED" })
                    : t("dm.newDrawer.youFollow", { defaultValue: "PEOPLE YOU FOLLOW" })}
                </Text>
                <View className="px-3">
                  {suggested.map((u) => <PersonRow key={addrOf(u)} item={u} sub={sub(u)} onPress={pick} />)}
                </View>
              </>
            ) : null}
            {recents.length === 0 && suggested.length === 0 ? (
              <View className="py-10 items-center px-6">
                <Icon name="MessageEnvelope" size={36} color="#4B5563" />
                <Text className="text-white text-[14px] font-semibold mt-3">{t("dm.newDrawer.sayHi", { defaultValue: "Say hi to someone" })}</Text>
                <Text className="text-theme-neutrals-500 text-[12px] mt-1 text-center">{t("dm.newDrawer.typeAny", { defaultValue: "Type any name or @username" })}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </GlassModal>
  );
};

export default NewDMModal;
