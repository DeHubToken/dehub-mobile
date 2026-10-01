/**
 * Mounted once beside the navigator. Renders nothing until a badge is
 * tapped; living up here keeps the showcase out of the card it was opened
 * from, so taps inside it never reach a feed card or profile row.
 */
import React, { useEffect } from "react";
import { InteractionManager } from "react-native";
import { assetDataUrl, loadBadgePage } from "./StickerStage";
import { BADGE_ORDER, badgeImage } from "../../libs/misc";
import BadgeShowcase from "./BadgeShowcase";
import StreamerShowcase from "./StreamerShowcase";
import { closeBadgeShowcase, useBadgeShowcaseRequest } from "../../libs/badgeShowcase";

export default function BadgeShowcaseHost() {
  const request = useBadgeShowcaseRequest();
  useEffect(() => {
    const work = InteractionManager.runAfterInteractions(() => {
      void loadBadgePage().catch(() => {});
      // Read local assets while idle, before a tap needs the WebView payload.
      void (async () => {
        for (const tier of BADGE_ORDER) {
          const art = badgeImage(tier, "light") ?? badgeImage(tier);
          if (art !== undefined) await assetDataUrl(art).catch(() => {});
        }
      })();
    });
    return () => work.cancel();
  }, []);
  if (!request) return null;
  if (request.kind === "streamer") {
    return (
      <StreamerShowcase
        key={request.id}
        badgeId={request.badgeId}
        address={request.address}
        canSelect={request.canSelect}
        anchor={request.anchor}
        onClose={closeBadgeShowcase}
      />
    );
  }
  return (
    <BadgeShowcase
      key={request.id}
      tier={request.tier}
      promotedFrom={request.promotedFrom}
      anchor={request.anchor}
      onClose={closeBadgeShowcase}
    />
  );
}
