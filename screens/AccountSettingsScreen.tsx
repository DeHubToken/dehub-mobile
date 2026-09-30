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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import MultiPostPanel from "../components/Settings/MultiPostPanel";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Alert,
  I18nManager,
  KeyboardAvoidingView,
} from "react-native";
import Constants from "expo-constants";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useCanGoBack } from "../hooks/useCanGoBack";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { ScreenNames } from "../navigation/ScreenNames";
import { toastSuccess, toastError } from "../libs";
import { requestAccountErasure } from "../services/accountErasure.service";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAppTheme } from "../context/ThemeContext";
import { themePageIcon } from "../theme/pageIcons";
import LiquidGlass from "../components/ui/LiquidGlass";
import FullScreenLoader from "../components/FullScreenLoader";
import ReportBugModal from "../components/Settings/ReportBugModal";
import ReviewModal from "../components/ReviewModal";
import Icon, { type IconName } from "../components/ui/Icon";
import { openInApp } from "../libs/links.utils";
import {
  TERMS_OF_SERVICE_LINK,
  PRIVACY_POLICY_LINK,
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
import EnsHandleSection from "../components/Settings/EnsHandleSection";
import EmailSignInSection from "../components/Settings/EmailSignInSection";
import StreamKeySection from "../components/Settings/StreamKeySection";
import GettingStartedRow from "../components/Settings/GettingStartedRow";
import {
  SettingsSection,
  SettingsLinkRow,
  SettingsInfoRow,
  Divider,
} from "../components/Settings/SettingsPrimitives";
import SettingsSearchBar from "../components/Settings/SettingsSearchBar";
import {
  SettingsAnchor,
  SettingsPanelContext,
  SettingsScrollView,
  useSettingsBentoStyle,
} from "../components/Settings/SettingsAnchor";
import {
  revealSetting,
  resetSettingsReveal,
  type SettingsSearchHit,
} from "../libs/settings-search";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

/** Web's small header control: `h-10 rounded-xl bg-white/5 border border-white/10`. */
const HEADER_CONTROL = "h-10 w-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center flex-row";

/** Same tabs, same order, same icons as web's `tabs` array. */
type TabKey =
  | "profile"
  | "appearance"
  | "notifications"
  | "privacy"
  | "content"
  | "messages"
  | "assets"
  | "multipost"
  | "support";

const AccountSettingsScreen: React.FC<any> = ({ navigation, route }) => {
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { signOut } = useAuthActions();
  const [activeTab, setActiveTab] = useState<TabKey>((route?.params?.initialTab as TabKey) ?? "profile");
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [freeDmModalVisible, setFreeDmModalVisible] = useState(false);
  const [freeAccessList, setFreeAccessList] = useState<string[]>([]);
  const [freeAccessLoading, setFreeAccessLoading] = useState(false);
  const [revokingAddress, setRevokingAddress] = useState<string | null>(null);
  const { t } = useTranslation();
  const { theme, skin } = useAppTheme();
  const bento = useSettingsBentoStyle();
  // Opened from the menu, a render-time canGoBack() is still false; this
  // follows the stack once the push is saved.
  const canPop = useCanGoBack();
  // The header bento sits above the panel in the same parent, so
  // the panel's own position already counts them. The offset is only where
  // that parent starts on screen.
  const keyboardOffset = useKeyboardOffset();
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
      { key: "multipost", icon: "Share2", label: t("multiPost.tab") },
      { key: "support", icon: "LifeBuoy", label: t("settings.support") },
    ],
    [t]
  );

  // A search hit lands on the setting, not just its tab: switch tab, then
  // scroll its section into view and flash it. revealSetting waits for the
  // section to lay out, so it copes with the panel mounting after this call.
  const handleSearchSelect = useCallback((hit: SettingsSearchHit) => {
    setActiveTab(hit.tab as TabKey);
    revealSetting(hit.anchor);
  }, []);

  useEffect(() => () => resetSettingsReveal(), []);

  const handleDeleteAccount = () => {
    if (deletingAccount) return;
    Alert.alert(t("accountDeletion.title"), t("accountDeletion.warning"), [
      { text: t("accountDeletion.cancel"), style: "cancel" },
      { text: t("accountDeletion.confirm"), style: "destructive", onPress: async () => {
        setDeletingAccount(true);
        try {
          await requestAccountErasure();
          Alert.alert(t("accountDeletion.accepted"), t("accountDeletion.receipt"), [
            { text: t("accountDeletion.done"), onPress: () => { void signOut(); } },
          ], { cancelable: false });
        } catch {
          toastError(t("accountDeletion.error"));
          setDeletingAccount(false);
        }
      } },
    ]);
  };

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

  const activeTabMeta = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  const panelContext = useMemo(
    () => ({ title: activeTabMeta.label, icon: activeTabMeta.icon }),
    [activeTabMeta],
  );

  /**
   * Page bento, as web's sticky settings header: themed icon, title and
   * subtitle with log out on the right, then search, then the icon tab row.
   * Web has no back button here (its drawer lives in the top bar); a pushed
   * screen needs one, so it leads the row in the same control material.
   */
  const headerBento = (
    <View className="px-2 pt-1">
      <View style={[bento, { padding: 16 }]}>
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center flex-1 mr-3" style={{ gap: 12 }}>
            {canPop ? (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t("common.goBack")}
                className={HEADER_CONTROL}
              >
                <Ionicons
                  name="arrow-back"
                  size={18}
                  color="#F4F4F5"
                  style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              </TouchableOpacity>
            ) : null}
            <Image
              source={themePageIcon(theme, 'settings')}
              style={{ width: 40, height: 40 }}
              contentFit="contain"
            />
            <View className="flex-1">
              <Text numberOfLines={1} className="text-white text-xl font-bold">
                {t("settings.title")}
              </Text>
              <Text numberOfLines={1} className="text-theme-neutrals-500 text-sm">
                {t("settings.manageAccount")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t("settings.logOut")}
            className={`${HEADER_CONTROL} ${signingOut ? "opacity-60" : ""}`}
          >
            {signingOut ? (
              <ActivityIndicator size="small" color="#F4F4F5" />
            ) : (
              <Icon name="LogOut" size={16} color="#F4F4F5" />
            )}
          </TouchableOpacity>
        </View>
        <SettingsSearchBar onSelect={handleSearchSelect} />
        {/* Bleeds through the bento's padding so the icons that overflow
            scroll out under the bento edge rather than being cut 16px in. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const inner = (
              <View style={{ padding: 11 }}>
                <Icon
                  name={tab.icon}
                  size={18}
                  color={active ? skin?.tabIconActive ?? "#fff" : skin?.tabIcon ?? "#8B8D90"}
                />
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
    <SettingsScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      {isSignedIn ? (
        <SettingsAnchor id="profiles">
          <ProfilesSection />
        </SettingsAnchor>
      ) : null}
      <SettingsSection
        label={t("settings.profileSettings")}
        icon="User"
        className="mt-4"
        anchor="profile-settings"
      >
        <View className="px-4 py-2 flex-row items-center">
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
            <Text className="text-white text-base leading-5 font-medium">
              {user?.displayName || user?.username || "Anonymous"}
            </Text>
            <Text className="text-theme-neutrals-500 text-sm leading-5 mt-0.5">
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
        <Divider />
        <GettingStartedRow />
      </SettingsSection>

      {/* Between the profile rows and ENS, where web puts it: an email a
          wallet account can log in with instead of a signature. */}
      {isSignedIn ? (
        <SettingsAnchor id="sign-in">
          <EmailSignInSection />
        </SettingsAnchor>
      ) : null}

      {/* Under the profile rows, not the wallet ones: a .eth name is an alias
          on the profile, and every wallet it involves belongs to somebody
          proving ownership rather than to this account. */}
      {isSignedIn ? (
        <SettingsAnchor id="ens">
          <EnsHandleSection />
        </SettingsAnchor>
      ) : null}

      {/* Permanent encoder credentials — set OBS, a capture app or a console
          up once and never re-key it again. Under the profile rows because it
          is an account-level credential, not a per-broadcast one. */}
      {isSignedIn ? <StreamKeySection /> : null}

      <SettingsSection label={t("settings.yourContent")} icon="Film" anchor="your-content">
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
    </SettingsScrollView>
  );

  const supportPanel = (
    <SettingsScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsSection
        label={t("settings.support")}
        icon="LifeBuoy"
        className="mt-4"
        anchor="support"
      >
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
          label={t("accountDeletion.title")}
          description={t(deletingAccount ? "accountDeletion.busy" : "accountDeletion.description")}
          onPress={handleDeleteAccount}
        />
      </SettingsSection>

      <SettingsSection label={t("settings.about")} icon="Info" anchor="about">
        <SettingsInfoRow
          icon="Smartphone"
          label={t("settings.appVersion")}
          right={<Text className="text-theme-neutrals-400 text-xs">v{APP_VERSION}</Text>}
        />
      </SettingsSection>
    </SettingsScrollView>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {signingOut && <FullScreenLoader message={t("settings.signingOut")} />}
      {headerBento}

      <SettingsPanelContext.Provider value={panelContext}>
      {/* Edge-to-edge Android does not resize the window for the keyboard, so
          without this the email, ENS, stream key, delegation and DM fee fields
          open under it. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={keyboardOffset}
      >
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
        {activeTab === "multipost" && <MultiPostPanel />}
        {activeTab === "support" && supportPanel}
      </KeyboardAvoidingView>
      </SettingsPanelContext.Provider>

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
                    <View className="w-9 h-9 rounded-md bg-theme-neutrals-700 items-center justify-center">
                      <Icon name="User" size={16} color="#9ca3af" />
                    </View>
                    <Text className="flex-1 text-white text-sm font-mono">
                      {truncateAddress(address, 8, 6)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRevokeAccess(address)}
                      disabled={busy}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg"
                      activeOpacity={0.7}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#F4F4F5" />
                      ) : (
                        <Text className="text-white/80 text-xs font-semibold">
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
