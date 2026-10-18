/**
 * First-run setup: language, theme, then who is using the app.
 *
 * Replaces the old three-slide story. It runs straight after the logo
 * animation for anyone who has not been through the auth screens on this
 * device, and every choice applies the moment it is tapped: picking a language
 * re-renders this screen in it, picking a theme repaints the whole app, so the
 * screen itself is the preview. Then it hands over to sign-in.
 *
 * The audience step (Kids / Everyone / Mature 18+) needs an account to save
 * to, and there is none yet; see libs/onboarding-choices for how it reaches
 * the account later and why Kids Mode locks the device straight away.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DevSettings,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useTranslation } from "react-i18next";
import * as Updates from "expo-updates";
import { ScreenNames } from "../../navigation/ScreenNames";
import type { AuthStackParamList } from "../../navigation/types";
import { setHasSeenAuth, setHasSeenOnboarding } from "../../libs/auth.utils";
import { SUPPORTED_LANGUAGES, chooseLanguage, detectLanguage } from "../../i18n";
import { useAppTheme } from "../../context/ThemeContext";
import { APP_THEMES } from "../../theme/colors";
import { RING, ThemeSample } from "../../components/Settings/ThemePicker";
import KidsModePad from "../../components/Settings/KidsModePad";
import PrimaryButton from "../../components/ui/PrimaryButton";
import AccentButtonGradient from "../../components/ui/AccentButtonGradient";
import Icon from "../../components/ui/Icon";
import { MATURE_CONTENT_ENABLED } from "../../config/storefront";
import { setKidsModeLocked } from "../../libs/kids-mode-lock";
import {
  type OnboardingAudience,
  clearPendingKidsPin,
  getSavedSetupStep,
  saveSetupStep,
  setPendingKidsPin,
  setPendingMature,
} from "../../libs/onboarding-choices";
import { toastError } from "../../libs/toast";

type Nav = StackNavigationProp<AuthStackParamList, typeof ScreenNames.Onboarding>;

const STEPS = 3;
const PAD = 20;
const GRID_GAP = 10;
const GRID_COLUMNS = 2;

const INK = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.66)";
const LINE = "rgba(255,255,255,0.14)";
const FIELD = "rgba(255,255,255,0.06)";

const OnboardingScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { skin, theme, themeChoice, setTheme } = useAppTheme();
  const [step, setStep] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [audience, setAudience] = useState<OnboardingAudience>("everyone");
  const [padOpen, setPadOpen] = useState(false);

  // Back on the step after the language when a right-to-left switch restarted the app.
  useEffect(() => {
    void getSavedSetupStep().then((saved) => {
      if (saved > 0 && saved < STEPS) setStep(saved);
    });
  }, []);

  const finish = useCallback(async () => {
    await Promise.all([setHasSeenOnboarding(), setHasSeenAuth(), saveSetupStep(null)]);
    navigation.replace(ScreenNames.SignIn);
  }, [navigation]);

  const saveAudience = useCallback(
    async (choice: OnboardingAudience) => {
      if (choice !== "kids") await clearPendingKidsPin();
      await setPendingMature(choice === "mature");
      await finish();
    },
    [finish],
  );

  const next = useCallback(async () => {
    if (step === 0 && needsReload) {
      // React Native reads the layout direction only at launch.
      await saveSetupStep(1);
      Updates.reloadAsync().catch(() => DevSettings.reload());
      return;
    }
    if (step < STEPS - 1) {
      setStep(step + 1);
      void saveSetupStep(step + 1);
      return;
    }
    if (audience === "kids") {
      setPadOpen(true);
      return;
    }
    await saveAudience(audience);
  }, [step, needsReload, audience, saveAudience]);

  const skip = useCallback(async () => {
    if (step < STEPS - 1) {
      setStep(step + 1);
      void saveSetupStep(step + 1);
      return;
    }
    await saveAudience("everyone");
  }, [step, saveAudience]);

  const back = useCallback(() => {
    if (step === 0) return;
    setStep(step - 1);
    void saveSetupStep(step - 1);
  }, [step]);

  const onPickLanguage = useCallback(
    async (code: string) => {
      if (code === i18n.language) return;
      const result = await chooseLanguage(code);
      if (!result.ok) {
        toastError(t("settings.languageLoadFailed"));
        return;
      }
      setNeedsReload(result.needsReload);
    },
    [i18n.language, t],
  );

  const cta =
    step < STEPS - 1
      ? t("onboarding.setup.continue")
      : audience === "kids"
        ? t("onboarding.setup.audience.setPin")
        : audience === "mature"
          ? t("onboarding.setup.audience.confirmAdult")
          : t("onboarding.setup.continue");

  return (
    <View style={styles.root}>
      {/* A canvas theme's live backdrop shows through this screen (the auth
          stack leaves it see-through), with a veil so text stays readable. */}
      {skin ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil]} /> : null}
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={back}
            disabled={step === 0}
            accessibilityRole="button"
            accessibilityLabel={t("onboarding.setup.back")}
            hitSlop={12}
            style={[styles.headerButton, { opacity: step === 0 ? 0 : 1 }]}
          >
            <Icon name="ChevronLeft" size={24} color={INK} />
          </TouchableOpacity>
          <View
            style={styles.progress}
            accessible
            accessibilityLabel={t("onboarding.setup.stepOf", { current: step + 1, total: STEPS })}
          >
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.progressBar, { backgroundColor: i <= step ? INK : LINE }]} />
            ))}
          </View>
          <TouchableOpacity onPress={skip} accessibilityRole="button" hitSlop={12} style={styles.headerButton}>
            <Text style={styles.skip}>{t("onboarding.setup.skip")}</Text>
          </TouchableOpacity>
        </View>

        <Animated.View key={step} entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(140)} style={styles.body}>
          {step === 0 ? (
            <LanguageStep current={i18n.language} onPick={onPickLanguage} />
          ) : step === 1 ? (
            <ThemeStep current={themeChoice} ring={RING[theme] ?? INK} onPick={setTheme} />
          ) : (
            <AudienceStep value={audience} onChange={setAudience} />
          )}
        </Animated.View>

        <View style={styles.footer}>
          <PrimaryButton large title={cta} onPress={() => void next()} />
        </View>
      </SafeAreaView>

      <KidsModePad
        visible={padOpen}
        onClose={() => setPadOpen(false)}
        mode="enable"
        onSubmit={async (pin) => {
          await setPendingKidsPin(pin);
          await setKidsModeLocked(true);
          setPadOpen(false);
          await saveAudience("kids");
        }}
      />
    </View>
  );
};

const StepTitle: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <View style={styles.titles}>
    <Text style={styles.title} accessibilityRole="header">{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>
);

// ── Language ───────────────────────────────────────────────────────────────

const LanguageStep: React.FC<{ current: string; onPick: (code: string) => void }> = ({ current, onPick }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const phone = useMemo(() => {
    const code = detectLanguage();
    return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = SUPPORTED_LANGUAGES.filter((l) => l.code !== phone.code).sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return [phone, ...all];
    return SUPPORTED_LANGUAGES.filter(
      (l) => l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    );
  }, [query, phone]);

  return (
    <View style={{ flex: 1 }}>
      <StepTitle title={t("onboarding.setup.language.title")} subtitle={t("onboarding.setup.language.subtitle")} />
      <View style={styles.search}>
        <Icon name="Search" size={18} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("settings.searchLanguages")}
          placeholderTextColor={MUTED}
          style={styles.searchInput}
          autoCorrect={false}
          accessibilityLabel={t("settings.searchLanguages")}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={t("sidebar.clearSearch")} hitSlop={10}>
            <Icon name="X" size={16} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(l) => l.code}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 12, gap: 8 }}
        ListEmptyComponent={<Text style={[styles.subtitle, { textAlign: "center", marginTop: 24 }]}>{t("settings.noLanguagesFound")}</Text>}
        renderItem={({ item, index }) => {
          const active = item.code === current;
          const fromPhone = !query && index === 0;
          return (
            <OptionFrame active={active} onPress={() => onPick(item.code)} label={item.nativeName}>
              <View style={styles.languageRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.languageName}>{item.nativeName}</Text>
                  <Text style={styles.languageMeta}>
                    {fromPhone ? t("onboarding.setup.language.fromPhone") : item.name}
                  </Text>
                </View>
                {active ? <Icon name="Check" size={20} color={INK} /> : null}
              </View>
            </OptionFrame>
          );
        }}
      />
    </View>
  );
};

// ── Theme ──────────────────────────────────────────────────────────────────

const ThemeStep: React.FC<{ current: string; ring: string; onPick: (theme: any) => void }> = ({ current, ring, onPick }) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - PAD * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  // The shots are the top of a phone screen: pill, a photo post, shorts row.
  const cardH = Math.round(cardW * 1.44);
  return (
    <View style={{ flex: 1 }}>
      <StepTitle title={t("onboarding.setup.theme.title")} subtitle={t("onboarding.setup.theme.subtitle")} />
      <FlatList
        style={{ flex: 1 }}
        data={APP_THEMES as readonly string[]}
        keyExtractor={(v) => v}
        numColumns={GRID_COLUMNS}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ gap: GRID_GAP }}
        contentContainerStyle={{ gap: 14, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <ThemeSample
            value={item as any}
            label={t(item === "system-light" ? "settings.systemLight" : `settings.${item}`)}
            active={current === item}
            ring={ring}
            width={cardW}
            height={cardH}
            screen
            onPress={() => onPick(item)}
          />
        )}
      />
    </View>
  );
};

// ── Audience ───────────────────────────────────────────────────────────────

const AUDIENCE_ICONS: Record<OnboardingAudience, string> = {
  kids: "Baby",
  everyone: "Users",
  mature: "ShieldCheck",
};

const AudienceStep: React.FC<{ value: OnboardingAudience; onChange: (v: OnboardingAudience) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  // The App Store build never serves a mature post, so it never offers them.
  const options: OnboardingAudience[] = MATURE_CONTENT_ENABLED ? ["kids", "everyone", "mature"] : ["kids", "everyone"];
  return (
    <View style={{ flex: 1 }}>
      <StepTitle title={t("onboarding.setup.audience.title")} subtitle={t("onboarding.setup.audience.subtitle")} />
      <View style={{ gap: 12 }}>
        {options.map((option) => {
          const active = option === value;
          return (
            <OptionFrame
              key={option}
              active={active}
              onPress={() => onChange(option)}
              label={t(`onboarding.setup.audience.${option}.title`)}
              tall
            >
              <View style={styles.audienceRow}>
                <View style={styles.audienceIcon}>
                  <Icon name={AUDIENCE_ICONS[option] as any} size={24} color={INK} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.audienceTitle}>{t(`onboarding.setup.audience.${option}.title`)}</Text>
                    {option === "everyone" ? (
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>{t("onboarding.setup.audience.recommended")}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.audienceBody}>{t(`onboarding.setup.audience.${option}.body`)}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioOn]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
              </View>
            </OptionFrame>
          );
        })}
      </View>
    </View>
  );
};

/**
 * One choosable row. The picked one wears the theme's own button chrome (the
 * same material as the Continue button), the rest a faint glass, so the
 * selection reads in every theme without a new colour.
 */
const OptionFrame: React.FC<{
  active: boolean;
  onPress: () => void;
  label: string;
  tall?: boolean;
  children: React.ReactNode;
}> = ({ active, onPress, label, tall, children }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    accessibilityRole="radio"
    accessibilityState={{ selected: active, checked: active }}
    accessibilityLabel={label}
    style={[styles.option, tall && styles.optionTall, !active && styles.optionIdle]}
  >
    {active ? (
      <AccentButtonGradient borderRadius={16} style={StyleSheet.absoluteFill}>
        <View />
      </AccentButtonGradient>
    ) : null}
    {children}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  veil: { backgroundColor: "rgba(0,0,0,0.35)" },
  safe: { flex: 1, paddingHorizontal: PAD },
  header: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" },
  progress: { flexDirection: "row", gap: 6 },
  progressBar: { width: 28, height: 4, borderRadius: 2 },
  skip: { color: MUTED, fontSize: 15, fontWeight: "600" },
  body: { flex: 1 },
  titles: { gap: 6, marginTop: 8, marginBottom: 18 },
  title: { color: INK, fontSize: 30, lineHeight: 36, fontWeight: "700" },
  subtitle: { color: MUTED, fontSize: 15, lineHeight: 21 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: FIELD,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: INK, fontSize: 15, paddingVertical: 0 },
  option: { borderRadius: 16, overflow: "hidden", minHeight: 56, justifyContent: "center", paddingHorizontal: 16 },
  optionTall: { paddingVertical: 16 },
  optionIdle: { borderWidth: 1, borderColor: LINE, backgroundColor: FIELD },
  languageRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  // "left" is the start edge, so a right-to-left layout flips it; without it
  // Arabic and Hebrew names sat right-aligned in a left-aligned list.
  languageName: { color: INK, fontSize: 16, fontWeight: "600", textAlign: "left" },
  languageMeta: { color: MUTED, fontSize: 12, marginTop: 2, textAlign: "left" },
  audienceRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  audienceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  audienceTitle: { color: INK, fontSize: 18, fontWeight: "700" },
  audienceBody: { color: MUTED, fontSize: 14, lineHeight: 20 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.16)" },
  tagText: { color: INK, fontSize: 11, fontWeight: "700" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: LINE,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: INK },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: INK },
  footer: { paddingTop: 12, paddingBottom: 8 },
});

export default OnboardingScreen;
