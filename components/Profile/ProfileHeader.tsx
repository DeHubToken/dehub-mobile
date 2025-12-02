import React, { useState, useMemo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import SmartImage from "../common/SmartImage";
import { BlurView } from "expo-blur";
import { Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";

import { copyToClipboard } from "../../libs";
import profileImage from "../../assets/default-avatar.png"; // fallback
import { theme } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import {
  getAvatarUrl,
  getCoverUrl,
  getBadgeName,
  getBadgeUrl,
  getDefaultBanner,
} from "../../libs/misc";
import { openExternalLink } from "../../libs/links.utils";
import env from "../../config/env";
import { truncate, truncateAddress } from "../../libs/strings.util";
import { formatJoinedDate } from "../../libs/date.util";
import { shareProfile } from "../../libs/misc";
import Avatar from "../common/Avatar";
import * as ImagePicker from "expo-image-picker";
import {
  openCroppedImagePicker,
  resizeAndCompress,
  createRNImageFile,
} from "../../libs/assets.util";
import {
  runWithPermissions,
  ensureMediaLibraryPermission,
  waitAfterPermissionIfNeeded,
} from "../../libs/permissions.util";
import { AuthService } from "../../services/auth.service";
import { toastError, toastSuccess } from "../../libs/toast";
import ProfileStats from "./ProfileStats";

const ProfileHeader = () => {
  const navigation = useNavigation<any>();
  const { user, refreshUser, patchUser } = useAuth() as any;
  const [expanded, setExpanded] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null);
  // No internal editor overlay anymore; we launch native crop UI via crop-picker

  const displayName = user?.displayName || "Unknown";
  const username = user?.username || user?.address || "";
  const address = user?.address || user?.walletAddress || "";
  const shortAddr = truncateAddress(address, 5, 5);
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);

  const coverUrl = getCoverUrl(user?.coverImageUrl);
  const badge = getBadgeName(user?.stakedDHB as number);
  const badgeImage = getBadgeUrl(user?.stakedDHB as number);
  const badgeIcon = "trophy-outline";
  
  // Deterministic default banner based on user ID/address
  const defaultBanner = useMemo(() => 
    getDefaultBanner(user?.id || user?.username || user?.address || ""), 
    [user?.id, user?.username, user?.address]
  );

  const truncatedHeaderName = useMemo(
    () => truncate(username, 8, ".."),
    [username]
  );

  const createdAtFormatted = useMemo(
    () => formatJoinedDate(user?.createdAt) || undefined,
    [user?.createdAt]
  );

  const socials: { key: string; url?: string; icon: string; label: string }[] =
    [
      {
        key: "facebook",
        url: user?.facebookLink,
        icon: "logo-facebook",
        label: "Facebook",
      },
      {
        key: "twitter",
        url: user?.twitterLink,
        icon: "logo-twitter",
        label: "Twitter",
      },
      {
        key: "discord",
        url: user?.discordLink,
        icon: "logo-discord",
        label: "Discord",
      },
      {
        key: "instagram",
        url: user?.instagramLink,
        icon: "logo-instagram",
        label: "Instagram",
      },
      {
        key: "tiktok",
        url: user?.tiktokLink,
        icon: "musical-notes-outline",
        label: "TikTok",
      },
      {
        key: "youtube",
        url: user?.youtubeLink,
        icon: "logo-youtube",
        label: "YouTube",
      },
      {
        key: "telegram",
        url: user?.telegramLink,
        icon: "paper-plane-outline",
        label: "Telegram",
      },
    ].filter((s) => !!s.url);

  const hasExtra = !!(
    createdAtFormatted ||
    user?.aboutMe ||
    user?.displayName ||
    user?.username ||
    socials.length
  );

  // About card state (collapsible) and toggle visibility
  const aboutText = (user?.aboutMe || "").trim();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutTotalLines, setAboutTotalLines] = useState<number | null>(null);
  const hasExtrasForAbout = !!(
    createdAtFormatted ||
    user?.displayName ||
    user?.username ||
    socials.length
  );
  const showAboutToggle = (aboutTotalLines ?? 0) > 3 || hasExtrasForAbout;

  // openExternalLink reused from misc
  const handleShare = useCallback(async () => {
    const profileSlug = username || address;
    const url = `${env.APP_ORIGIN}/${profileSlug}`;
    const message = `Check out my dehub profile ${url}`;
    await shareProfile(url, message);
  }, [username, address]);

  const pickImage = useCallback(async () => {
    const perm = await ensureMediaLibraryPermission();
    if (!perm.granted) {
      toastError("Permission to access photos is required.");
      return null;
    }
    await waitAfterPermissionIfNeeded(perm.justGranted);
    const mediaTypesCompat: any = (ImagePicker as any).MediaType
      ? [(ImagePicker as any).MediaType.image]
      : (ImagePicker as any).MediaTypeOptions?.Images ??
        ImagePicker.MediaTypeOptions.Images;
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaTypesCompat,
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    });
    if (pick.canceled || !pick.assets?.length) return null;
    return pick.assets[0]?.uri || null;
  }, []);

  const openViewer = useCallback(
    (uri?: string) => {
      if (!uri) return;
      (navigation as any).navigate(ScreenNames.ImageViewer, {
        images: [{ uri }],
        index: 0,
        isModal: true,
      });
    },
    [navigation]
  );

  const processAndUpload = useCallback(
    async (kind: "avatar" | "cover", uri: string) => {
      const isAvatar = kind === "avatar";
      try {
        isAvatar ? setUploadingAvatar(true) : setUploadingCover(true);
        // Resize/compress
        const target = isAvatar
          ? { width: 512, height: 512 }
          : { width: 1500, height: 500 };
        const manipUri = await resizeAndCompress(uri, {
          width: target.width,
          height: target.height,
          compress: 0.85,
          format: "jpeg",
        });
        if (isAvatar) setLocalAvatarUri(manipUri);
        else setLocalCoverUri(manipUri);
        const file = createRNImageFile(manipUri, kind);
        const payload = isAvatar
          ? { avatar: file, avatarImg: file }
          : { cover: file, coverImg: file };
        await AuthService.updateProfile(payload);
        // Optimistic bump + background refresh
        if (isAvatar) {
          await patchUser?.({
            avatarImageUrl: `${user?.avatarImageUrl || ""}`,
          });
        } else {
          await patchUser?.({ coverImageUrl: `${user?.coverImageUrl || ""}` });
        }
        await refreshUser?.();
        toastSuccess(isAvatar ? "Avatar updated" : "Cover updated");
      } catch (e) {
        toastError(e, "Upload failed");
        if (isAvatar) setLocalAvatarUri(null);
        else setLocalCoverUri(null);
      } finally {
        isAvatar ? setUploadingAvatar(false) : setUploadingCover(false);
      }
    },
    [user]
  );

  const startChangeAvatar = useCallback(async () => {
    try {
      await runWithPermissions([ensureMediaLibraryPermission], async () => {
        const pickedUri = await openCroppedImagePicker({
          width: 800,
          height: 800,
          circle: false,
          quality: 0.9,
          forceJpg: true,
        });
        if (!pickedUri) return;
        setLocalAvatarUri(pickedUri);
        await processAndUpload("avatar", pickedUri);
      });
    } catch (e) {
      toastError(e, "Could not pick image");
    }
  }, [processAndUpload]);

  const startChangeCover = useCallback(async () => {
    try {
      await runWithPermissions([ensureMediaLibraryPermission], async () => {
        const pickedUri = await openCroppedImagePicker({
          width: 1800,
          height: 600,
          circle: false,
          quality: 0.9,
          forceJpg: true,
        });
        if (!pickedUri) return;
        setLocalCoverUri(pickedUri);
        await processAndUpload("cover", pickedUri);
      });
    } catch (e) {
      toastError(e, "Could not pick image");
    }
  }, [processAndUpload]);

  return (
    <>
      <View className="w-full px-2">
        <View className="w-full m-2 rounded-2xl overflow-hidden" style={{ height: 120 }}>
          <SmartImage
            source={
              localCoverUri
                ? { uri: localCoverUri }
                : coverUrl === "default-banner"
                ? defaultBanner
                : { uri: coverUrl }
            }
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            style={{ width: "100%", height: "100%", opacity: uploadingCover ? 0.6 : 1 }}
          />
          <View className="absolute inset-0 px-4 py-6 w-full h-full">
            <TouchableOpacity
              activeOpacity={0.8}
              className="absolute inset-0 z-0"
              onPress={() =>
                openViewer(
                  localCoverUri ||
                    (coverUrl !== "default-banner" ? coverUrl : undefined)
                )
              }
            />
            <View className="absolute right-0 bottom-0 z-20 m-2">
              <BlurView
                intensity={60}
                tint="dark"
                className="rounded-full overflow-hidden"
              >
                <TouchableOpacity
                  onPress={() =>
                    (navigation as any).navigate(ScreenNames.EditProfile)
                  }
                  accessibilityLabel="Edit profile"
                  activeOpacity={0.85}
                  className="px-0 py-0"
                >
                  <View className="bg-white/5 px-5 py-2 rounded-full">
                    <Text className="text-white font-medium">Edit profile</Text>
                  </View>
                </TouchableOpacity>
              </BlurView>
            </View>
            <View
              className="absolute inset-0 items-center justify-center z-20"
              pointerEvents="box-none"
            >
              <TouchableOpacity
                onPress={startChangeCover}
                className="bg-black/50 rounded-full p-4"
                accessibilityLabel="Change cover image"
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            {uploadingCover && (
              <View className="absolute inset-0 items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
        </View>
        <View className="px-3 mt-3">
          <View className="flex-row items-center pr-2">
            <Avatar
              uri={avatarUrl === "default-avatar" ? undefined : avatarUrl}
              size={44}
              onPress={() =>
                openViewer(
                  avatarUrl === "default-avatar" ? undefined : avatarUrl
                )
              }
            />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center gap-2">
                <Text
                  className="text-white text-2xl font-bold"
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {badge && (
                  <View className="w-5 h-5 rounded-full bg-theme-neutrals-800 items-center justify-center overflow-hidden">
                    {badgeImage ? (
                      <SmartImage source={badgeImage as any} contentFit="cover" cachePolicy="memory-disk" style={{ width: 12, height: 12 }} />
                    ) : (
                      <Ionicons name="star" size={12} color="#fff" />
                    )}
                  </View>
                )}
              </View>
              <View className="flex-row items-center mt-1">
                {!!username && (
                  <TouchableOpacity
                    onPress={() => copyToClipboard(username)}
                    activeOpacity={0.7}
                  >
                    <Text
                      className="text-theme-neutrals-500 text-xs"
                      numberOfLines={1}
                    >
                      @{username}
                    </Text>
                  </TouchableOpacity>
                )}
                {!!username && !!address && (
                  <Text className="text-theme-neutrals-600 mx-2">•</Text>
                )}
                {!!address && (
                  <View className="flex-row items-center">
                    <Text
                      className="text-theme-neutrals-500 text-xs mr-1"
                      numberOfLines={1}
                    >
                      {shortAddr}
                    </Text>
                    <TouchableOpacity
                      onPress={() => copyToClipboard(address)}
                      accessibilityLabel="Copy address"
                      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                    >
                      <Ionicons name="copy-outline" size={14} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleShare}
              accessibilityLabel="Share profile"
              className="active:opacity-80"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="share-social" size={20} color="#A6A9AC" />
            </TouchableOpacity>
          </View>
        </View>
        <ProfileStats />
        {(aboutText || hasExtrasForAbout) && (
          <View className="px-2 mt-1">
            <View className="bg-theme-neutrals-800 rounded-2xl p-4 overflow-hidden">
              <Text className="text-theme-neutrals-400 text-[10px] uppercase tracking-wide mb-2">
                About
              </Text>
              {!!aboutText && (
                <Text
                  className="text-white text-sm"
                  numberOfLines={aboutOpen ? undefined : 3}
                  ellipsizeMode="tail"
                >
                  {aboutText}
                </Text>
              )}
              {aboutTotalLines == null && !!aboutText && (
                <Text
                  className="absolute opacity-0 -z-10 text-sm"
                  onTextLayout={(e) => {
                    if (aboutTotalLines == null) {
                      // @ts-ignore platform differences
                      setAboutTotalLines(e.nativeEvent.lines?.length || 0);
                    }
                  }}
                >
                  {aboutText}
                </Text>
              )}
              {aboutOpen && (
                <View className="mt-3 gap-3">
                  {createdAtFormatted && (
                    <View className="flex-row items-baseline justify-start gap-2">
                      <Text className="text-theme-neutrals-400 text-xs">
                        Joined
                      </Text>
                      <Text className="text-white text-xs">
                        {createdAtFormatted}
                      </Text>
                    </View>
                  )}
                  {user?.displayName && (
                    <View className="flex-row items-baseline justify-start gap-2">
                      <Text className="text-theme-neutrals-400 text-xs">
                        Display Name
                      </Text>
                      <Text className="text-white text-xs" numberOfLines={1}>
                        {user.displayName}
                      </Text>
                    </View>
                  )}
                  {user?.username && (
                    <View className="flex-row items-center justify-start gap-2">
                      <Text className="text-theme-neutrals-400 text-xs">
                        Username
                      </Text>
                      <TouchableOpacity
                        onPress={() => copyToClipboard(user.username!)}
                        accessibilityLabel="Copy username"
                        className="flex-row items-center"
                      >
                        <Text className="text-white text-xs" numberOfLines={1}>
                          @{user.username}
                        </Text>
                        <Ionicons
                          name="copy-outline"
                          size={14}
                          color={theme.colors.accentForeground}
                          style={{ marginLeft: 6 }}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                  {socials.length > 0 && (
                    <View>
                      <Text className="text-theme-neutrals-400 text-xs mb-2">
                        Socials
                      </Text>
                      <View className="flex-row flex-wrap gap-3">
                        {socials.map((s) => (
                          <TouchableOpacity
                            key={s.key}
                            className="flex-row items-center bg-theme-neutrals-700 px-3 py-2 rounded-full"
                            onPress={() => openExternalLink(s.url)}
                          >
                            <Ionicons
                              name={s.icon as any}
                              size={16}
                              color={theme.colors.accentForeground}
                            />
                            <Text className="ml-2 text-white text-xs font-medium">
                              {s.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
              {showAboutToggle && (
                <TouchableOpacity
                  onPress={() => setAboutOpen((o) => !o)}
                  activeOpacity={0.7}
                  className="mt-2 self-start"
                >
                  <Text className="text-theme-neutrals-500 text-[10px]">
                    {aboutOpen ? "Show less" : "Show more"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </>
  );
};

export default ProfileHeader;
