import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ImageBackground, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Linking } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';

import { copyToClipboard } from "../../libs";
import profileImage from "../../assets/default-avatar.png"; // fallback
import bannerImage from "../../assets/banner.png"; // fallback
import { theme } from "../../theme";
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl, getCoverUrl, getBadgeName, getBadgeUrl } from '../../libs/misc';
import { openExternalLink } from '../../libs/links.utils';
import env from '../../config/env';
import { truncate, truncateAddress } from '../../libs/strings.util';
import { formatJoinedDate } from '../../libs/date.util';
import { shareProfile } from '../../libs/misc';
import Avatar from "../common/Avatar";
import * as ImagePicker from 'expo-image-picker';
import { ImageEditor } from 'expo-image-editor';
import * as ImageManipulator from 'expo-image-manipulator';
import { AuthService } from '../../services/auth.service';
import { toastError, toastSuccess } from '../../libs/toast';

const ProfileHeader = () => {
  const navigation = useNavigation<any>();
  const { user, refreshUser, patchUser } = useAuth() as any;
  const [expanded, setExpanded] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editorVisible, setEditorVisible] = useState<false | { uri: string; kind: 'avatar' | 'cover' }>(false);
  const cropState = editorVisible && typeof editorVisible === 'object' ? editorVisible : null;

  const displayName = user?.displayName ||  'Unknown';
  const username = user?.username || user?.address || '' ;
  const address = user?.address || user?.walletAddress || '';
  const shortAddr = truncateAddress(address, 5, 5);
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);
  const coverUrl = getCoverUrl(user?.coverImageUrl);
  const badge = getBadgeName(user?.stakedDHB as number);
  const badgeImage = getBadgeUrl(user?.stakedDHB as number);
  const badgeIcon = 'trophy-outline';
  const truncatedHeaderName = useMemo(() => truncate(username, 8, '..'), [username]);

  const createdAtFormatted = useMemo(() => formatJoinedDate(user?.createdAt) || undefined, [user?.createdAt]);

  const socials: { key: string; url?: string; icon: string; label: string }[] = [
    { key: 'facebook', url: user?.facebookLink, icon: 'logo-facebook', label: 'Facebook' },
    { key: 'twitter', url: user?.twitterLink, icon: 'logo-twitter', label: 'Twitter' },
    { key: 'discord', url: user?.discordLink, icon: 'logo-discord', label: 'Discord' },
    { key: 'instagram', url: user?.instagramLink, icon: 'logo-instagram', label: 'Instagram' },
    { key: 'tiktok', url: user?.tiktokLink, icon: 'musical-notes-outline', label: 'TikTok' },
    { key: 'youtube', url: user?.youtubeLink, icon: 'logo-youtube', label: 'YouTube' },
    { key: 'telegram', url: user?.telegramLink, icon: 'paper-plane-outline', label: 'Telegram' },
  ].filter(s => !!s.url);

  const hasExtra = !!(createdAtFormatted || user?.aboutMe || user?.displayName || user?.username || socials.length);

  // openExternalLink reused from misc
  const handleShare = useCallback(async () => {
    const profileSlug = username || address;
    const url = `${env.APP_ORIGIN}/${profileSlug}`;
    const message = `Check out my dehub profile ${url}`;
    await shareProfile(url, message);
  }, [username, address]);

  const requestPickerPermission = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toastError('Permission to access photos is required.');
      return false;
    }
    return true;
  }, []);

  const pickImage = useCallback(async () => {
    const ok = await requestPickerPermission();
    if (!ok) return null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    });
    if (res.canceled || !res.assets?.length) return null;
    return res.assets[0]?.uri || null;
  }, [requestPickerPermission]);

  const openViewer = useCallback((uri?: string) => {
    if (!uri) return;
    (navigation as any).navigate(ScreenNames.ImageViewer, {
      images: [{ uri }],
      index: 0,
      isModal: true,
    });
  }, [navigation]);

  const startChangeAvatar = useCallback(async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      setEditorVisible({ uri, kind: 'avatar' });
    } catch (e) {
      toastError(e, 'Could not pick image');
    }
  }, [pickImage]);

  const startChangeCover = useCallback(async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      setEditorVisible({ uri, kind: 'cover' });
    } catch (e) {
      toastError(e, 'Could not pick image');
    }
  }, [pickImage]);

  const processAndUpload = useCallback(async (kind: 'avatar' | 'cover', uri: string) => {
    const isAvatar = kind === 'avatar';
    try {
      isAvatar ? setUploadingAvatar(true) : setUploadingCover(true);
      // Resize/compress
      const target = isAvatar ? { width: 512, height: 512 } : { width: 1500, height: 500 };
      const manip = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: target },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      const file = {
        uri: manip.uri,
        name: `${kind}_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any;
      const payload: Record<string, any> = isAvatar
        ? { avatar: file, avatarImage: file }
        : { cover: file, coverImage: file };
      await AuthService.updateProfile(payload);
      toastSuccess(isAvatar ? 'Avatar updated' : 'Cover updated');
      // Optimistic bump + background refresh
      if (isAvatar) {
        await patchUser?.({ avatarImageUrl: `${user?.avatarImageUrl || ''}` });
      } else {
        await patchUser?.({ coverImageUrl: `${user?.coverImageUrl || ''}` });
      }
      await refreshUser?.();
    } catch (e) {
      toastError(e, 'Upload failed');
    } finally {
      isAvatar ? setUploadingAvatar(false) : setUploadingCover(false);
    }
  }, [user]);

  const onEditComplete = useCallback(async (result: any) => {
    const current = editorVisible && typeof editorVisible === 'object' ? editorVisible : null;
    setEditorVisible(false);
    if (!current) return;
    try {
      const editedUri: string | undefined = result?.uri || result;
      await processAndUpload(current.kind, editedUri || current.uri);
    } catch (e) {
      toastError(e, 'Could not process image');
    }
  }, [editorVisible, processAndUpload]);

  return (
    <>
    <View className="w-full">
      <ImageBackground
        source={coverUrl === 'default-banner' ? bannerImage : { uri: coverUrl }}
        style={{ height: 120 }}
        className="w-full bg-cover bg-center"
        imageStyle={{ borderRadius: 4, opacity: uploadingCover ? 0.6 : 1 }}
        resizeMode="cover"
      >
        <View className="relative px-4 py-6 w-full h-full">
          <View className="absolute top-2 right-2 flex-row gap-2">
            <TouchableOpacity
              onPress={handleShare}
              accessibilityLabel="Share profile"
              className="bg-theme-neutrals-900/70 p-2 rounded-lg border border-theme-neutrals-700 active:opacity-80"
            >
              <Ionicons
                name="share-social"
                size={20}
                color={theme.colors.accentForeground}
              />
            </TouchableOpacity>
            {coverUrl !== 'default-banner' && (
              <TouchableOpacity
                onPress={startChangeCover}
                accessibilityLabel="Change cover"
                className="bg-theme-neutrals-900/70 p-2 rounded-lg border border-theme-neutrals-700 active:opacity-80"
              >
                <Ionicons name="camera" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          {coverUrl === 'default-banner' && (
            <View className="absolute inset-0 items-center justify-center">
              <TouchableOpacity
                onPress={startChangeCover}
                className="bg-black/50 rounded-full p-4"
                accessibilityLabel="Add cover image"
              >
                <Ionicons name="camera" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          {uploadingCover && (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
      </ImageBackground>
      <View className="flex-row items-end mt-[-36px] px-4">
        <View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={avatarUrl === 'default-avatar' ? startChangeAvatar : () => openViewer(avatarUrl)}
            className=""
          >
            <View className="">
              <Avatar
                uri={avatarUrl === 'default-avatar' ? undefined : avatarUrl}
                size={96}
                borderWidth={8}
                borderColor="#0a0a0a"
              />
              {(uploadingAvatar) && (
                <View className="absolute inset-0 bg-black/40 rounded-full items-center justify-center">
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          {avatarUrl !== 'default-avatar' && (
            <TouchableOpacity
              onPress={startChangeAvatar}
              className="absolute -bottom-1 -right-1 bg-black/80 p-2 rounded-full border border-theme-neutrals-700"
              accessibilityLabel="Change avatar"
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity className="ml-auto bg-gray-600 px-4 py-2 rounded-full">
          <Text className="text-white text-sm">Edit Profile</Text>
        </TouchableOpacity>
      </View>
      <View className="flex-row px-6 mt-2 gap-1 items-center">
        <TouchableOpacity
          onPress={() => copyToClipboard(username as string)}
          accessibilityLabel="Copy username"
          className="active:opacity-70"
        >
          <Text className="text-white text-3xl font-bold" numberOfLines={1}>{truncatedHeaderName}</Text>
        </TouchableOpacity>
        {badge && (
          <View className="flex-row items-center gap-1 bg-theme-neutrals-800 px-2 py-1 rounded-full">
            {badgeImage ? (
              <Image source={badgeImage} className="w-3 h-3" />
            ) : (
              <Ionicons name={badgeIcon as any} size={10} color="gold" />
            )}
          </View>
        )}
      {address ? (
        <View className="flex-row px-2 mt-1">
          <TouchableOpacity onPress={() => copyToClipboard(address)}>
            <View className="flex-row items-center">
              <Text className="text-gray-400 text-sm mr-2">{shortAddr}</Text>
              <Ionicons name="copy-outline" size={16} color="#9ca3af" />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>

      {hasExtra && (
        <View className="px-6 mt-2">
          <TouchableOpacity
            className="flex-row items-center "
            onPress={() => setExpanded(e => !e)}
            accessibilityLabel={expanded ? 'Hide details' : 'Show more profile details'}
          >
            <Text
              className="text-gray-400 font-medium mr-2 text-[12px]"
              style={{ textDecorationLine: 'underline' }}
            >
              {expanded ? 'Hide details' : 'See more'}
            </Text>
          </TouchableOpacity>
          {expanded && (
            <View className="mt-3 gap-3">
              {createdAtFormatted && (
                <View className="flex-row">
                  <Text className="text-gray-400 w-32 text-xs uppercase tracking-wide">Joined</Text>
                  <Text className="text-white text-sm">{createdAtFormatted}</Text>
                </View>
              )}
              {user?.displayName && (
                <View className="flex-row">
                  <Text className="text-gray-400 w-32 text-xs uppercase tracking-wide">Display Name</Text>
                  <Text className="text-white text-sm" numberOfLines={1}>{user.displayName}</Text>
                </View>
              )}
              {user?.username && (
                <View className="flex-row items-center">
                  <Text className="text-gray-400 w-32 text-xs uppercase tracking-wide">Username</Text>
                  <TouchableOpacity
                    onPress={() => copyToClipboard(user.username!)}
                    accessibilityLabel="Copy username"
                    className="flex-row items-center"
                  >
                    <Text className="text-white text-sm" numberOfLines={1}>@{user.username}</Text>
                    <Ionicons name="copy-outline" size={14} color={theme.colors.accentForeground} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                </View>
              )}
              {user?.aboutMe && (
                <View>
                  <Text className="text-gray-400 text-xs uppercase tracking-wide mb-1">About</Text>
                  <Text className="text-white text-sm leading-5">{user.aboutMe}</Text>
                </View>
              )}
              {socials.length > 0 && (
                <View>
                  <Text className="text-gray-400 text-xs uppercase tracking-wide mb-2">Socials</Text>
                  <View className="flex-row flex-wrap gap-3">
                    {socials.map(s => (
                      <TouchableOpacity
                        key={s.key}
                        className="flex-row items-center bg-theme-neutrals-800 px-3 py-2 rounded-full"
                        onPress={() => openExternalLink(s.url)}
                      >
                        <Ionicons name={s.icon as any} size={16} color={theme.colors.accentForeground} />
                        <Text className="ml-2 text-white text-xs font-medium">{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
    {cropState && (
      <ImageEditor
        visible
        imageUri={cropState!.uri}
        fixedCropAspectRatio={cropState!.kind === 'avatar' ? 1 : 3}
        lockAspectRatio
        onEditingComplete={onEditComplete}
        onCloseEditor={() => setEditorVisible(false)}
        mode="full"
        minimumCropDimensions={{ width: 120, height: 120 }}
      />
    )}
    </>
  );
};

export default ProfileHeader;
