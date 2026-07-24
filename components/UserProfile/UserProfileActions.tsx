import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import GlassTipSheet from "../Tip/GlassTipSheet";

export interface UserProfileActionsProps {
  isFollowing: boolean;
  isFollowRequestPending?: boolean;
  followLoading: boolean;
  disableActions: boolean;
  address?: string;
  recipientName?: string;
  onFollow: () => void;
  onOpenUnfollow: () => void;
}

const BUTTON_H = 40;
const RADIUS = 12;

const UserProfileActions: React.FC<UserProfileActionsProps> = ({
  isFollowing,
  isFollowRequestPending = false,
  followLoading,
  disableActions,
  address,
  recipientName,
  onFollow,
  onOpenUnfollow,
}) => {
  const [showTip, setShowTip] = useState(false);

  const renderFollowButton = () => {
    if (followLoading) {
      return (
        <View style={[glassBtn.wrapper, { opacity: 0.6 }]}>
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, glassBtn.overlay]} />
          <View style={glassBtn.topHighlight} />
          <View style={glassBtn.content}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        </View>
      );
    }

    if (isFollowRequestPending) {
      return (
        <TouchableOpacity
          onPress={() => !disableActions && onOpenUnfollow()}
          disabled={disableActions}
          activeOpacity={0.7}
          style={[glassBtn.wrapper, disableActions && { opacity: 0.4 }]}
        >
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, glassBtn.overlay]} />
          <View style={glassBtn.topHighlight} />
          <View style={glassBtn.content}>
            <Icon name="Clock" size={16} color="#fff" />
            <Text style={glassBtn.label}>Requested</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (isFollowing) {
      return (
        <TouchableOpacity
          onPress={() => !disableActions && onOpenUnfollow()}
          disabled={disableActions}
          activeOpacity={0.7}
          style={[glassBtn.wrapper, disableActions && { opacity: 0.4 }]}
        >
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, glassBtn.overlay]} />
          <View style={glassBtn.topHighlight} />
          <View style={glassBtn.content}>
            <Text style={glassBtn.label}>Following</Text>
            <Icon name="ChevronDown" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={disableActions ? undefined : onFollow}
        disabled={disableActions}
        activeOpacity={0.7}
        style={[glassBtn.wrapper, disableActions && { opacity: 0.4 }]}
      >
        <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
        <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
        <View style={[StyleSheet.absoluteFill, glassBtn.overlay]} />
        <View style={glassBtn.topHighlight} />
        <View style={glassBtn.content}>
          <Icon name="UserPlus" size={16} color="#fff" />
          <Text style={glassBtn.label}>Follow</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-row gap-3 mt-2 items-stretch min-h-[40px]">
      <View style={{ flex: 1 }}>{renderFollowButton()}</View>

      <View
        style={{ flex: 1, opacity: disableActions ? 0.4 : 1 }}
        pointerEvents={disableActions ? "none" : "auto"}
      >
        <TouchableOpacity
          onPress={() => address && setShowTip(true)}
          disabled={!address}
          activeOpacity={0.7}
          style={[glassBtn.wrapper, !address && { opacity: 0.5 }]}
        >
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, glassBtn.overlay]} />
          <View style={glassBtn.topHighlight} />
          <View style={glassBtn.content}>
            <Icon name="HandCoins" size={16} color="#fff" />
            <Text style={glassBtn.label}>Tip</Text>
          </View>
        </TouchableOpacity>
      </View>

      {address ? (
        <GlassTipSheet
          visible={showTip}
          onClose={() => setShowTip(false)}
          toAddress={address}
          recipientName={recipientName}
          tipContext="user"
        />
      ) : null}
    </View>
  );
};

// Gradient: from-white/20 via-white/10 to-white/5 (matches web glass variant)
const GLASS_GRADIENT: [string, string, string] = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
];

const glassBtn = StyleSheet.create({
  wrapper: {
    flex: 1,
    height: BUTTON_H,
    borderRadius: RADIUS,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "rgba(24,24,27,0.3)",
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default UserProfileActions;
