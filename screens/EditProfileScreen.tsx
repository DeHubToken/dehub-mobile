import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGateToHome } from "../hooks/useGateToHome";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { getAvatarUrl, getCoverUrl } from "../libs/misc";

/** Matches the Avatar `size={88}` below. */
const EDIT_AVATAR_PT = 88;
/** The cover strip is full-bleed. */
const EDIT_COVER_WIDTH_PT = Dimensions.get("window").width;

import Avatar from "../components/common/Avatar";
import Icon from "../components/ui/Icon";
import { openCroppedImagePicker, resizeAndCompress, createRNImageFile } from "../libs/assets.util";
import { runWithPermissions } from "../libs/permissions.util";
import { AuthService } from "../services/auth.service";
import { toastError, toastSuccess } from "../libs/toast";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useDebounceCallback } from "../hooks/useDebounceCallback";
import { validateSocial } from "../libs/links.utils";
import { isReservedUsername } from "../libs/reserved-usernames";
import {
  TWITTER_SVG_XML,
  INSTAGRAM_SVG_XML,
  TIKTOK_SVG_XML,
  YOUTUBE_SVG_XML,
  DISCORD_SVG_XML,
  TELEGRAM_SVG_XML,
  FACEBOOK_SVG_XML,
} from "../config/socialIcons";

const BIO_MAX = 160;

type SocialField = {
  key: string;
  label: string;
  platform: "x" | "instagram" | "tiktok" | "youtube" | "discord" | "telegram" | "facebook";
  svg: string;
  placeholder: string;
  value: string;
  setter: (v: string) => void;
};

const EditProfileScreen = () => {
  const { t } = useTranslation();
  // ScreenHeader sits above the KeyboardAvoidingView, on top of the inset the
  // root SafeAreaView already spent.
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);
  const navigation = useNavigation<any>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { refreshUser, patchUser } = useAuthActions();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const [displayName, setDisplayName] = useState<string>(user?.displayName || "");
  const [username, setUsername] = useState<string>(user?.username || "");
  const [aboutMe, setAboutMe] = useState<string>(user?.aboutMe || "");
  const [twitterLink, setTwitterLink] = useState<string>(user?.twitterLink || "");
  const [instagramLink, setInstagramLink] = useState<string>(user?.instagramLink || "");
  const [tiktokLink, setTiktokLink] = useState<string>(user?.tiktokLink || "");
  const [youtubeLink, setYoutubeLink] = useState<string>(user?.youtubeLink || "");
  const [discordLink, setDiscordLink] = useState<string>(user?.discordLink || "");
  const [telegramLink, setTelegramLink] = useState<string>(user?.telegramLink || "");
  const [facebookLink, setFacebookLink] = useState<string>(user?.facebookLink || "");

  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [localCover, setLocalCover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [processingCover, setProcessingCover] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [socialErrors, setSocialErrors] = useState<Record<string, string | undefined>>({});

  // Explicit sizes — this avatar renders at 88pt and the cover is full-bleed,
  // both larger than getAvatarUrl's feed-row default.
  const avatarUrl = useMemo(
    () => getAvatarUrl(user?.avatarImageUrl, EDIT_AVATAR_PT),
    [user?.avatarImageUrl],
  );
  const coverUrl = useMemo(
    () => getCoverUrl(user?.coverImageUrl, EDIT_COVER_WIDTH_PT),
    [user?.coverImageUrl],
  );

  const initial = useMemo(
    () => ({
      displayName: user?.displayName || "",
      username: user?.username || "",
      aboutMe: user?.aboutMe || "",
      twitterLink: user?.twitterLink || "",
      instagramLink: user?.instagramLink || "",
      tiktokLink: user?.tiktokLink || "",
      youtubeLink: user?.youtubeLink || "",
      discordLink: user?.discordLink || "",
      telegramLink: user?.telegramLink || "",
      facebookLink: user?.facebookLink || "",
    }),
    [user]
  );

  const isDirty = useMemo(() => {
    return (
      displayName.trim() !== initial.displayName.trim() ||
      username.trim() !== initial.username.trim() ||
      aboutMe.trim() !== initial.aboutMe.trim() ||
      twitterLink.trim() !== initial.twitterLink.trim() ||
      instagramLink.trim() !== initial.instagramLink.trim() ||
      tiktokLink.trim() !== initial.tiktokLink.trim() ||
      youtubeLink.trim() !== initial.youtubeLink.trim() ||
      discordLink.trim() !== initial.discordLink.trim() ||
      telegramLink.trim() !== initial.telegramLink.trim() ||
      facebookLink.trim() !== initial.facebookLink.trim() ||
      !!localAvatar ||
      !!localCover
    );
  }, [
    displayName, username, aboutMe,
    twitterLink, instagramLink, tiktokLink, youtubeLink, discordLink, telegramLink, facebookLink,
    localAvatar, localCover, initial,
  ]);

  const runUsernameCheck = useDebounceCallback(async (name: string) => {
    if (!name || name.trim() === initial.username.trim()) {
      setUsernameAvailable(null);
      setCheckingUsername(false);
      return;
    }
    // Names that collide with a web route leave the profile unreachable at
    // dehub.io/:username. Checked before the availability call, which reports
    // every one of them as free.
    if (isReservedUsername(name)) {
      setUsernameAvailable(false);
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    try {
      const res = await AuthService.checkUsernameAvailability(name.trim());
      setUsernameAvailable(res.available);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, 450);

  useEffect(() => {
    runUsernameCheck(username);
  }, [username]);

  const handlePickAvatar = useCallback(async () => {
    try {
      setProcessingAvatar(true);
      await runWithPermissions(["photos"], async () => {
        const picked = await openCroppedImagePicker({
          width: 800,
          height: 800,
          circle: false,
          quality: 0.9,
          forceJpg: true,
        });
        if (!picked) return;
        setLocalAvatar(picked);
        const manip = await resizeAndCompress(picked, {
          width: 512,
          height: 512,
          compress: 0.85,
          format: "jpeg",
        });
        setLocalAvatar(manip);
      });
    } catch (e) {
      toastError(e, "Avatar update failed");
      setLocalAvatar(null);
    } finally {
      setProcessingAvatar(false);
    }
  }, []);

  const handlePickCover = useCallback(async () => {
    try {
      setProcessingCover(true);
      await runWithPermissions(["photos"], async () => {
        const picked = await openCroppedImagePicker({
          width: 1800,
          height: 600,
          circle: false,
          quality: 0.9,
          forceJpg: true,
        });
        if (!picked) return;
        setLocalCover(picked);
        const manip = await resizeAndCompress(picked, {
          width: 1500,
          height: 500,
          compress: 0.85,
          format: "jpeg",
        });
        setLocalCover(manip);
      });
    } catch (e) {
      toastError(e, "Cover update failed");
      setLocalCover(null);
    } finally {
      setProcessingCover(false);
    }
  }, []);

  const onSave = useCallback(async () => {
    const prevUserSnapshot = user;
    try {
      setSaving(true);
      const usernameChanged = username?.trim() !== initial.username.trim();
      if (usernameChanged && isReservedUsername(username)) {
        throw new Error("This username is reserved");
      }
      const tw = validateSocial("x", twitterLink);
      const ig = validateSocial("instagram", instagramLink);
      const tk = validateSocial("tiktok", tiktokLink);
      const yt = validateSocial("youtube", youtubeLink);
      const dc = validateSocial("discord", discordLink);
      const tg = validateSocial("telegram", telegramLink);
      const fb = validateSocial("facebook", facebookLink);
      const errs: Record<string, string | undefined> = {
        twitterLink: tw.valid ? undefined : tw.reason,
        instagramLink: ig.valid ? undefined : ig.reason,
        tiktokLink: tk.valid ? undefined : tk.reason,
        youtubeLink: yt.valid ? undefined : yt.reason,
        discordLink: dc.valid ? undefined : dc.reason,
        telegramLink: tg.valid ? undefined : tg.reason,
        facebookLink: fb.valid ? undefined : fb.reason,
      };
      setSocialErrors(errs);
      if (Object.values(errs).some(Boolean)) {
        throw new Error("Please fix invalid social links");
      }

      const payload: Record<string, any> = {
        displayName: displayName?.trim(),
        // Only sent when it actually changed. It used to go on every save, so
        // once a name became reserved its existing holder could no longer edit
        // their own bio without the guard above rejecting the whole save.
        ...(usernameChanged ? { username: username?.trim() } : {}),
        aboutMe: aboutMe?.trim(),
        twitterLink: tw.normalized,
        instagramLink: ig.normalized,
        tiktokLink: tk.normalized,
        youtubeLink: yt.normalized,
        discordLink: dc.normalized,
        telegramLink: tg.normalized,
        facebookLink: fb.normalized,
      };
      await patchUser?.({
        displayName: payload.displayName,
        username: payload.username,
        aboutMe: payload.aboutMe,
        twitterLink: payload.twitterLink,
        instagramLink: payload.instagramLink,
        tiktokLink: payload.tiktokLink,
        youtubeLink: payload.youtubeLink,
        discordLink: payload.discordLink,
        telegramLink: payload.telegramLink,
        facebookLink: payload.facebookLink,
        ...(localAvatar ? { avatarImageUrl: localAvatar } : {}),
        ...(localCover ? { coverImageUrl: localCover } : {}),
      });
      if (localAvatar) {
        const avatarFile = createRNImageFile(localAvatar, "avatar");
        payload.avatar = avatarFile;
        payload.avatarImg = avatarFile;
      }
      if (localCover) {
        const coverFile = createRNImageFile(localCover, "cover");
        payload.cover = coverFile;
        payload.coverImg = coverFile;
      }
      payload.facebookLink = fb.normalized;
      await AuthService.updateProfile(payload);
      await refreshUser?.();
      toastSuccess("Profile updated");
      navigation.goBack();
    } catch (e) {
      if (prevUserSnapshot && typeof patchUser === "function") {
        try {
          await patchUser(prevUserSnapshot as any);
        } catch {}
      }
      toastError(e, "Update failed");
    } finally {
      setSaving(false);
    }
  }, [
    displayName, username, aboutMe,
    twitterLink, instagramLink, tiktokLink, youtubeLink, discordLink, telegramLink, facebookLink,
    localAvatar, localCover, user, patchUser, refreshUser, navigation, initial,
  ]);

  const socialFields: SocialField[] = useMemo(
    () => [
      { key: "twitterLink", label: "X (Twitter)", platform: "x", svg: TWITTER_SVG_XML, placeholder: "Username", value: twitterLink, setter: setTwitterLink },
      { key: "instagramLink", label: "Instagram", platform: "instagram", svg: INSTAGRAM_SVG_XML, placeholder: "Username", value: instagramLink, setter: setInstagramLink },
      { key: "tiktokLink", label: "TikTok", platform: "tiktok", svg: TIKTOK_SVG_XML, placeholder: "Username", value: tiktokLink, setter: setTiktokLink },
      { key: "youtubeLink", label: "YouTube", platform: "youtube", svg: YOUTUBE_SVG_XML, placeholder: "Channel URL or handle", value: youtubeLink, setter: setYoutubeLink },
      { key: "discordLink", label: "Discord", platform: "discord", svg: DISCORD_SVG_XML, placeholder: "Invite link", value: discordLink, setter: setDiscordLink },
      { key: "telegramLink", label: "Telegram", platform: "telegram", svg: TELEGRAM_SVG_XML, placeholder: "Username", value: telegramLink, setter: setTelegramLink },
      { key: "facebookLink", label: "Facebook", platform: "facebook", svg: FACEBOOK_SVG_XML, placeholder: "Profile URL or username", value: facebookLink, setter: setFacebookLink },
    ],
    [twitterLink, instagramLink, tiktokLink, youtubeLink, discordLink, telegramLink, facebookLink]
  );

  // A changed username has to be positively cleared. The old gate only blocked
  // on an explicit `false`, and the answer is null for the whole debounce
  // window, so typing a name and saving straight away sent it unchecked.
  const usernameEdited = username.trim() !== initial.username.trim();
  const saveDisabled =
    saving ||
    !isDirty ||
    checkingUsername ||
    (usernameEdited && (usernameAvailable !== true || isReservedUsername(username)));

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader
        title={t("screens.editProfile")}
        rightContent={
          <TouchableOpacity
            onPress={onSave}
            className={`px-4 py-2 rounded-xl ${saveDisabled ? "bg-theme-neutrals-800" : "bg-blue-600 active:opacity-90"}`}
            activeOpacity={0.8}
            disabled={saveDisabled}
          >
            <View className="flex-row items-center gap-1">
              {saving && <ActivityIndicator size="small" color="#fff" />}
              <Text className="text-white font-medium text-sm">
                {saving ? "Saving..." : "Save"}
              </Text>
            </View>
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? keyboardOffset : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="px-4">
            <TouchableOpacity
              onPress={handlePickCover}
              activeOpacity={0.85}
              className="w-full rounded-xl overflow-hidden bg-theme-neutrals-900 mt-2"
              style={{ aspectRatio: 3 }}
            >
              {(localCover || (coverUrl && coverUrl !== "default-banner")) && (
                <Image
                  source={{ uri: localCover || coverUrl }}
                  style={{ position: "absolute", width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              )}
              <View className="flex-1 items-center justify-center bg-black/30">
                {processingCover ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View className="bg-black/50 rounded-full p-3">
                    <Icon name="Camera" size={20} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          <View className="items-center -mt-11 mb-4">
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85}>
              <View>
                <Avatar
                  uri={localAvatar ? localAvatar : avatarUrl === "default-avatar" ? undefined : avatarUrl}
                  size={88}
                  borderWidth={4}
                  borderColor="#010305"
                  name={displayName}
                />
                <View className="absolute bottom-0 right-0 bg-blue-600 rounded-full p-1.5 border-2 border-[#010305]">
                  {processingAvatar ? (
                    <ActivityIndicator size={14} color="#fff" />
                  ) : (
                    <Icon name="Camera" size={14} color="#fff" />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <View className="px-4 gap-5">
            <View>
              <Text className="text-neutral-400 text-xs font-medium mb-1.5">Display Name</Text>
              <TextInput
                className="bg-theme-neutrals-900 text-white text-base px-4 py-3 rounded-xl border border-theme-neutrals-700"
                placeholderTextColor="#6b7280"
                placeholder="Your display name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            </View>

            <View>
              <Text className="text-neutral-400 text-xs font-medium mb-1.5">Username</Text>
              <TextInput
                className="bg-theme-neutrals-900 text-white text-base px-4 py-3 rounded-xl border border-theme-neutrals-700"
                placeholderTextColor="#6b7280"
                placeholder="@username"
                value={username}
                // Was `setUsername` raw: this field accepted uppercase, spaces,
                // punctuation and any length, none of which the web signup form
                // allows and none of which survives being put in a URL. Match
                // the web rule at the keystroke.
                onChangeText={(text) =>
                  setUsername(text.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 30))
                }
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
              <View className="mt-1 min-h-[16px]">
                {checkingUsername && (
                  <Text className="text-[10px] text-neutral-400">Checking availability…</Text>
                )}
                {!checkingUsername &&
                  username.trim().length > 0 &&
                  username.trim() !== initial.username.trim() &&
                  usernameAvailable === true && (
                    <Text className="text-[10px] text-white/80">Username is available</Text>
                  )}
                {!checkingUsername &&
                  username.trim().length > 0 &&
                  username.trim() !== initial.username.trim() &&
                  usernameAvailable === false && (
                    <Text className="text-[10px] text-white/80">
                      {isReservedUsername(username) ? "This username is reserved" : "Username taken"}
                    </Text>
                  )}
                {!checkingUsername && username.trim().length === 0 && (
                  <Text className="text-[10px] text-neutral-500">3–30 chars: letters, numbers, underscore.</Text>
                )}
              </View>
            </View>

            <View>
              <Text className="text-neutral-400 text-xs font-medium mb-1.5">Bio</Text>
              <TextInput
                className="bg-theme-neutrals-900 text-white text-base px-4 py-3 rounded-xl border border-theme-neutrals-700 h-28"
                placeholderTextColor="#6b7280"
                placeholder="Tell people about you"
                value={aboutMe}
                onChangeText={(val) => setAboutMe(val.slice(0, BIO_MAX))}
                multiline
                numberOfLines={4}
                style={{ textAlignVertical: "top" }}
              />
              <View className="flex-row justify-end mt-1">
                <Text className={`text-[10px] ${aboutMe.length >= BIO_MAX ? "text-white/80" : "text-neutral-400"}`}>
                  {aboutMe.length}/{BIO_MAX}
                </Text>
              </View>
            </View>

            <View className="mt-2">
              <Text className="text-neutral-400 text-xs font-medium mb-3">Social Links</Text>
              <View className="gap-3">
                {socialFields.map((field) => {
                  const hasError = !!socialErrors[field.key];
                  return (
                    <View key={field.key}>
                      <View
                        className={`flex-row items-center bg-theme-neutrals-900 rounded-xl border ${
                          hasError ? "border-white/20" : "border-theme-neutrals-700"
                        } overflow-hidden`}
                      >
                        <View className="pl-3.5 pr-2.5 py-3">
                          <SvgXml
                            xml={field.svg.replace(/currentColor/g, hasError ? "#F4F4F5" : "#9ca3af")}
                            width={18}
                            height={18}
                          />
                        </View>
                        <TextInput
                          className="flex-1 text-white text-base py-3 pr-4"
                          placeholderTextColor="#6b7280"
                          placeholder={field.placeholder}
                          value={field.value}
                          onChangeText={(val) => {
                            field.setter(val);
                            setSocialErrors((prev) => ({ ...prev, [field.key]: undefined }));
                          }}
                          autoCapitalize="none"
                        />
                      </View>
                      {hasError && (
                        <Text className="text-[10px] text-white/80 mt-1 ml-1">
                          {socialErrors[field.key]}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default EditProfileScreen;
