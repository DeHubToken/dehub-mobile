import React, { useCallback, useMemo, useState, useEffect } from "react";
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
} from "react-native";
import { SvgXml } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { getAvatarUrl, getCoverUrl } from "../libs/misc";
import Avatar from "../components/common/Avatar";
import Icon from "../components/ui/Icon";
import { openCroppedImagePicker, resizeAndCompress, createRNImageFile } from "../libs/assets.util";
import { runWithPermissions } from "../libs/permissions.util";
import { AuthService } from "../services/auth.service";
import { toastError, toastSuccess } from "../libs/toast";
import ScreenHeader from "../components/ScreenHeader";
import { useDebounceCallback } from "../hooks/useDebounceCallback";
import { validateSocial } from "../libs/links.utils";
import {
  TWITTER_SVG_XML,
  INSTAGRAM_SVG_XML,
  TIKTOK_SVG_XML,
  YOUTUBE_SVG_XML,
  DISCORD_SVG_XML,
  TELEGRAM_SVG_XML,
} from "../config/socialIcons";

const BIO_MAX = 160;

type SocialField = {
  key: string;
  label: string;
  platform: "x" | "instagram" | "tiktok" | "youtube" | "discord" | "telegram";
  svg: string;
  placeholder: string;
  value: string;
  setter: (v: string) => void;
};

const EditProfileScreen = () => {
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

  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [localCover, setLocalCover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [processingCover, setProcessingCover] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [socialErrors, setSocialErrors] = useState<Record<string, string | undefined>>({});

  const avatarUrl = useMemo(() => getAvatarUrl(user?.avatarImageUrl), [user?.avatarImageUrl]);
  const coverUrl = useMemo(() => getCoverUrl(user?.coverImageUrl), [user?.coverImageUrl]);

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
      !!localAvatar ||
      !!localCover
    );
  }, [
    displayName, username, aboutMe,
    twitterLink, instagramLink, tiktokLink, youtubeLink, discordLink, telegramLink,
    localAvatar, localCover, initial,
  ]);

  const runUsernameCheck = useDebounceCallback(async (name: string) => {
    if (!name || name.trim() === initial.username.trim()) {
      setUsernameAvailable(null);
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
      const tw = validateSocial("x", twitterLink);
      const ig = validateSocial("instagram", instagramLink);
      const tk = validateSocial("tiktok", tiktokLink);
      const yt = validateSocial("youtube", youtubeLink);
      const dc = validateSocial("discord", discordLink);
      const tg = validateSocial("telegram", telegramLink);
      const errs: Record<string, string | undefined> = {
        twitterLink: tw.valid ? undefined : tw.reason,
        instagramLink: ig.valid ? undefined : ig.reason,
        tiktokLink: tk.valid ? undefined : tk.reason,
        youtubeLink: yt.valid ? undefined : yt.reason,
        discordLink: dc.valid ? undefined : dc.reason,
        telegramLink: tg.valid ? undefined : tg.reason,
      };
      setSocialErrors(errs);
      if (Object.values(errs).some(Boolean)) {
        throw new Error("Please fix invalid social links");
      }

      const payload: Record<string, any> = {
        displayName: displayName?.trim(),
        username: username?.trim(),
        aboutMe: aboutMe?.trim(),
        twitterLink: tw.normalized,
        instagramLink: ig.normalized,
        tiktokLink: tk.normalized,
        youtubeLink: yt.normalized,
        discordLink: dc.normalized,
        telegramLink: tg.normalized,
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
    twitterLink, instagramLink, tiktokLink, youtubeLink, discordLink, telegramLink,
    localAvatar, localCover, user, patchUser, refreshUser, navigation,
  ]);

  const socialFields: SocialField[] = useMemo(
    () => [
      { key: "twitterLink", label: "X (Twitter)", platform: "x", svg: TWITTER_SVG_XML, placeholder: "Username", value: twitterLink, setter: setTwitterLink },
      { key: "instagramLink", label: "Instagram", platform: "instagram", svg: INSTAGRAM_SVG_XML, placeholder: "Username", value: instagramLink, setter: setInstagramLink },
      { key: "tiktokLink", label: "TikTok", platform: "tiktok", svg: TIKTOK_SVG_XML, placeholder: "Username", value: tiktokLink, setter: setTiktokLink },
      { key: "youtubeLink", label: "YouTube", platform: "youtube", svg: YOUTUBE_SVG_XML, placeholder: "Channel URL or handle", value: youtubeLink, setter: setYoutubeLink },
      { key: "discordLink", label: "Discord", platform: "discord", svg: DISCORD_SVG_XML, placeholder: "Invite link", value: discordLink, setter: setDiscordLink },
      { key: "telegramLink", label: "Telegram", platform: "telegram", svg: TELEGRAM_SVG_XML, placeholder: "Username", value: telegramLink, setter: setTelegramLink },
    ],
    [twitterLink, instagramLink, tiktokLink, youtubeLink, discordLink, telegramLink]
  );

  const saveDisabled =
    saving ||
    !isDirty ||
    checkingUsername ||
    (username.trim() !== initial.username.trim() && usernameAvailable === false);

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader
        title="Edit Profile"
        rightContent={
          <TouchableOpacity
            onPress={onSave}
            className={`px-4 py-2 rounded-full ${saveDisabled ? "bg-theme-neutrals-800" : "bg-blue-600 active:opacity-90"}`}
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
        keyboardVerticalOffset={64}
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
              className="w-full rounded-2xl overflow-hidden bg-theme-neutrals-900 mt-2"
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
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              <View className="mt-1 min-h-[16px]">
                {checkingUsername && (
                  <Text className="text-[10px] text-neutral-400">Checking availability…</Text>
                )}
                {!checkingUsername &&
                  username.trim().length > 0 &&
                  username.trim() !== initial.username.trim() &&
                  usernameAvailable === true && (
                    <Text className="text-[10px] text-green-400">Username is available</Text>
                  )}
                {!checkingUsername &&
                  username.trim().length > 0 &&
                  username.trim() !== initial.username.trim() &&
                  usernameAvailable === false && (
                    <Text className="text-[10px] text-red-400">Username taken</Text>
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
                <Text className={`text-[10px] ${aboutMe.length >= BIO_MAX ? "text-red-400" : "text-neutral-400"}`}>
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
                          hasError ? "border-red-500" : "border-theme-neutrals-700"
                        } overflow-hidden`}
                      >
                        <View className="pl-3.5 pr-2.5 py-3">
                          <SvgXml
                            xml={field.svg.replace(/currentColor/g, hasError ? "#ef4444" : "#9ca3af")}
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
                        <Text className="text-[10px] text-red-400 mt-1 ml-1">
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
