import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  FlatList,
  Alert,
} from "react-native";
import Constants from "expo-constants";
import { useUser, useAuthState, useAuthActions, useProvider } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { ScreenNames } from "../navigation/ScreenNames";
import { toastSuccess, toastError } from "../libs";
import ScreenHeader from "../components/ScreenHeader";
import LiquidGlass from "../components/ui/LiquidGlass";
import FullScreenLoader from "../components/FullScreenLoader";
import ReportBugModal from "../components/Settings/ReportBugModal";
import ExportPrivateKeyModal from "../components/Settings/ExportPrivateKeyModal";
import SwitchAccountModal from "../components/Settings/SwitchAccountModal";
import { forgetLocalWalletForIdentity } from "../libs/identity-wallet";
import { getSupabaseUserId } from "../services/auth/supabaseAuth.service";
import ReviewModal from "../components/ReviewModal";
import Icon, { type IconName } from "../components/ui/Icon";
import { openInApp } from "../libs/links.utils";
import {
  TERMS_OF_SERVICE_LINK,
  PRIVACY_POLICY_LINK,
  DELETE_DATA_OR_ACCOUNT_LINK,
} from "../config/links";
import DMSettingsSection from "../components/Settings/DMSettingsSection";
import CustomSwitch from "../components/ui/CustomSwitch";
import { useDataSaver, setDataSaverPref } from "../hooks/useDataSaver";
import GlassModal from "../components/ui/GlassModal";
import { getFreeAccessList, removeFreeAccess } from "../services/dm/dm.api";
import { truncateAddress } from "../libs/strings.util";
import { ChainId } from "../config/constants";
import { isChainAASupported } from "../libs/wallet-core/smart-account";
import ChainSwitchModal from "../components/Settings/ChainSwitchModal";
import BlockedAccountsModal from "../components/Settings/BlockedAccountsModal";
import LanguageSelectModal from "../components/Settings/LanguageSelectModal";
import i18nInstance, { SUPPORTED_LANGUAGES } from "../i18n";
import NotificationSettingsScreen from "./NotificationSettingsScreen";
import PrivacySettingsScreen from "./PrivacySettingsScreen";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

const CHAIN_ICONS: Record<number, any> = {
  [ChainId.BASE_MAINNET]: require("../assets/chains/base-icon.png"),
  [ChainId.BSC_MAINNET]: require("../assets/chains/bnb-icon.png"),
};

type SettingsRowProps = {
  icon: IconName;
  iconColor?: string;
  iconBg?: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  rightElement?: React.ReactNode;
  destructive?: boolean;
};

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  iconColor = "#9ca3af",
  iconBg = "bg-theme-neutrals-700/50",
  label,
  subtitle,
  onPress,
  disabled,
  rightElement,
  destructive,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || !onPress}
    activeOpacity={0.7}
    className={`px-4 py-3.5 flex-row items-center ${disabled ? "opacity-50" : ""}`}
  >
    <View className={`w-9 h-9 rounded-xl ${iconBg} items-center justify-center mr-3`}>
      <Icon name={icon} size={18} color={destructive ? "#ef4444" : iconColor} />
    </View>
    <View className="flex-1 mr-2">
      <Text className={`text-sm font-medium ${destructive ? "text-red-400" : "text-white"}`}>
        {label}
      </Text>
      {subtitle ? (
        <Text className="text-theme-neutrals-500 text-xs mt-0.5">{subtitle}</Text>
      ) : null}
    </View>
    {rightElement || (
      onPress ? <Icon name="ChevronRight" size={18} color={destructive ? "#ef4444" : "#6b7280"} /> : null
    )}
  </TouchableOpacity>
);

const Divider = () => <View className="h-px bg-theme-neutrals-700 ml-16" />;

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
    {label}
  </Text>
);

const SectionCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700">
    {children}
  </View>
);

type TabKey = "account" | "notifications" | "privacy" | "messages" | "support";

const AccountSettingsScreen: React.FC<any> = ({ navigation }) => {
  const user = useUser();
  const { pref: dataSaverPref } = useDataSaver();
  const { isSignedIn, needsUsername } = useAuthState();
  const { signOut } = useAuthActions();
  const { chainId, authMethod } = useProvider();
  const [activeTab, setActiveTab] = useState<TabKey>("account");
  const [signingOut, setSigningOut] = useState(false);
  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [exportPkVisible, setExportPkVisible] = useState(false);
  const [switchAccountVisible, setSwitchAccountVisible] = useState(false);
  const [chainModalVisible, setChainModalVisible] = useState(false);
  const [blockedModalVisible, setBlockedModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18nInstance.language);
  const [freeDmModalVisible, setFreeDmModalVisible] = useState(false);
  const [freeAccessList, setFreeAccessList] = useState<string[]>([]);
  const [freeAccessLoading, setFreeAccessLoading] = useState(false);
  const [revokingAddress, setRevokingAddress] = useState<string | null>(null);
  const [resettingLink, setResettingLink] = useState(false);
  const { t } = useTranslation();
  const isImported = authMethod === "local";
  // Gas is sponsored for any local wallet on a chain with Safe/Pimlico support (Base, BNB) --
  // "local" alone (used for the "· Imported" label above) no longer implies self-paid gas.
  const gasSponsored = authMethod === "local" && isChainAASupported(chainId ?? ChainId.BASE_MAINNET);
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      toastSuccess(t('settings.loggedOut'));
    } catch (e) {
      console.error("[AccountSettings] signOut error", e);
      toastError(e, t("settings.signOutFailed"));
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, signOut]);

  /**
   * Fixes the case where THIS PHONE resolves Google/email sign-in to the
   * wrong account: resolveEvmWalletForIdentity checks this device's local
   * identity->address cache BEFORE ever asking Supabase, so a wallet that
   * was created/tested on this phone before it was linked to Supabase
   * permanently shadows the real, Supabase-linked account (which the
   * website always resolves correctly, since it has no such local
   * shortcut). Clearing the cache and signing out makes the next Google/
   * email sign-in fall through to Supabase's record — same one the website
   * uses — instead of trusting this device's stale memory.
   */
  const handleResetDeviceLink = useCallback(async () => {
    if (resettingLink) return;
    const supabaseUserId = await getSupabaseUserId();
    if (!supabaseUserId) {
      toastError(null, "You're not signed in with Google or email on this device.");
      return;
    }
    Alert.alert(
      "Reset device account link?",
      "This phone will forget which wallet it auto-selects for your Google/email sign-in. You'll be signed out, and next time you sign in you'll be asked to unlock the correct wallet with its password (the same one the website uses).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset & sign out",
          style: "destructive",
          onPress: async () => {
            setResettingLink(true);
            try {
              await forgetLocalWalletForIdentity(supabaseUserId);
              await signOut();
              toastSuccess("Device link reset. Sign in again to pick up the right account.");
            } catch (e) {
              console.error("[AccountSettings] resetDeviceLink error", e);
              toastError(e, "Could not reset the device link.");
            } finally {
              setResettingLink(false);
            }
          },
        },
      ]
    );
  }, [resettingLink, signOut]);

  const blockedCount = (user?.blocklist?.blocked?.length || 0) as number;

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

  const handleRevokeAccess = useCallback(async (address: string) => {
    setRevokingAddress(address);
    try {
      await removeFreeAccess(address);
      setFreeAccessList(prev => prev.filter(a => a !== address));
      toastSuccess(t('screens.freeAccessRevoked'));
    } catch (e) {
      toastError(e, t('screens.failedToRevoke'));
    } finally {
      setRevokingAddress(null);
    }
  }, [t]);

  const TABS: { key: TabKey; icon: IconName; label: string }[] = [
    { key: "account", icon: "User", label: t("settings.account") },
    { key: "notifications", icon: "Bell", label: t("settings.notifications") },
    { key: "privacy", icon: "ShieldCheck", label: t("settings.privacySecurity") },
    { key: "messages", icon: "MessageSquare", label: t("settings.messages", "Messages") },
    { key: "support", icon: "LifeBuoy", label: t("settings.support") },
  ];

  const tabBar = (
    <View className="px-4 pt-3 pb-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const inner = (
            <View className="flex-row items-center px-4 py-2.5" style={{ gap: 6 }}>
              <Icon name={tab.icon} size={16} color={active ? "#fff" : "#9ca3af"} />
              <Text
                className={`text-[13px] font-medium ${active ? "text-white" : "text-theme-neutrals-500"}`}
              >
                {tab.label}
              </Text>
            </View>
          );
          return (
            <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}>
              {active ? (
                <LiquidGlass className="rounded-xl" intensity={40}>
                  {inner}
                </LiquidGlass>
              ) : (
                <View className="rounded-xl border border-theme-neutrals-700/60 bg-theme-neutrals-800/40">
                  {inner}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const accountPanel = (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
    >
      <View className="mb-6">
        <SectionLabel label={t("settings.account")} />
        <SectionCard>
          <View className="px-4 py-3.5 flex-row items-center">
            <View className="w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center mr-3">
              <Icon name="User" size={18} color="#9ca3af" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-sm font-medium">
                {user?.displayName || user?.username || "Anonymous"}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                @{user?.username || "—"}{isImported ? " · Imported" : ""}
              </Text>
            </View>
          </View>
          <Divider />
          <TouchableOpacity
            onPress={() => setChainModalVisible(true)}
            activeOpacity={0.7}
            className="px-4 py-3.5 flex-row items-center"
          >
            <View className="w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center mr-3">
              {chainId && CHAIN_ICONS[chainId] ? (
                <Image source={CHAIN_ICONS[chainId]} className="w-5 h-5 rounded-full" />
              ) : (
                <Icon name="Link" size={18} color="#9ca3af" />
              )}
            </View>
            <View className="flex-1 mr-2">
              <Text className="text-white text-sm font-medium">{t("settings.activeChain")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {chainId === ChainId.BASE_MAINNET ? "Base" : chainId === ChainId.BSC_MAINNET ? "BNB" : `Chain ${chainId ?? "N/A"}`}
              </Text>
            </View>
            <Icon name="ChevronRight" size={18} color="#6b7280" />
          </TouchableOpacity>
          <Divider />
          <SettingsRow
            icon="Fuel"
            label={t("settings.gasSponsorship")}
            subtitle={gasSponsored ? t("settings.gasSponsoredDesc") : t("settings.gasImportedDesc")}
            rightElement={
              <View className={`px-2.5 py-1 rounded-full ${gasSponsored ? "bg-emerald-500/20" : "bg-theme-neutrals-700/40"}`}>
                <Text className={`text-[10px] font-semibold ${gasSponsored ? "text-emerald-400" : "text-theme-neutrals-400"}`}>
                  {gasSponsored ? t("settings.gasActive") : t("settings.gasOff")}
                </Text>
              </View>
            }
          />
          <Divider />
          <SettingsRow
            icon="KeyRound"
            label={t("settings.exportPrivateKey")}
            subtitle={t("settings.exportPrivateKeyDesc")}
            onPress={() => setExportPkVisible(true)}
          />
          {isImported && (
            <>
              <Divider />
              <SettingsRow
                icon="RefreshCw"
                label="Reset device account link"
                subtitle="Seeing a different account here than on the website? Fix it (no private key needed)"
                disabled={resettingLink}
                onPress={handleResetDeviceLink}
              />
              <Divider />
              <SettingsRow
                icon="Repeat"
                label="Switch account"
                subtitle="Have a private key for the account you want instead? Switch to it directly"
                onPress={() => setSwitchAccountVisible(true)}
              />
            </>
          )}
        </SectionCard>
      </View>

      <View className="mb-6">
        <SectionLabel label={t("settings.preferences")} />
        <SectionCard>
          <SettingsRow
            icon="Globe"
            label={t("settings.language")}
            subtitle={SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.name || "English"}
            onPress={() => {
              setCurrentLang(i18nInstance.language);
              setLanguageModalVisible(true);
            }}
            rightElement={
              <View className="flex-row items-center">
                <Text className="text-theme-neutrals-500 text-xs mr-1.5">
                  {currentLang.toUpperCase()}
                </Text>
                <Icon name="ChevronRight" size={18} color="#6b7280" />
              </View>
            }
          />
          <Divider />
          <SettingsRow
            icon="WifiOff"
            iconColor="#9ca3af"
            label={t("settings.dataSaver")}
            subtitle={t("settings.dataSaverDesc")}
            rightElement={
              <CustomSwitch
                value={dataSaverPref === "on"}
                onValueChange={(v) => setDataSaverPref(v ? "on" : "auto")}
              />
            }
          />
        </SectionCard>
      </View>

      <View className="mb-6">
        <SectionLabel label={t("settings.privacySecurity")} />
        <SectionCard>
          <SettingsRow
            icon="Smartphone"
            label={t("settings.activeSessions")}
            subtitle={t("settings.activeSessionsDesc")}
            onPress={() => navigation.navigate(ScreenNames.ActiveSessions)}
          />
          <Divider />
          <SettingsRow
            icon="Ban"
            label={t("settings.blockedAccounts")}
            subtitle={blockedCount > 0 ? `${blockedCount} blocked` : t('settings.noneBlocked')}
            onPress={() => setBlockedModalVisible(true)}
          />
          <Divider />
          <SettingsRow
            icon="Trash2"
            label={t("settings.deleteAccountData")}
            subtitle={t("settings.deleteAccountDataDesc")}
            onPress={() => openInApp(DELETE_DATA_OR_ACCOUNT_LINK)}
          />
        </SectionCard>
      </View>

      <Text className="text-center text-theme-neutrals-600 text-xs mb-2">
        DeHub v{APP_VERSION}
      </Text>
    </ScrollView>
  );

  const messagesPanel = (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
    >
      <DMSettingsSection />
      <View className="mt-2">
        <SectionCard>
          <SettingsRow
            icon="Gift"
            label={t("screens.freeDmAccessList")}
            subtitle={t("screens.freeDmAccessSubtitle")}
            onPress={handleOpenFreeAccessList}
          />
        </SectionCard>
      </View>
    </ScrollView>
  );

  const supportPanel = (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
    >
      <View className="mb-6">
        <SectionLabel label={t("settings.support")} />
        <SectionCard>
          <SettingsRow
            icon="Star"
            label={t("settings.rateReview")}
            subtitle={t("settings.rateReviewDesc")}
            onPress={() => setReviewModalVisible(true)}
          />
          <Divider />
          <SettingsRow
            icon="Bug"
            label={t("settings.reportBug")}
            onPress={() => setBugModalVisible(true)}
          />
          <Divider />
          <SettingsRow
            icon="FileText"
            iconColor="#9ca3af"
            label={t("settings.termsOfService")}
            onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
          />
          <Divider />
          <SettingsRow
            icon="Shield"
            iconColor="#9ca3af"
            label={t("settings.privacyPolicy")}
            onPress={() => openInApp(PRIVACY_POLICY_LINK)}
          />
        </SectionCard>
      </View>

      <Text className="text-center text-theme-neutrals-600 text-xs mb-2">
        DeHub v{APP_VERSION}
      </Text>
    </ScrollView>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {signingOut && <FullScreenLoader message={t('settings.signingOut')} />}
      <ScreenHeader
        title={t("settings.title")}
        canGoBack
        rightContent={
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.7}
            className="flex-row items-center px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
            style={{ gap: 6 }}
          >
            {signingOut ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <>
                <Icon name="LogOut" size={15} color="#ef4444" />
                <Text className="text-red-400 text-xs font-semibold">{t("settings.logOut")}</Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      {tabBar}

      <View className="flex-1">
        {activeTab === "account" && accountPanel}
        {activeTab === "notifications" && (
          <NotificationSettingsScreen embedded navigation={navigation} />
        )}
        {activeTab === "privacy" && (
          <PrivacySettingsScreen embedded navigation={navigation} />
        )}
        {activeTab === "messages" && messagesPanel}
        {activeTab === "support" && supportPanel}
      </View>

      <ReportBugModal
        visible={bugModalVisible}
        onClose={() => setBugModalVisible(false)}
        username={(user?.username || user?.email || "Anonymous") as string}
      />
      <ExportPrivateKeyModal
        visible={exportPkVisible}
        onClose={() => setExportPkVisible(false)}
      />
      <SwitchAccountModal
        visible={switchAccountVisible}
        onClose={() => setSwitchAccountVisible(false)}
        currentAddress={user?.walletAddress || user?.address}
      />
      <ChainSwitchModal
        visible={chainModalVisible}
        onClose={() => setChainModalVisible(false)}
      />
      <BlockedAccountsModal
        visible={blockedModalVisible}
        onClose={() => setBlockedModalVisible(false)}
      />
      <ReviewModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
        userAddress={user?.walletAddress || user?.address}
      />
      <LanguageSelectModal
        visible={languageModalVisible}
        onClose={() => {
          setLanguageModalVisible(false);
          setCurrentLang(i18nInstance.language);
        }}
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
            <Text className="text-white font-bold text-base">{t("screens.freeDmAccessList")}</Text>
            {freeAccessLoading && <ActivityIndicator size="small" color="#D4D4D8" />}
          </View>
          <Text className="text-theme-neutrals-500 text-xs px-5 pt-3 pb-1">
            {t("screens.freeDmAccessModalDesc")}
          </Text>
          {!freeAccessLoading && freeAccessList.length === 0 ? (
            <View className="flex-1 items-center justify-center py-12">
              <Icon name="Gift" size={36} color="#4b5563" />
              <Text className="text-theme-neutrals-500 text-sm mt-3">{t("screens.noFreeAccessUsers")}</Text>
              <Text className="text-theme-neutrals-600 text-xs mt-1 text-center px-8">
                {t("screens.freeDmGrantHint")}
              </Text>
            </View>
          ) : (
            <FlatList
              data={freeAccessList}
              keyExtractor={item => item}
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
                      className="bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-lg"
                      activeOpacity={0.7}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#ef4444" />
                      ) : (
                        <Text className="text-red-400 text-xs font-semibold">{t("screens.revoke")}</Text>
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
