/**
 * Shop link board
 * ===============
 * The creator's affiliate and shop links, behind a Shop button. Tapping opens
 * a board anchored to the bottom of the screen; each row opens the link in the
 * device browser.
 *
 * An RN `<Modal>`, not a `transparentModal` screen: a transparent modal screen
 * leaves the surface below visible but NOT interactive (CardStack gives it
 * `activityState = 1`), which would freeze a live stream's chat and reactions
 * behind an open board — the same trap StreamShopOverlay documents.
 *
 * **Every link is disclosed as an affiliate link.** The line above the rows is
 * the disclosure a creator is required to make, and it is not something they
 * should have to remember, so the surface makes it.
 *
 * Renders nothing when the post has no board, so it is safe to drop into any
 * card or player.
 */

import React, { memo, useState } from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView, Linking } from "react-native";
import Icon from "../ui/Icon";
import type { ShopLink } from "../../services/nft.service";

interface ShopLinkBoardProps {
  links?: ShopLink[] | null;
  /**
   * `overlay` floats the button over a player, bottom-left and clear of the
   * controls on the right — live, where not leaving the stream is the point.
   * `inline` puts the button in the flow of a feed card.
   */
  variant?: "overlay" | "inline";
}

/** `https://www.amazon.co.uk/dp/x?tag=…` reads as `amazon.co.uk` under the label. */
function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].replace(/^www\./i, "") : url;
}

export default memo(function ShopLinkBoard({ links, variant = "inline" }: ShopLinkBoardProps) {
  const [open, setOpen] = useState(false);
  if (!links?.length) return null;

  const overlay = variant === "overlay";

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="flex-row items-center px-3 py-2 rounded-full bg-black/60 border border-white/15 self-start"
        style={overlay ? { position: "absolute", left: 12, bottom: 12, zIndex: 20 } : { marginTop: 8 }}
      >
        <Icon name="ShoppingBag" size={15} color="#fff" />
        <Text className="text-white text-sm font-medium ml-1.5">Shop</Text>
        <Text className="text-theme-neutrals-500 text-xs ml-1.5">{links.length}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          {/* The dim area above the board closes it — a bottom sheet that can
              only be dismissed by its own small X is the one people get stuck
              in. */}
          <TouchableOpacity className="flex-1" activeOpacity={1} onPress={() => setOpen(false)} />

          <View
            className="bg-black/90 border-t border-white/10"
            style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}
          >
            <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
              <View className="flex-row items-center">
                <Icon name="ShoppingBag" size={16} color="#fff" />
                <Text className="text-white text-base font-semibold ml-2">Shop</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.7} hitSlop={10}>
                <Icon name="X" size={18} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            <Text className="px-4 pb-2 text-theme-neutrals-500 text-xs leading-4">
              Affiliate links — the creator may earn a commission on anything you buy. Prices are
              the same for you.
            </Text>

            <ScrollView className="px-3 pb-6">
              {links.map((link, index) => (
                <TouchableOpacity
                  key={`${link.url}-${index}`}
                  onPress={() => Linking.openURL(link.url).catch(() => {})}
                  activeOpacity={0.8}
                  className="flex-row items-center px-3 py-3 rounded-xl bg-white/[0.06] border border-white/10 mb-1.5"
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-white text-sm" numberOfLines={1}>
                      {link.label}
                    </Text>
                    <Text className="text-theme-neutrals-500 text-xs mt-0.5" numberOfLines={1}>
                      {hostOf(link.url)}
                    </Text>
                  </View>
                  <Icon name="ExternalLink" size={15} color="#71717A" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
});
