import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import Constants from "expo-constants";
import { useUser, useAuthState, useAuthActions, useProvider } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { ScreenNames } from "../navigation/ScreenNames";
import { toastSuccess, toastError } from "../libs";
import ScreenHeader from "../components/ScreenHeader";
import { logoutWeb3Auth } from "../config/web3auth.config";
import FullScreenLoader from "../components/FullScreenLoader";
import ReportBugModal from "../components/Settings/ReportBugModal";
import ExportPrivateKeyModal from "../components/Settings/ExportPrivateKeyModal";
import ReviewModal from "../components/ReviewModal";
import Icon, { type IconName } from "../components/ui/Icon";
import { openInApp } from "../libs/links.utils";
import {
  TERMS_OF_SERVICE_LINK,
  PRIVACY_POLICY_LINK,
  DELETE_DATA_OR_ACCOUNT_LINK,
} from "../config/links";
import DMSettingsSection from "../components/Settings/DMSettingsSection";
import { ChainId } from "../config/constants";
import ChainSwitchModal from "../components/Settings/ChainSwitchModal";
import BlockedAccountsModal from "../components/Settings/BlockedAccountsModal";
import LanguageSelectModal from "../components/Settings/LanguageSelectModal";
import i18nInstance, { SUPPORTED_LANGUAGES } from "../i18n";

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
  <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
    {children}
  </View>
);

const AccountSettingsScreen: React.FC<any> = ({ navigation }) => {
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { signOut, patchUser } = useAuthActions();
  const { chainId, authMethod } = useProvider();
  const [signingOut, setSigningOut] = useState(false);
  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [exportPkVisible, setExportPkVisible] = useState(false);
  const [chainModalVisible, setChainModalVisible] = useState(false);
  const [blockedModalVisible, setBlockedModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18nInstance.language);
  const { t } = useTranslation();
  const isImported = authMethod === "local";
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutWeb3Auth();
      await signOut();
      toastSuccess(t('settings.loggedOut'));
    } catch (e) {
      console.error("[AccountSettings] signOut error", e);
      toastError(e, "Sign out failed.");
    } finally {
      setSigningOut(false);
    }
  }, [signingOut, signOut]);

  const blockedCount = (user?.blocklist?.blocked?.length || 0) as number;

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {signingOut && <FullScreenLoader message={t('settings.signingOut')} />}
      <ScreenHeader title={t("settings.title")} canGoBack />
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
              subtitle={isImported ? t("settings.gasImportedDesc") : t("settings.gasSponsoredDesc")}
              rightElement={
                <View className={`px-2.5 py-1 rounded-full ${isImported ? "bg-theme-neutrals-700/40" : "bg-emerald-500/20"}`}>
                  <Text className={`text-[10px] font-semibold ${isImported ? "text-theme-neutrals-400" : "text-emerald-400"}`}>
                    {isImported ? t("settings.gasOff") : t("settings.gasActive")}
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
          </SectionCard>
        </View>

        <View className="mb-6">
          <DMSettingsSection />
        </View>

        <View className="mb-6">
          <SectionLabel label={t("settings.preferences")} />
          <SectionCard>
            <SettingsRow
              icon="Bell"
              label={t("settings.notifications")}
              subtitle={t("settings.notificationDesc")}
              onPress={() => navigation.navigate(ScreenNames.NotificationSettings)}
            />
            <Divider />
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
              iconColor="#6b7280"
              label={t("settings.dataSaver")}
              subtitle={t("settings.dataSaverDesc")}
              disabled
              rightElement={
                <View className="bg-theme-neutrals-700/40 px-2.5 py-1 rounded-full">
                  <Text className="text-theme-neutrals-500 text-[10px] font-semibold">{t("settings.comingSoon")}</Text>
                </View>
              }
            />
          </SectionCard>
        </View>

        <View className="mb-6">
          <SectionLabel label={t("settings.privacySecurity")} />
          <SectionCard>
            <SettingsRow
              icon="ShieldCheck"
              label={t("settings.accountPrivacy")}
              subtitle={t("settings.accountPrivacyDesc")}
              onPress={() => navigation.navigate(ScreenNames.PrivacySettings)}
            />
            <Divider />
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

        <View className="mb-6">
          <SectionCard>
            <TouchableOpacity
              onPress={handleSignOut}
              disabled={signingOut}
              activeOpacity={0.7}
              className={`px-4 py-3.5 flex-row items-center justify-center ${signingOut ? "opacity-50" : ""}`}
            >
              {signingOut ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Icon name="LogOut" size={18} color="#ef4444" />
                  <Text className="text-red-400 font-semibold text-sm ml-2">
                    {t("settings.logOut")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </SectionCard>
        </View>

        <Text className="text-center text-theme-neutrals-600 text-xs mb-2">
          DeHub v{APP_VERSION}
        </Text>
      </ScrollView>
      <ReportBugModal
        visible={bugModalVisible}
        onClose={() => setBugModalVisible(false)}
        username={(user?.username || user?.email || "Anonymous") as string}
      />
      <ExportPrivateKeyModal
        visible={exportPkVisible}
        onClose={() => setExportPkVisible(false)}
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
    </View>
  );
};

export default AccountSettingsScreen;
