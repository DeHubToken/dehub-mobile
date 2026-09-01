/**
 * Shop editor
 * ===========
 * The sheet behind the composer's Shop toggle, for both a normal upload and a
 * live stream — mobile's UploadScreen is both, so one sheet covers what the web
 * splits between the upload drawer and Go Live. Two ways to fill the board:
 *
 *  - **From your shop** — listings the creator already sells on DeHub. These
 *    check out in-app and the money lands in their wallet, so they are offered
 *    first and listed first.
 *  - **Links** — affiliate and external links, which leave the app.
 *
 * The badge allowance sizes the board as a whole rather than each half. A
 * creator choosing three of their own listings over three Amazon links has made
 * the choice we would want them to make; charging a separate budget for it
 * would be an odd thing to do.
 *
 * Affiliate links are welcome here and the copy says so — a creator who cannot
 * tell whether their Amazon tag is allowed will not paste it, and one who
 * pastes it without knowing the rules gets refused at mint with nothing to act
 * on. The server owns the real validation; everything here exists to avoid a
 * round-trip that was always going to fail.
 *
 * Edits are held locally and committed on Save, like the schedule sheet next to
 * it: half-typed URLs must not reach the draft the composer autosaves.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useMyListings } from "../../hooks/useStores";
import type { ShopLink } from "../../services/nft.service";

export interface ShopBoardDraft {
  links: ShopLink[];
  /** Ids of the creator's own store listings to put on the board. */
  listingIds: string[];
}

interface ShopSheetProps {
  visible: boolean;
  onClose: () => void;
  value: ShopBoardDraft;
  onSave: (value: ShopBoardDraft) => void;
  /** How many rows this creator's badge tier buys, across both kinds. */
  allowance: number;
  /** The tier that bought it, for saying where the number came from. */
  tier?: string | null;
}

/** Longest label the board rows can show without truncating. */
const LABEL_MAX = 40;

/**
 * Is this something the server will accept?
 *
 * Deliberately loose. A scheme-less paste (`amazon.co.uk/dp/…`) is what people
 * actually copy and the server promotes it, so accepting it here keeps the two
 * sides agreeing. The strict rules — blocked hosts, lookalike domains — are
 * only knowable server-side and are reported when they fire.
 */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(javascript|data|file|blob):/i.test(trimmed)) return false;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Hostname must carry a dot: a bare word is a typo, never a destination.
  return /^https?:\/\/[^\s/]*\.[^\s/]+/i.test(withScheme);
}

export default function ShopSheet({
  visible,
  onClose,
  value,
  onSave,
  allowance,
  tier,
}: ShopSheetProps) {
  const [rows, setRows] = useState<ShopLink[]>(value.links);
  const [listingIds, setListingIds] = useState<string[]>(value.listingIds);

  const { data: listings = [], isLoading: listingsLoading } = useMyListings();
  const sellable = useMemo(
    () => (listings as any[]).filter((l) => l.status === "active"),
    [listings],
  );

  // Re-seed each time it opens, never while it is open: the composer's own
  // state updates as the draft saves, and re-seeding mid-edit would wipe a row
  // somebody is halfway through typing.
  useEffect(() => {
    if (!visible) return;
    setRows(value.links);
    setListingIds(value.listingIds);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (index: number, patch: Partial<ShopLink>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const remove = (index: number) => setRows((current) => current.filter((_, i) => i !== index));

  // A row with no URL is one somebody started and abandoned — dropped rather
  // than saved empty. A row with a URL and no label still counts: the server
  // labels it with its host.
  const cleanedLinks = rows
    .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
    .filter((row) => row.url.length > 0);

  const used = cleanedLinks.length + listingIds.length;
  const remaining = allowance - used;
  const canSave = !cleanedLinks.some((row) => !looksLikeUrl(row.url)) && used <= allowance;

  const toggleListing = (id: string) =>
    setListingIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="90%" blurIntensity={40}>
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View className="flex-row items-center">
          <Icon name="Store" size={18} color="#fff" />
          <Text className="text-white text-base font-semibold ml-2">Shop</Text>
        </View>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={10}>
          <Icon name="X" size={18} color="#A1A1AA" />
        </TouchableOpacity>
      </View>

      <ScrollView className="px-4" keyboardShouldPersistTaps="handled">
        <View className="flex-row p-3 rounded-xl bg-white/[0.04] border border-white/10 mb-3">
          <Icon name="Info" size={14} color="#71717A" />
          <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1 leading-4">
            Put your own listings or affiliate links on this post — viewers open them from the
            Shop button.{" "}
            {tier
              ? `Your ${tier} badge gives you ${allowance} in total.`
              : `You get ${allowance} in total. Every badge tier adds one more.`}
          </Text>
        </View>

        {/* Own listings first: they check out in-app and the money is the
            creator's, which is worth more to both sides than a referral. */}
        <Text className="text-white/70 text-sm mb-2">From your shop</Text>
        {listingsLoading ? (
          <View className="py-4 items-center">
            <ActivityIndicator color="#71717a" />
          </View>
        ) : sellable.length === 0 ? (
          <Text className="text-theme-neutrals-500 text-xs mb-3">
            Nothing on sale in your shop yet. Anything you list there can go on a post.
          </Text>
        ) : (
          sellable.map((listing: any) => {
            const picked = listingIds.includes(listing.id);
            const full = !picked && remaining <= 0;
            return (
              <TouchableOpacity
                key={listing.id}
                disabled={full}
                onPress={() => toggleListing(listing.id)}
                activeOpacity={0.8}
                className={`flex-row items-center p-2.5 rounded-xl border mb-2 ${
                  picked ? "bg-white/15 border-white/25" : "bg-white/[0.02] border-white/10"
                }`}
                style={full ? { opacity: 0.4 } : undefined}
              >
                <View
                  style={{ width: 40, height: 40, borderRadius: 10 }}
                  className="bg-white/10 overflow-hidden items-center justify-center mr-3"
                >
                  {listing.images?.[0] ? (
                    <Image
                      source={{ uri: listing.images[0] }}
                      style={{ width: 40, height: 40 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Icon name="Package" size={16} color="#71717a" />
                  )}
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-white text-sm" numberOfLines={1}>
                    {listing.title}
                  </Text>
                  <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                    ${Number(listing.price).toLocaleString()}
                  </Text>
                </View>
                {picked ? <Icon name="Check" size={16} color="#fff" /> : null}
              </TouchableOpacity>
            );
          })
        )}

        <Text className="text-white/70 text-sm mt-3 mb-1">Links</Text>
        <Text className="text-theme-neutrals-500 text-xs mb-2">
          Affiliate links are welcome — Amazon Associates, referral links, anywhere you sell.
        </Text>

        {rows.map((row, index) => {
          const invalid = row.url.trim().length > 0 && !looksLikeUrl(row.url);
          return (
            <View
              key={index}
              className="p-3 rounded-xl border border-white/10 bg-white/[0.02] mb-2"
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-theme-neutrals-500 text-xs">Link {index + 1}</Text>
                <TouchableOpacity onPress={() => remove(index)} activeOpacity={0.7} hitSlop={10}>
                  <Icon name="Trash2" size={15} color="#71717A" />
                </TouchableOpacity>
              </View>
              <TextInput
                value={row.label}
                onChangeText={(text) => update(index, { label: text.slice(0, LABEL_MAX) })}
                placeholder="What it is — e.g. My mic"
                placeholderTextColor="#52525B"
                /* 16px or iOS zooms the whole screen on focus. */
                className="text-white text-base px-3 py-3 rounded-xl bg-white/[0.06] border border-white/10 mb-2"
              />
              <TextInput
                value={row.url}
                onChangeText={(text) => update(index, { url: text })}
                placeholder="https://amzn.to/..."
                placeholderTextColor="#52525B"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className="text-white text-base px-3 py-3 rounded-xl bg-white/[0.06] border"
                style={{ borderColor: invalid ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)" }}
              />
              {invalid ? (
                <Text className="text-red-400 text-xs mt-1">
                  That does not look like a web address.
                </Text>
              ) : null}
            </View>
          );
        })}

        {remaining > 0 ? (
          <TouchableOpacity
            onPress={() => setRows((current) => [...current, { label: "", url: "" }])}
            activeOpacity={0.7}
            className="py-3 rounded-xl border border-dashed border-white/20 items-center flex-row justify-center"
          >
            <Icon name="Plus" size={15} color="#A1A1AA" />
            <Text className="text-theme-neutrals-400 text-sm ml-2">Add a link</Text>
          </TouchableOpacity>
        ) : (
          <Text className="text-theme-neutrals-500 text-xs text-center py-2">
            {allowance} of {allowance} used. Stake more DHB for a higher badge and another slot.
          </Text>
        )}

        <TouchableOpacity
          onPress={() => {
            onSave({ links: cleanedLinks, listingIds });
            onClose();
          }}
          disabled={!canSave}
          activeOpacity={0.7}
          className="mt-4 mb-2 py-3 rounded-full items-center"
          style={{ backgroundColor: canSave ? "#fff" : "rgba(255,255,255,0.1)" }}
        >
          <Text className="text-sm font-semibold" style={{ color: canSave ? "#09090B" : "#71717A" }}>
            Save
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassModal>
  );
}
