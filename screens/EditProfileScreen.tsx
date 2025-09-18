import React, { useCallback, useMemo, useState, useEffect } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { getAvatarUrl, getCoverUrl } from "../libs/misc";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import {
  requestMediaLibraryPermission,
  openCroppedImagePicker,
  resizeAndCompress,
  createRNImageFile,
} from "../libs/assets.util";
import { AuthService } from "../services/auth.service";
import { toastError, toastSuccess } from "../libs/toast";
import ScreenHeader from "../components/ScreenHeader";
import { useDebounceCallback } from "../hooks/useDebounceCallback";
import { validateSocial } from "../libs/links.utils";

const EditProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { user, refreshUser, patchUser } = useAuth() as any;

  const [displayName, setDisplayName] = useState<string>(
    user?.displayName || ""
  );
  const [username, setUsername] = useState<string>(user?.username || "");
  const [email, setEmail] = useState<string>(user?.email || "");
  const [aboutMe, setAboutMe] = useState<string>(user?.aboutMe || "");
  const BIO_MAX = 160;
  const [facebookLink, setFacebookLink] = useState<string>(
    user?.facebookLink || ""
  );
  const [instagramLink, setInstagramLink] = useState<string>(
    user?.instagramLink || ""
  );
  const [twitterLink, setTwitterLink] = useState<string>(
    user?.twitterLink || ""
  );
  const [discordLink, setDiscordLink] = useState<string>(
    user?.discordLink || ""
  );

  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [localCover, setLocalCover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [processingCover, setProcessingCover] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
  );
  const [socialErrors, setSocialErrors] = useState<{
    [k: string]: string | undefined;
  }>({});

  const avatarUrl = useMemo(
    () => getAvatarUrl(user?.avatarImageUrl),
    [user?.avatarImageUrl]
  );
  const coverUrl = useMemo(
    () => getCoverUrl(user?.coverImageUrl),
    [user?.coverImageUrl]
  );

  const initial = useMemo(
    () => ({
      displayName: user?.displayName || "",
      username: user?.username || "",
      email: user?.email || "",
      aboutMe: user?.aboutMe || "",
      facebookLink: user?.facebookLink || "",
      instagramLink: user?.instagramLink || "",
      twitterLink: user?.twitterLink || "",
      discordLink: user?.discordLink || "",
    }),
    [user]
  );

  const isDirty = useMemo(() => {
    return (
      displayName.trim() !== initial.displayName.trim() ||
      username.trim() !== initial.username.trim() ||
      email.trim() !== initial.email.trim() ||
      aboutMe.trim() !== initial.aboutMe.trim() ||
      facebookLink.trim() !== initial.facebookLink.trim() ||
      instagramLink.trim() !== initial.instagramLink.trim() ||
      twitterLink.trim() !== initial.twitterLink.trim() ||
      discordLink.trim() !== initial.discordLink.trim() ||
      !!localAvatar ||
      !!localCover
    );
  }, [
    displayName,
    username,
    email,
    aboutMe,
    facebookLink,
    instagramLink,
    twitterLink,
    discordLink,
    localAvatar,
    localCover,
    initial,
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
    } catch (e) {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  }, 450);

  useEffect(() => {
    runUsernameCheck(username);
  }, [username]);

  const handlePickAvatar = useCallback(async () => {
    const ok = await requestMediaLibraryPermission();
    if (!ok) return toastError("Permission to access photos is required.");
    try {
      setProcessingAvatar(true);
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
      // Do not upload now; will upload on Save
    } catch (e) {
      toastError(e, "Avatar update failed");
      setLocalAvatar(null);
    } finally {
      setProcessingAvatar(false);
    }
  }, [requestMediaLibraryPermission]);

  const handlePickCover = useCallback(async () => {
    const ok = await requestMediaLibraryPermission();
    if (!ok) return toastError("Permission to access photos is required.");
    try {
      setProcessingCover(true);
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
      // Do not upload now; will upload on Save
    } catch (e) {
      toastError(e, "Cover update failed");
      setLocalCover(null);
    } finally {
      setProcessingCover(false);
    }
  }, [requestMediaLibraryPermission]);

  const onSave = useCallback(async () => {
    try {
      setSaving(true);
      // Normalize socials first
      const fb = validateSocial("facebook", facebookLink);
      const ig = validateSocial("instagram", instagramLink);
      const tw = validateSocial("x", twitterLink);
      const dc = validateSocial("discord", discordLink);
      const errs: { [k: string]: string | undefined } = {
        facebookLink: fb.valid ? undefined : fb.reason,
        instagramLink: ig.valid ? undefined : ig.reason,
        twitterLink: tw.valid ? undefined : tw.reason,
        discordLink: dc.valid ? undefined : dc.reason,
      };
      setSocialErrors(errs);
      if (Object.values(errs).some(Boolean)) {
        throw new Error("Please fix invalid social links");
      }

      const payload: Record<string, any> = {
        displayName: displayName?.trim(),
        username: username?.trim(),
        email: email?.trim(),
        aboutMe: aboutMe?.trim(),
        facebookLink: fb.normalized,
        instagramLink: ig.normalized,
        twitterLink: tw.normalized,
        discordLink: dc.normalized,
      };
      if (localAvatar) {
        const avatarFile = createRNImageFile(localAvatar, "avatar");
        payload.avatar = avatarFile;
        payload.avatarImage = avatarFile;
      }
      if (localCover) {
        const coverFile = createRNImageFile(localCover, "cover");
        payload.cover = coverFile;
        payload.coverImage = coverFile;
      }
      await AuthService.updateProfile(payload);
      await refreshUser?.();
      toastSuccess("Profile updated");
      navigation.goBack();
    } catch (e) {
      toastError(e, "Update failed");
    } finally {
      setSaving(false);
    }
  }, [
    displayName,
    username,
    email,
    aboutMe,
    facebookLink,
    instagramLink,
    twitterLink,
    discordLink,
  ]);

  const onDiscard = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader
        title="Edit Profile"
        rightContent={
          <TouchableOpacity
            onPress={onSave}
            className={` flex px-4 py-2 rounded-full ${
              saving ||
              !isDirty ||
              checkingUsername ||
              (username.trim() !== initial.username.trim() &&
                usernameAvailable === false)
                ? "bg-theme-neutrals-800"
                : "bg-blue-600 active:opacity-90"
            }`}
            activeOpacity={0.8}
            disabled={
              saving ||
              !isDirty ||
              checkingUsername ||
              (username.trim() !== initial.username.trim() &&
                usernameAvailable === false)
            }
          >
            <View className="flex-row items-center gap-1">
              {saving && <ActivityIndicator color="#fff" />}
              <Text className="text-white font-medium">
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
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Cover */}
          <View className="w-full h-32 bg-theme-neutrals-900 rounded-lg mb-4 overflow-hidden items-center justify-center">
            {localCover ? (
              <Image
                source={{ uri: localCover }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : coverUrl !== "default-banner" ? (
              <Image
                source={{ uri: coverUrl }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : null}
            <TouchableOpacity
              onPress={handlePickCover}
              className="bg-black/50 rounded-full p-3"
            >
              {processingCover ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="camera" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View className="items-center mb-6">
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.85}>
              <View className="relative">
                <Avatar
                  uri={
                    localAvatar
                      ? localAvatar
                      : avatarUrl === "default-avatar"
                      ? undefined
                      : avatarUrl
                  }
                  size={96}
                  borderWidth={4}
                  borderColor="#0a0a0a"
                />
                <View className="absolute bottom-1 right-1 bg-black/60 rounded-full p-1">
                  {processingAvatar ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Text fields */}
          <View className="gap-4">
            {[
              {
                label: "Username",
                value: username,
                setter: setUsername,
                placeholder: "@username",
              },
              {
                label: "Display Name",
                value: displayName,
                setter: setDisplayName,
                placeholder: "Your name",
              },
              {
                label: "Email",
                value: email,
                setter: setEmail,
                placeholder: "you@example.com",
              },
            ].map((f) => (
              <View key={f.label}>
                <Text className="text-gray-400 text-xs mb-1">{f.label}</Text>
                <TextInput
                  className="bg-theme-neutrals-900 text-white text-base px-4 py-3 rounded-xl border border-theme-neutrals-700 focus:border-blue-500"
                  placeholderTextColor="#6b7280"
                  placeholder={f.placeholder}
                  value={f.value}
                  onChangeText={f.setter as any}
                  autoCapitalize="none"
                />
                {f.label === "Username" && (
                  <View className="mt-1 min-h-[16px]">
                    {checkingUsername && (
                      <Text className="text-[10px] text-neutral-400">
                        Checking availability…
                      </Text>
                    )}
                    {!checkingUsername &&
                      username.trim().length > 0 &&
                      username.trim() !== initial.username.trim() &&
                      usernameAvailable === true && (
                        <Text className="text-[10px] text-green-400">
                          Username is available
                        </Text>
                      )}
                    {!checkingUsername &&
                      username.trim().length > 0 &&
                      username.trim() !== initial.username.trim() &&
                      usernameAvailable === false && (
                        <Text className="text-[10px] text-red-400">
                          Username taken
                        </Text>
                      )}
                    {!checkingUsername && username.trim().length === 0 && (
                      <Text className="text-[10px] text-neutral-500">
                        3-30 chars: letters, numbers, underscore.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}

            <View>
              <Text className="text-gray-400 text-xs mb-1">Bio</Text>
              <TextInput
                className="bg-theme-neutrals-900 text-white text-base px-4 py-3 rounded-xl border border-theme-neutrals-700 focus:border-blue-500 h-36"
                placeholderTextColor="#6b7280"
                placeholder="Tell people about you"
                value={aboutMe}
                onChangeText={(val) => setAboutMe(val.slice(0, BIO_MAX))}
                multiline
                numberOfLines={6}
                style={{ textAlignVertical: "top" }}
              />
              <View className="flex-row justify-end mt-1">
                <Text className={`text-[10px] ${aboutMe.length >= BIO_MAX ? 'text-red-400' : 'text-neutral-400'}`}>
                  {aboutMe.length}/{BIO_MAX}
                </Text>
              </View>
            </View>

            {[
              {
                label: "Facebook",
                value: facebookLink,
                setter: setFacebookLink,
                placeholder: "https://facebook.com/you",
              },
              {
                label: "Instagram",
                value: instagramLink,
                setter: setInstagramLink,
                placeholder: "https://instagram.com/you",
              },
              {
                label: "X (Twitter)",
                value: twitterLink,
                setter: setTwitterLink,
                placeholder: "https://x.com/you",
              },
              {
                label: "Discord",
                value: discordLink,
                setter: setDiscordLink,
                placeholder: "https://discord.gg/you",
              },
            ].map((f) => {
              const key =
                f.label === "Facebook"
                  ? "facebookLink"
                  : f.label === "Instagram"
                  ? "instagramLink"
                  : f.label.startsWith("X")
                  ? "twitterLink"
                  : "discordLink";
              const hasError = !!socialErrors[key];
              return (
                <View key={f.label}>
                  <Text className="text-gray-400 text-xs mb-1">{f.label}</Text>
                  <TextInput
                    className={`bg-theme-neutrals-900 text-white text-base px-4 py-3 rounded-xl border ${
                      hasError ? "border-red-500" : "border-theme-neutrals-700"
                    } focus:border-blue-500`}
                    placeholderTextColor="#6b7280"
                    placeholder={f.placeholder}
                    value={f.value}
                    onChangeText={(val) => {
                      (f.setter as any)(val);
                      // live clear error when user types
                      setSocialErrors((prev) => ({
                        ...prev,
                        [key]: undefined,
                      }));
                    }}
                    autoCapitalize="none"
                  />
                  {hasError && (
                    <Text className="text-[10px] text-red-400 mt-1">
                      {socialErrors[key]}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Bottom action bar removed; Save now lives in header */}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default EditProfileScreen;
