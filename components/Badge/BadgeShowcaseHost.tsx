/**
 * Mounted once beside the navigator. Renders nothing until a badge is
 * tapped; living up here keeps the showcase out of the card it was opened
 * from, so taps inside it never reach a feed card or profile row.
 */
import React from "react";
import BadgeShowcase from "./BadgeShowcase";
import StreamerShowcase from "./StreamerShowcase";
import { closeBadgeShowcase, useBadgeShowcaseRequest } from "../../libs/badgeShowcase";

export default function BadgeShowcaseHost() {
  const request = useBadgeShowcaseRequest();
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
  return <BadgeShowcase key={request.id} tier={request.tier} anchor={request.anchor} onClose={closeBadgeShowcase} />;
}
