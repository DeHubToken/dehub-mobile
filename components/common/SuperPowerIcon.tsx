import React from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import type { SuperPowerKey } from "../../services/superpower.service";

const POWER_ICONS: Record<SuperPowerKey, number> = {
  boost: require("../../assets/superpowers/boost.png"),
  second_wind: require("../../assets/superpowers/second-wind.png"),
  comment_anchor: require("../../assets/superpowers/comment-anchor.png"),
  trend_jacker: require("../../assets/superpowers/trend-jacker.png"),
  timeline_bomber: require("../../assets/superpowers/timeline-bomber.png"),
  signal_flare: require("../../assets/superpowers/signal-flare.png"),
  flak_jacket: require("../../assets/superpowers/flak-jacket.png"),
  precision_strike: require("../../assets/superpowers/precision-strike.png"),
  harpoon: require("../../assets/superpowers/harpoon.png"),
  team_up: require("../../assets/superpowers/team-up.png"),
  front_row: require("../../assets/superpowers/front-row.png"),
  deep_current: require("../../assets/superpowers/deep-current.png"),
};

export default function SuperPowerIcon({
  power,
  style,
}: {
  power: SuperPowerKey;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image source={POWER_ICONS[power]} style={style} resizeMode="contain" />;
}
