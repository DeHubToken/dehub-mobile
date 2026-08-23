/**
 * Settings — restructured to mirror web's settings system
 * (dehubweb src/pages/app/SettingsPage.tsx).
 *
 * Web's shape, reproduced here:
 *   • a page bento holding the title, the account actions (chain + log out)
 *     and an icon-only tab row with a glass indicator on the active tab;
 *   • one panel per tab, each built from the shared row primitives in
 *     components/Settings/SettingsPrimitives.tsx.
 *
 * Tab parity with web, in web's order:
 *   profile · appearance · notifications · privacy · content · messages ·
 *   assets · support
 * Web additionally has `skills` and `characters`; neither library exists in
 * this app, so those tabs are not rendered rather than rendered empty.
 */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import Constants from "expo-constants";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { ScreenNames } from "../navigation/ScreenNames";
import { toastSuccess, toastError } from "../libs";
import ScreenHeader from "../components/ScreenHeader";
import LiquidGlass from "../components/ui/LiquidGlass";
import FullScreenLoader from "../components/FullScreenLoader";
import ReportBugModal from "../components/Settings/ReportBugModal";
import ReviewModal from "../components/ReviewModal";
import Icon, { type IconName } from "../components/ui/Icon";
import { openInApp } from "../libs/links.utils";
import {
  TERMS_OF_SERVICE_LINK,
  PRIVACY_POLICY_LINK,
  DELETE_DATA_OR_ACCOUNT_LINK,
} from "../config/links";
import GlassModal from "../components/ui/GlassModal";
import { getFreeAccessList, removeFreeAccess } from "../services/dm/dm.api";
import { truncateAddress } from "../libs/strings.util";
import Avatar from "../components/common/Avatar";
import { getAvatarUrl } from "../libs/misc";
import NotificationSettingsScreen from "./NotificationSettingsScreen";
import PrivacySettingsScreen from "./PrivacySettingsScreen";
import AppearancePanel from "../components/Settings/AppearancePanel";
import ContentPanel from "../components/Settings/ContentPanel";
import AssetsPanel from "../components/Settings/AssetsPanel";
import MessagesPanel from "../components/Settings/MessagesPanel";
import ProfilesSection from "../components/Settings/ProfilesSection";
import {
  SettingsSection,
  SettingsLinkRow,
  SettingsInfoRow,
  Divider,
} from "../components/Settings/SettingsPrimitives";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

/** Same tabs, same order, same icons as web's `tabs` array. */
type TabKey =
  | "profile"
  | "appearance"
  | "notifications"
  | "privacy"
  | "content"
  | "messages"
  | "assets"
  | "support";

const AccountSettingsScreen: React.FC<any> = ({ navigation }) => {
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { signOut } = useAuthActions();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [signingOut, setSigningOut] = useState(false);
  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [freeDmModalVisible, setFreeDmModalVisible] = useState(false);
  const [freeAccessList, setFreeAccessList] = useState<string[]>([]);
  const [freeAccessLoading, setFreeAccessLoading] = useState(false);
  const [revokingAddress, setRevokingAddress] = useState<string | null>(null);
  const { t } = useTranslation();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const TABS: { key: TabKey; icon: IconName; label: string }[] = useMemo(
    () => [
      { key: "profile", icon: "User", label: t("settings.profile") },
      { key: "appearance", icon: "Palette", label: t("settings.appearance") },
      { key: "notifications", icon: "Bell", label: t("settings.notifications") },
      { key: "privacy", icon: "Shield", label: t("settings.privacy") },
      { key: "content", icon: "Eye", label: t("settings.content") },
      { key: "messages", icon: "MessageSquare", label: t("settings.messages") },
      { key: "assets", icon: "Wallet", label: t("settings.assets") },
      { key: "support", icon: "LifeBuoy", label: t("settings.support") },
    ],
    [t]
  );

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      toastSuccess(t("settings.loggedOut"));
    } catch (e) {
      console.error("[AccountSettings] signOut error", e);
      toastError(e, t("settings.signOutFailed"));
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, signOut, t]);

  const loadFreeAccessList = useCallback(async () => {
    const address = (user as any)?.address || (user as any)?.walletAddress;
    if (!address) return;
    setFreeAccessLoading(true);
    try {
      const list = await getFreeAccessList(address);
      setFreeAccessList(Array.isArray(list) ? list : []);
    } catch {
      setFreeAccessList([]);
    } finally {
      setFreeAccessLoading(false);
    }
  }, [user]);

  const handleOpenFreeAccessList = useCallback(() => {
    setFreeDmModalVisible(true);
    loadFreeAccessList();
  }, [loadFreeAccessList]);

  const handleRevokeAccess = useCallback(
    async (address: string) => {
      setRevokingAddress(address);
      try {
        await removeFreeAccess(address);
        setFreeAccessList((prev) => prev.filter((a) => a !== address));
        toastSuccess(t("screens.freeAccessRevoked"));
      } catch (e) {
        toastError(e, t("screens.failedToRevoke"));
      } finally {
        setRevokingAddress(null);
      }
    },
    [t]
  );

  /** Page bento: tab row, matching web's sticky settings header. */
  const headerBento = (
    <View className="px-4 pt-3">
      <View className="bg-theme-neutrals-800 rounded-2xl p-4 border border-theme-neutrals-700">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingRight: 4 }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const inner = (
              <View className="p-3.5">
                <Icon name={tab.icon} size={18} color={active ? "#fff" : "#8B8D90"} />
              </View>
            );
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
                accessibilityLabel={tab.label}
              >
                {active ? (
                  <LiquidGlass className="rounded-xl" intensity={40}>
                    {inner}
                  </LiquidGlass>
                ) : (
                  <View className="rounded-xl">{inner}</View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const profilePanel = (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      {isSignedIn ? <ProfilesSection /> : null}
      <SettingsSection label={t("settings.profileSettings")} icon="User" className="mt-4">
        <View className="px-4 py-3.5 flex-row items-center">
          <Avatar
            uri={(() => {
              const raw = (user as any)?.avatarImageUrl;
              const url = raw ? getAvatarUrl(raw) : undefined;
              return url === "default-avatar" ? undefined : url;
            })()}
            size={40}
            name={user?.displayName || user?.username}
          />
          <View className="flex-1 ml-3">
            <Text className="text-white text-sm font-medium">
              {user?.displayName || user?.username || "Anonymous"}
            </Text>
            <Text className="text-theme-neutrals-500 text-xs mt-0.5">
              @{user?.username || "—"}
            </Text>
          </View>
        </View>
        <Divider />
        <SettingsLinkRow
          icon="Pencil"
          label={t("settings.editProfile")}
          description={t("settings.editProfileDesc")}
          onPress={() => navigation.navigate(ScreenNames.EditProfile)}
        />
        <Divider />
        <SettingsLinkRow
          icon="Link2"
          label={t("settings.socialLinks")}
          description={t("settings.socialLinksDesc")}
          onPress={() => navigation.navigate(ScreenNames.EditProfile)}
        />
      </SettingsSection>

      <SettingsSection label={t("settings.yourContent")} icon="Film">
        <SettingsLinkRow
          icon="Video"
          label={t("settings.yourVideos")}
          onPress={() => navigation.navigate(ScreenNames.YourVideos)}
        />
        <Divider />
        <SettingsLinkRow
          icon="Bookmark"
          label={t("settings.savedPosts")}
          onPress={() => navigation.navigate(ScreenNames.SavedPosts)}
        />
        <Divider />
        <SettingsLinkRow
          icon="FileText"
          label={t("settings.drafts")}
          onPress={() => navigation.navigate(ScreenNames.Drafts)}
        />
      </SettingsSection>

      <Text className="text-center text-theme-neutrals-500 text-xs mt-6">
        DeHub v{APP_VERSION}
      </Text>
    </ScrollView>
  );

  const supportPanel = (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsSection label={t("settings.support")} icon="LifeBuoy" className="mt-4">
        {/* Native-only: no web equivalent, so web deliberately omits it. */}
        <SettingsLinkRow
          icon="Star"
          label={t("settings.rateReview")}
          description={t("settings.rateReviewDesc")}
          onPress={() => setReviewModalVisible(true)}
        />
        <Divider />
        <SettingsLinkRow
          icon="Bug"
          label={t("settings.reportBug")}
          description={t("settings.reportBugDesc")}
          onPress={() => setBugModalVisible(true)}
        />
        <Divider />
        <SettingsLinkRow
          icon="FileText"
          label={t("settings.termsOfService")}
          external
          onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
        />
        <Divider />
        <SettingsLinkRow
          icon="Shield"
          label={t("settings.privacyPolicy")}
          external
          onPress={() => openInApp(PRIVACY_POLICY_LINK)}
        />
        <Divider />
        <SettingsLinkRow
          icon="Trash2"
          destructive
          label={t("settings.deleteAccountData")}
          description={t("settings.deleteAccountDataDesc")}
          external
          onPress={() => openInApp(DELETE_DATA_OR_ACCOUNT_LINK)}
        />
      </SettingsSection>

      <SettingsSection label={t("settings.about")} icon="Info">
        <SettingsInfoRow
          icon="Smartphone"
          label={t("settings.appVersion")}
          right={<Text className="text-theme-neutrals-400 text-xs">v{APP_VERSION}</Text>}
        />
      </SettingsSection>
    </ScrollView>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {signingOut && <FullScreenLoader message={t("settings.signingOut")} />}
      <ScreenHeader
        title={t("settings.title")}
        canGoBack
        rightContent={
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="flex-row items-center px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
            style={{ gap: 6 }}
          >
            {signingOut ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <>
                <Icon name="LogOut" size={15} color="#ef4444" />
                <Text className="text-red-400 text-xs font-semibold">
                  {t("settings.logOut")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      {headerBento}

      <View className="flex-1">
        {activeTab === "profile" && profilePanel}
        {activeTab === "appearance" && <AppearancePanel />}
        {activeTab === "notifications" && (
          <NotificationSettingsScreen embedded navigation={navigation} />
        )}
        {activeTab === "privacy" && (
          <PrivacySettingsScreen embedded navigation={navigation} />
        )}
        {activeTab === "content" && (
          <ContentPanel
            onOpenPrivacy={() => setActiveTab("privacy")}
            defaultPostVisibility={
              ((user as any)?.customs?.defaultPostVisibility ??
                (user as any)?.defaultPostVisibility ??
                "public") as string
            }
          />
        )}
        {activeTab === "messages" && (
          <MessagesPanel onOpenFreeAccessList={handleOpenFreeAccessList} />
        )}
        {activeTab === "assets" && <AssetsPanel navigation={navigation} />}
        {activeTab === "support" && supportPanel}
      </View>

      <ReportBugModal
        visible={bugModalVisible}
        onClose={() => setBugModalVisible(false)}
        username={(user?.username || user?.email || "Anonymous") as string}
      />
      <ReviewModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
        userAddress={user?.walletAddress || user?.address}
      />

      <GlassModal
        visible={freeDmModalVisible}
        onClose={() => setFreeDmModalVisible(false)}
        presentation="bottom"
        maxHeight="70%"
        blurIntensity={30}
      >
        <View className="flex-1">
          <View className="px-5 pt-4 pb-3 flex-row items-center justify-between border-b border-white/10">
            <Text className="text-white font-bold text-base">
              {t("screens.freeDmAccessList")}
            </Text>
            {freeAccessLoading && <ActivityIndicator size="small" color="#F4F4F5" />}
          </View>
          <Text className="text-theme-neutrals-500 text-xs px-5 pt-3 pb-1">
            {t("screens.freeDmAccessModalDesc")}
          </Text>
          {!freeAccessLoading && freeAccessList.length === 0 ? (
            <View className="flex-1 items-center justify-center py-12">
              <Icon name="Gift" size={36} color="#4b5563" />
              <Text className="text-theme-neutrals-500 text-sm mt-3">
                {t("screens.noFreeAccessUsers")}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-1 text-center px-8">
                {t("screens.freeDmGrantHint")}
              </Text>
            </View>
          ) : (
            <FlatList
              data={freeAccessList}
              keyExtractor={(item) => item}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              renderItem={({ item: address }) => {
                const busy = revokingAddress === address;
                return (
                  <View className="flex-row items-center bg-theme-neutrals-800/60 rounded-xl px-3 py-3 gap-3">
                    <View className="w-9 h-9 rounded-full bg-theme-neutrals-700 items-center justify-center">
                      <Icon name="User" size={16} color="#9ca3af" />
                    </View>
                    <Text className="flex-1 text-white text-sm font-mono">
                      {truncateAddress(address, 8, 6)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRevokeAccess(address)}
                      disabled={busy}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-lg"
                      activeOpacity={0.7}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#ef4444" />
                      ) : (
                        <Text className="text-red-400 text-xs font-semibold">
                          {t("screens.revoke")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </View>
      </GlassModal>
    </View>
  );
};

export default AccountSettingsScreen;
