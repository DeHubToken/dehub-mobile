/**
 * Shop links editor
 * =================
 * The sheet behind the composer's Shop toggle, for both a normal upload and a
 * live stream — mobile's UploadScreen is both, so one sheet covers what the
 * web splits between the upload drawer and Go Live.
 *
 * Affiliate links are the point of this surface, so it says so. A creator who
 * cannot tell whether their Amazon tag is welcome will not paste it, and one
 * who pastes it without knowing the rules gets refused at mint with nothing to
 * act on. The server owns the real validation; everything here exists to avoid
 * a round-trip that was always going to fail.
 *
 * Edits are held locally and committed on Save, like the schedule sheet next
 * to it: half-typed URLs must not reach the draft the composer autosaves.
 */

import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import type { ShopLink } from "../../services/nft.service";

interface ShopLinksSheetProps {
  visible: boolean;
  onClose: () => void;
  links: ShopLink[];
  onSave: (links: ShopLink[]) => void;
  /** How many rows this creator's badge tier buys. */
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

export default function ShopLinksSheet({
  visible,
  onClose,
  links,
  onSave,
  allowance,
  tier,
}: ShopLinksSheetProps) {
  const [rows, setRows] = useState<ShopLink[]>(links);

  // Re-seed each time it opens, never while it is open: the composer's own
  // state updates as the draft saves, and re-seeding mid-edit would wipe a row
  // somebody is halfway through typing.
  useEffect(() => {
    if (visible) setRows(links.length ? links : [{ label: "", url: "" }]);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (index: number, patch: Partial<ShopLink>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const remove = (index: number) => setRows((current) => current.filter((_, i) => i !== index));

  // A row with no URL is one somebody started and abandoned — dropped rather
  // than saved empty. A row with a URL and no label still counts: the server
  // labels it with its host.
  const cleaned = rows
    .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
    .filter((row) => row.url.length > 0);

  const canSave = !cleaned.some((row) => !looksLikeUrl(row.url)) && cleaned.length <= allowance;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="90%" blurIntensity={40}>
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View className="flex-row items-center">
          <Icon name="Link2" size={18} color="#fff" />
          <Text className="text-white text-base font-semibold ml-2">Shop links</Text>
        </View>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={10}>
          <Icon name="X" size={18} color="#A1A1AA" />
        </TouchableOpacity>
      </View>

      <ScrollView className="px-4" keyboardShouldPersistTaps="handled">
        <View className="flex-row p-3 rounded-xl bg-white/[0.04] border border-white/10 mb-3">
          <Icon name="Info" size={14} color="#71717A" />
          <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1 leading-4">
            Affiliate links are welcome — Amazon Associates, referral links, your own store.
            Viewers open these from the Shop button on your post.{" "}
            {tier
              ? `Your ${tier} badge gives you ${allowance}.`
              : `You get ${allowance}. Every badge tier adds one more.`}
          </Text>
        </View>

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

        {rows.length < allowance ? (
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
            onSave(cleaned);
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
