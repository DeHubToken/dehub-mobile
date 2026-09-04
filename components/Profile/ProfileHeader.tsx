import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native";
import SmartImage from "../common/SmartImage";
import StoryAvatarRing from "../Story/StoryAvatarRing";
import { useWatchedStories } from "../../hooks/useWatchedStories";
import { useStoryViewer } from "../../context/StoryViewerContext";
import { getStoriesForWallet, type Story } from "../../services/stories.service";
import { Ionicons } from "@expo/vector-icons";
import LiquidGlass from "../ui/LiquidGlass";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "../../libs";
import { useUser, useAuthActions } from "../../context/AuthContext";
import {
  getAvatarUrl,
  getCoverUrl,
  getBadgeName,
  getBadgeUrl,
  getDefaultBanner,
  resolveBadgeBalance,
  resolveBadgeLock,
} from "../../libs/misc";
import { openExternalLink } from "../../libs/links.utils";
import { ensProfileUrl } from "../../libs/ens-handle";
import { truncateAddress } from "../../libs/strings.util";
import { formatJoinedDate } from "../../libs/date.util";
import { formatCompactNumber, resolveCount } from "../../libs/numbers.util";
import { shareProfile } from "../../libs/misc";
import * as ImagePicker from "expo-image-picker";

/** Matches the StoryAvatarRing `size={88}` below. */
const PROFILE_AVATAR_PT = 88;
/** The cover is full-bleed, so it is fetched at the screen's own width. */
const COVER_WIDTH_PT = Dimensions.get("window").width;
import {
  openCroppedImagePicker,
  resizeAndCompress,
  createRNImageFile,
} from "../../libs/assets.util";
import { runWithPermissions } from "../../libs/permissions.util";
import { AuthService } from "../../services/auth.service";
import { toastError, toastSuccess } from "../../libs/toast";
import { WEBSITE_LINK } from "../../config";
import { translateText, getUserLanguage } from "../../services/translation.service";
import { TranslateButton } from "../ui/TranslateButton";
import NewMemberChip from "../common/NewMemberChip";
import BadgePatronChip from "../common/BadgePatronChip";

const ProfileHeader = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const user = useUser() as any;
  const { refreshUser, patchUser } = useAuthActions();
  const [translatedBio, setTranslatedBio] = useState<string | null>(null);
  const [isTranslatingBio, setIsTranslatingBio] = useState(false);
  // The reader's chosen language, not the handset's: a Turkish reader on an
  // English phone was being served "translations" back into English.
  //
  // Left on-demand deliberately, unlike every other surface — this is the
  // signed-in user's OWN bio, which they wrote. Auto-translating someone's own
  // words back at them is not the parity anyone wanted.
  const targetLang = useRef(getUserLanguage());
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null);

  // Stories — gradient ring + play badge when active stories exist (web flow)
  const displayName = user?.displayName || "Unknown";
  const username = user?.username || user?.address || "";
  const address = user?.walletAddress || user?.address || "";
  // An alias, not a rename — `username` above is untouched by it, and every
  // share link on this screen still points at the username URL.
  const ensName = user?.ensName || "";
  const { isWatched, markWatched } = useWatchedStories();
  const { openStories } = useStoryViewer();
  const [myStories, setMyStories] = useState<Story[]>([]);
  const hasStories = myStories.length > 0;
  const hasUnwatchedStories = myStories.some((s) => !isWatched(s.id));

  const refreshMyStories = useCallback(() => {
    if (!address) {
      setMyStories([]);
      return;
    }
    getStoriesForWallet(address).then(setMyStories).catch(() => setMyStories([]));
  }, [address]);

  useEffect(() => {
    refreshMyStories();
  }, [refreshMyStories]);

  const shortAddr = truncateAddress(address, 5, 5);
  // Explicit sizes: this avatar renders at 88pt, well above the 48pt default
  // getAvatarUrl assumes for feed and comment rows, and the cover is full-bleed.
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl, PROFILE_AVATAR_PT);
  const coverUrl = getCoverUrl(user?.coverImageUrl, COVER_WIDTH_PT);
  // Both are tappable and open the pinch-zoom viewer, which has to be handed the
  // original — the sized versions above are for the 88pt/140pt boxes on screen,
  // and blowing one of those up to fullscreen is exactly the softness the
  // sizing is meant to be invisible at. `0` / no width means no transform.
  const avatarFullUrl = getAvatarUrl(user?.avatarImageUrl, 0);
  const coverFullUrl = getCoverUrl(user?.coverImageUrl);
  const badgeVal = resolveBadgeBalance(user as any);
  // The lock alongside the balance: a tier earned before the ladder moved is
  // still theirs, and the badge here has to agree with the one on their posts.
  const badgeLock = resolveBadgeLock(user as any);
  const badge = getBadgeName(badgeVal, { lock: badgeLock });
  const badgeImage = getBadgeUrl(badgeVal, { lock: badgeLock });

  // account_info returns followers/followings as arrays of addresses (or a
  // plain number elsewhere) — resolveCount normalises both to a count.
  const followersCount = resolveCount(user?.followers, (user as any)?.follower_count);
  const followingCount = resolveCount(user?.followings, (user as any)?.following_count);

  const openMyStories = useCallback(() => {
    if (!myStories.length) return;
    myStories.forEach((s) => markWatched(s.id));
    openStories(myStories, {
      viewerWalletAddress: address,
      onStoryShown: (story) => markWatched(story.id),
      onStoriesChanged: refreshMyStories,
    });
  }, [myStories, markWatched, openStories, address, refreshMyStories]);

  // Deterministic default banner based on user ID/address
  const defaultBanner = useMemo(
    () => getDefaultBanner(user?.address || ""),
    [user?.address]
  );

  const createdAtFormatted = useMemo(
    () => formatJoinedDate(user?.createdAt) || undefined,
    [user?.createdAt]
  );

  const socials: { key: string; url?: string; icon: string; label: string }[] =
    [
      { key: "facebook", url: user?.facebookLink, icon: "logo-facebook", label: "Facebook" },
      { key: "twitter", url: user?.twitterLink, icon: "logo-twitter", label: "Twitter" },
      { key: "discord", url: user?.discordLink, icon: "logo-discord", label: "Discord" },
      { key: "instagram", url: user?.instagramLink, icon: "logo-instagram", label: "Instagram" },
      { key: "tiktok", url: user?.tiktokLink, icon: "musical-notes-outline", label: "TikTok" },
      { key: "youtube", url: user?.youtubeLink, icon: "logo-youtube", label: "YouTube" },
      { key: "telegram", url: user?.telegramLink, icon: "paper-plane-outline", label: "Telegram" },
    ].filter((s) => !!s.url);

  const aboutText = (user?.aboutMe || "").trim();

  const handleTranslateBio = useCallback(async () => {
    if (!aboutText) return;
    setIsTranslatingBio(true);
    try {
      const { translatedText } = await translateText(aboutText, targetLang.current);
      setTranslatedBio(translatedText);
    } catch {
      // silently ignore
    } finally {
      setIsTranslatingBio(false);
    }
  }, [aboutText]);

  const handleShare = useCallback(async () => {
    const profileSlug = username || address;
    const url = `${WEBSITE_LINK}/${profileSlug}`;
    const message = `Check out my dehub profile ${url}`;
    await shareProfile(url, message);
  }, [username, address]);

  const openViewer = useCallback(
    (uri?: string) => {
      if (!uri) return;
      (navigation as any).navigate(ScreenNames.ImageViewer, {
        images: [uri],
        initialIndex: 0,
      });
    },
    [navigation]
  );

  const goToFollowList = useCallback(
    (tab: "followers" | "following") => {
      if (!address) return;
      navigation.navigate(ScreenNames.FollowList, {
        address,
        username: user?.username,
        initialTab: tab,
        hideFollowers: user?.hideFollowers,
        isOwnProfile: true,
      });
    },
    [address, user?.username, user?.hideFollowers, navigation]
  );

  const processAndUpload = useCallback(
    async (kind: "avatar" | "cover", uri: string) => {
      const isAvatar = kind === "avatar";
      try {
        isAvatar ? setUploadingAvatar(true) : setUploadingCover(true);
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
        if (isAvatar) {
          await patchUser?.({ avatarImageUrl: `${user?.avatarImageUrl || ""}` });
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
    [user, patchUser, refreshUser]
  );

  const startChangeAvatar = useCallback(async () => {
    try {
      await runWithPermissions(["photos"], async () => {
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
      await runWithPermissions(["photos"], async () => {
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
    <View className="w-full">
      {/* Cover */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() =>
          openViewer(
            localCoverUri ||
              (coverFullUrl !== "default-banner" ? coverFullUrl : undefined)
          )
        }
      >
        <View className="mx-4 rounded-xl overflow-hidden" style={{ height: 140 }}>
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
          <TouchableOpacity
            onPress={startChangeCover}
            className="absolute right-2 bottom-2 bg-black/50 rounded-full p-2"
            accessibilityLabel="Change cover image"
            activeOpacity={0.85}
          >
            <Ionicons name="camera" size={16} color="#fff" />
          </TouchableOpacity>
          {uploadingCover && (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View className="px-5">
        {/* Avatar overlapping cover + actions on the right */}
        <View className="flex-row items-end justify-between" style={{ marginTop: -44 }}>
          <View>
            <StoryAvatarRing
              uri={avatarUrl === "default-avatar" ? undefined : avatarUrl}
              name={displayName}
              size={88}
              hasStories={hasStories}
              unwatched={hasUnwatchedStories}
              onPressStory={openMyStories}
              onPressAvatar={() =>
                openViewer(
                  avatarFullUrl === "default-avatar" ? undefined : avatarFullUrl
                )
              }
              rounded={false}
            />
            <TouchableOpacity
              onPress={startChangeAvatar}
              className="absolute right-0 bottom-0 bg-black/60 rounded-full p-1.5 border border-white/20"
              accessibilityLabel="Change avatar"
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={13} color="#fff" />
            </TouchableOpacity>
            {uploadingAvatar && (
              <View className="absolute inset-0 items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>

          <View className="flex-row items-center gap-2 mb-1">
            <LiquidGlass className="rounded-xl" intensity={40} noBlur>
              <TouchableOpacity
                onPress={() => navigation.navigate(ScreenNames.EditProfile)}
                accessibilityLabel="Edit profile"
                activeOpacity={0.85}
                className="px-4 flex-row items-center"
                style={{ height: 36, gap: 6 }}
              >
                <Ionicons name="pencil" size={14} color="#fff" />
                <Text className="text-white font-semibold text-[13px]">Edit Profile</Text>
              </TouchableOpacity>
            </LiquidGlass>
            <TouchableOpacity
              onPress={handleShare}
              accessibilityLabel="Share profile"
              activeOpacity={0.85}
            >
              <LiquidGlass className="rounded-xl" intensity={40} noBlur>
                <View className="items-center justify-center" style={{ width: 36, height: 36 }}>
                  <Ionicons name="share-social" size={16} color="#fff" />
                </View>
              </LiquidGlass>
            </TouchableOpacity>
          </View>
        </View>

        {/* Name + badge + socials */}
        <View className="mt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
              <Text className="text-white text-xl font-bold" numberOfLines={1}>
                {displayName}
              </Text>
              {badge && (
                <View className="w-4 h-4 rounded-full bg-theme-neutrals-800 items-center justify-center overflow-hidden">
                  {badgeImage ? (
                    <SmartImage
                      source={badgeImage as any}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      style={{ width: 10, height: 10 }}
                    />
                  ) : (
                    <Ionicons name="star" size={10} color="#fff" />
                  )}
                </View>
              )}
            </View>
            {socials.length > 0 && (
              <View className="flex-row items-center gap-1">
                {socials.map((sc) => (
                  <TouchableOpacity
                    key={sc.key}
                    onPress={() => openExternalLink(sc.url)}
                    activeOpacity={0.7}
                    accessibilityLabel={sc.label}
                  >
                    <LiquidGlass className="rounded-xl" intensity={30} noBlur>
                      <View
                        className="items-center justify-center"
                        style={{ width: 32, height: 32 }}
                      >
                        <Ionicons name={sc.icon as any} size={14} color="#A1A1AA" />
                      </View>
                    </LiquidGlass>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Username + wallet address */}
          <View className="flex-row items-center mt-0.5 gap-2 flex-wrap">
            {!!username && (
              <TouchableOpacity onPress={() => copyToClipboard(username)} activeOpacity={0.7}>
                <Text className="text-zinc-400 text-sm">@{username}</Text>
              </TouchableOpacity>
            )}
            {/* Beside the handle, never instead of it. Tapping copies the .eth
                URL rather than the bare name — that is the half a recipient
                can act on, and the reason to have claimed one. */}
            {!!ensName && (
              <TouchableOpacity
                onPress={() => {
                  copyToClipboard(ensProfileUrl(ensName));
                  toastSuccess("ENS profile URL copied");
                }}
                activeOpacity={0.7}
                accessibilityLabel={`Verified ENS name ${ensName}`}
                className="px-2 py-0.5 bg-theme-neutrals-800 rounded-md flex-row items-center"
              >
                <Ionicons name="globe-outline" size={11} color="#A1A1AA" />
                <Text className="text-theme-neutrals-300 text-[11px] font-medium ml-1">
                  {ensName}
                </Text>
              </TouchableOpacity>
            )}
            {/* Temporary — gone 30 days after signup, and immediately if they
                switch it off in Settings › Privacy. Renders nothing otherwise. */}
            <NewMemberChip address={address} />
            {/* A lent badge draws like any other badge everywhere else; this
                is the one place that says whose it is. */}
            <BadgePatronChip lookupId={address} />
            {!!address && (
              <View className="flex-row items-center">
                <Ionicons
                  name="wallet-outline"
                  size={13}
                  color="#808089"
                  style={{ marginRight: 4 }}
                />
                <Text className="text-zinc-400 text-xs mr-1" numberOfLines={1}>
                  {shortAddr}
                </Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(address)}
                  accessibilityLabel="Copy address"
                  hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
                >
                  <Ionicons name="copy-outline" size={13} color="#808089" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Bio */}
          {!!aboutText && (
            <View className="mt-3">
              <Text className="text-white/90 text-sm">{translatedBio ?? aboutText}</Text>
              <TranslateButton
                isTranslated={!!translatedBio}
                isLoading={isTranslatingBio}
                onTranslate={handleTranslateBio}
                onShowOriginal={() => setTranslatedBio(null)}
              />
            </View>
          )}

          {/* Joined */}
          {!!createdAtFormatted && (
            <Text className="text-zinc-400 text-sm mt-3">{t("profile.joined")} {createdAtFormatted}</Text>
          )}

          {/* Following / Followers */}
          <View className="flex-row items-center gap-4 mt-3">
            <TouchableOpacity onPress={() => goToFollowList("following")} activeOpacity={0.7}>
              <Text className="text-sm">
                <Text className="text-white font-bold">
                  {formatCompactNumber(followingCount)}
                </Text>
                <Text className="text-zinc-400"> {t("profile.following")}</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goToFollowList("followers")} activeOpacity={0.7}>
              <Text className="text-sm">
                <Text className="text-white font-bold">
                  {formatCompactNumber(followersCount)}
                </Text>
                <Text className="text-zinc-400"> {t("profile.followers")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default ProfileHeader;
