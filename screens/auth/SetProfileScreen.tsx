/**
 * Welcome flow — the last part of signing up, matching web's
 * (dehubweb components/app/login/LoginProfileStep.tsx).
 *
 * One question per screen: date of birth and look, name, @username, photo,
 * interests, people to follow, then the finished card. The profile card at the
 * top fills in live as each answer is given.
 *
 * The profile (name, @, photo) is written in ONE request when the photo step
 * is left, as before. Interests and follows come after, against a real
 * account. `completeUsername` — which lets the app open — only runs on the
 * last screen, so the flow stays up until "Enter DeHub".
 */
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  BackHandler,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import Animated, { FadeInLeft, FadeInRight, ZoomIn } from "react-native-reanimated";
import DateTimePicker from "@react-native-community/datetimepicker";
import SmartImage from "../../components/common/SmartImage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { useAppTheme } from "../../context/ThemeContext";
import { AuthService } from "../../services/auth.service";
import { getSignInDisplayName } from "../../services/auth/supabaseAuth.service";
import { followUser, getRankedSuggestions, unfollowUser, type SuggestedAccount } from "../../services/user.service";
import { useDebounceCallback } from "../../hooks/useDebounceCallback";
import { toastError } from "../../libs";
import { setAuthUser } from "../../libs/auth.utils";
import { User } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { createLogger } from "../../libs/logger";
import { isReservedUsername } from "../../libs/reserved-usernames";
import { getAvatarUrl } from "../../libs/misc";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  openCroppedImagePicker,
  resizeAndCompress,
  createRNImageFile,
} from "../../libs/assets.util";
import { runWithPermissions } from "../../libs/permissions.util";
import { FEED_INTERESTS_PREF, INTEREST_TOPICS, saveAccountPrefs, setFeedInterests, topicCover } from "../../libs/feed-interests";
import LanguageSelectModal from "../../components/Settings/LanguageSelectModal";
import ThemePicker from "../../components/Settings/ThemePicker";
import PrimaryButton from "../../components/ui/PrimaryButton";
import { SUPPORTED_LANGUAGES } from "../../i18n";
import { useKeyboardOffset } from "../../hooks/useKeyboardLayout";
import { isLightToneOn } from "../../libs/jsx/tone";

const log = createLogger("SetProfileScreen");

type Step = "about" | "name" | "username" | "photo" | "interests" | "people" | "done";
const STEPS: Step[] = ["about", "name", "username", "photo", "interests", "people", "done"];
/** Past this step the card falls back to the @username for the name. */
const NAME_STEP_INDEX = STEPS.indexOf("name");
const MIN_INTERESTS = 3;
const PEOPLE_LIMIT = 8;
/** Store rules: nobody under 13 holds an account. Under 18 starts with mature content off. */
const MIN_AGE = 13;
const ADULT_AGE = 18;
const PAD = 20;

function ageOn(birth: Date, today = new Date()): number {
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

interface SetProfileScreenProps {
  navigation: any;
}

const SetProfileScreen: React.FC<SetProfileScreenProps> = ({ navigation }) => {
  const { provisionalUser, needsUsername } = useAuthState();
  const { completeUsername, signOut } = useAuthActions();
  const { t, i18n } = useTranslation();
  const { colors, isLight: themeIsLight, skin } = useAppTheme();
  // System Light keeps the dark palette and flips greys on the way out, so
  // this screen picks dark values there and lets that pass turn them.
  const isLight = themeIsLight && !isLightToneOn();
  const ink = colors.foreground;
  const muted = colors.mutedForeground;
  const line = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";
  const field = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)";
  // The screen sits under the root SafeAreaView, so the keyboard offset is its
  // top inset on both platforms.
  const keyboardOffset = useKeyboardOffset();

  const [step, setStepRaw] = useState<Step>("about");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const stepRef = useRef(step);
  stepRef.current = step;
  const setStep = useCallback((to: Step) => {
    setDir(STEPS.indexOf(to) >= STEPS.indexOf(stepRef.current) ? "fwd" : "back");
    setStepRaw(to);
  }, []);
  const stepIndex = STEPS.indexOf(step);
  // Set once the profile is written. From then on Back stops at interests and
  // signing out is no longer offered here.
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [birth, setBirth] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const age = birth ? ageOn(birth) : null;

  const [username, setUsername] = useSurfaceDraft("screens/auth/SetProfileScreen.tsx:username", "");
  const [displayName, setDisplayName] = useSurfaceDraft("screens/auth/SetProfileScreen.tsx:displayName", "");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Local file URI of a picked avatar, uploaded with the profile.
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const currentLanguage =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES.find((l) => l.code === "en");

  const [interests, setInterests] = useState<string[]>([]);
  const [people, setPeople] = useState<SuggestedAccount[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());
  const myAddress = ((provisionalUser as any)?.walletAddress || (provisionalUser as any)?.address || "") as string;

  const isMountedRef = useRef(true);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Start from the name Apple or Google already gave us. Never overwrites
  // anything typed, and the field stays optional when there is none.
  useEffect(() => {
    void getSignInDisplayName().then((name) => {
      if (name && isMountedRef.current) setDisplayName((current) => current || name);
    });
  }, []);

  const navigateToApp = useCallback(() => {
    if (!isMountedRef.current || hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    log.info("Navigating to App");
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: ScreenNames.App }],
      })
    );
  }, [navigation]);

  const back = useCallback(() => {
    setError(null);
    const floor = saved ? STEPS.indexOf("interests") : 0;
    const i = STEPS.indexOf(stepRef.current);
    if (i > floor && stepRef.current !== "done") setStep(STEPS[i - 1]);
  }, [saved, setStep]);

  // Hardware back walks the steps; it never leaves the flow.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        back();
        return true;
      });
      return () => subscription.remove();
    }, [back])
  );

  useEffect(() => {
    if (needsUsername) navigation.setOptions({ gestureEnabled: false });
  }, [needsUsername, navigation]);

  // Navigate to App when profile is complete (needsUsername becomes false)
  useEffect(() => {
    if (!needsUsername && !submitting && !hasNavigatedRef.current) {
      log.info("Profile complete, navigating to App");
      navigateToApp();
    }
  }, [needsUsername, submitting, navigateToApp]);

  // Handle edge case: arrived here without provisional user
  useEffect(() => {
    if (!provisionalUser && !needsUsername && !hasNavigatedRef.current) {
      log.warn("No provisional user, redirecting to SignIn");
      hasNavigatedRef.current = true;
      navigation.reset({
        index: 0,
        routes: [{ name: ScreenNames.SignIn }],
      });
    }
  }, [provisionalUser, needsUsername, navigation]);

  const runAvailability = useDebounceCallback(async (name: string) => {
    if (!name || name.length < 3) {
      setAvailable(null);
      return;
    }
    // Names that collide with a web route leave the profile unreachable at
    // dehub.io/:username. The availability endpoint reports them as free, so
    // this has to be decided here.
    if (isReservedUsername(name)) {
      setAvailable(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const res = await AuthService.checkUsernameAvailability(name);
      setAvailable(res.available);
    } catch {
      setAvailable(null);
    }
    setChecking(false);
  }, 450);

  const handleUsernameChange = (text: string) => {
    const sanitized = text.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    setUsername(sanitized);
    setAvailable(null);
    runAvailability(sanitized.trim());
  };

  // Same pipeline as EditProfileScreen's avatar picker (crop square, then
  // downscale to 512 before upload).
  const handlePickAvatar = useCallback(async () => {
    try {
      setProcessingAvatar(true);
      await runWithPermissions(["photos"], async () => {
        const picked = await openCroppedImagePicker({
          width: 800,
          height: 800,
          circle: true,
          quality: 0.9,
          forceJpg: true,
        });
        if (!picked) return;
        const manip = await resizeAndCompress(picked, {
          width: 512,
          height: 512,
          compress: 0.85,
          format: "jpeg",
        });
        if (isMountedRef.current) setLocalAvatar(manip);
      });
    } catch (e) {
      log.warn("Avatar pick failed", e);
      toastError(e, t("setProfile.imageFailed"));
    } finally {
      if (isMountedRef.current) setProcessingAvatar(false);
    }
  }, []);

  const isUsernameValid = username.length >= 3 && username.length <= 30;
  const trimmedDisplayName = displayName.trim();
  const isDisplayNameValid =
    trimmedDisplayName.length === 0 || (trimmedDisplayName.length >= 2 && trimmedDisplayName.length <= 50);

  /** Writes the profile. Runs when the photo step is left, with or without a photo. */
  const saveProfile = async (): Promise<boolean> => {
    if (isReservedUsername(username)) {
      setError(t("setProfile.usernameReserved"));
      setStep("username");
      return false;
    }
    setSubmitting(true);
    const finalDisplayName = trimmedDisplayName || username.trim();
    try {
      const payload: Record<string, any> = {
        username: username.trim(),
        displayName: finalDisplayName,
      };
      if (age !== null && age < ADULT_AGE) payload.showMatureContent = false;
      if (localAvatar) {
        // Both keys, matching EditProfileScreen — the backend reads one of the
        // two depending on the route that handles the multipart body.
        const avatarFile = createRNImageFile(localAvatar, "avatar");
        payload.avatar = avatarFile;
        payload.avatarImg = avatarFile;
      }
      await AuthService.updateProfile(payload);
      // Private to the account (wallet-scoped preferences), never on the profile.
      if (birth && myAddress) {
        const iso = `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, "0")}-${String(birth.getDate()).padStart(2, "0")}`;
        saveAccountPrefs(myAddress, { birthDate: iso }).catch((e) => log.warn("birth date save failed", e));
      }
      setSaved(true);
      // Fetched now so the people step opens full.
      getRankedSuggestions("active", null, PEOPLE_LIMIT)
        .then((page) => { if (isMountedRef.current) setPeople(page.items); })
        .catch(() => { if (isMountedRef.current) setPeople([]); });
      return true;
    } catch (e: any) {
      toastError(e, t("setProfile.profileFailed"));
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("taken") || msg.includes("exists")) {
        setAvailable(false);
        setStep("username");
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFollow = (address: string) => {
    if (!myAddress) return;
    const following = followed.has(address);
    const flip = (on: boolean) => setFollowed((prev) => {
      const nextSet = new Set(prev);
      if (on) nextSet.add(address); else nextSet.delete(address);
      return nextSet;
    });
    flip(!following);
    (following ? unfollowUser(myAddress, address) : followUser(myAddress, address)).catch(() => {
      // Put the button back so it never claims a follow that failed.
      flip(following);
      toastError(null, t("welcome.followFailed", "Could not follow. Try again."));
    });
  };

  const finish = async () => {
    const finalUser: User = {
      ...provisionalUser,
      username: username.trim(),
      displayName: trimmedDisplayName || username.trim(),
      ...(localAvatar ? { avatarImageUrl: localAvatar } : {}),
    } as User;
    await setAuthUser(finalUser);
    // Sets needsUsername to false, which opens the app via the effect above.
    completeUsername(finalUser);
  };

  const next = async () => {
    setError(null);
    if (step === "about") {
      if (age === null) {
        setError(t("welcome.about.invalid", "Enter your full date of birth."));
        return;
      }
      if (age < MIN_AGE) {
        setError(t("welcome.about.tooYoung", { defaultValue: "You need to be {{age}} or older to use DeHub.", age: MIN_AGE }));
        return;
      }
      setStep("name");
    } else if (step === "name") {
      if (!isDisplayNameValid) return;
      setStep("username");
    } else if (step === "username") {
      setStep("photo");
    } else if (step === "photo") {
      if (saved || (await saveProfile())) setStep("interests");
    } else if (step === "interests") {
      const value = await setFeedInterests(interests);
      if (myAddress) saveAccountPrefs(myAddress, { [FEED_INTERESTS_PREF]: value }).catch((e) => log.warn("interests save failed", e));
      setStep("people");
    } else if (step === "people") {
      setStep("done");
    } else {
      await finish();
    }
  };

  const signOutHere = async () => {
    try {
      log.info("User cancelled, signing out");
      await signOut();
      if (isMountedRef.current) {
        navigation.reset({ index: 0, routes: [{ name: ScreenNames.SignIn }] });
      }
    } catch (e) {
      log.warn("Sign out error", e);
    }
  };

  const canContinue =
    step === "about" ? !!birth
    : step === "name" ? isDisplayNameValid
    : step === "username" ? isUsernameValid && available === true && !checking
    : step === "interests" ? interests.length >= MIN_INTERESTS
    : !submitting && !processingAvatar;

  const name = trimmedDisplayName || (NAME_STEP_INDEX < stepIndex ? username : "");
  const title: Record<Step, string> = {
    about: t("welcome.about.title", "Welcome to DeHub"),
    name: t("welcome.name.title", "Your name"),
    username: t("welcome.username.title", "Your @username"),
    photo: t("welcome.photo.title", "Your photo"),
    interests: t("welcome.interests.title", "Your interests"),
    people: t("welcome.people.title", "Your people"),
    done: t("welcome.done.title", { defaultValue: "Looking good, {{name}}", name: name || username }),
  };
  const subtitle: Record<Step, string> = {
    about: t("welcome.about.sub", "Your birthday stays private. Pick a look, you can change it any time."),
    name: t("welcome.name.sub", "This is the name people see on your posts."),
    username: t("welcome.username.sub", "Letters, numbers and underscores. You can change it later."),
    photo: t("welcome.photo.sub", "Optional. People follow faces faster."),
    interests: t("welcome.interests.sub", "Pick at least 3. They go first in your categories."),
    people: t("welcome.people.sub", "Tap to follow. Their posts fill your Following feed."),
    done: t("welcome.done.sub", "Everyone sees this card from today."),
  };
  const cta =
    step === "done" ? t("welcome.enter", "Enter DeHub")
    : step === "photo" && !localAvatar && !saved ? t("welcome.skipPhoto", "Skip for now")
    : step === "interests" && interests.length < MIN_INTERESTS
      ? t("welcome.pickMore", { defaultValue: "Pick {{count}} more", count: MIN_INTERESTS - interests.length })
    : t("loginModal.continue");

  const s = makeStyles(ink, muted, line, field);
  const Entering = dir === "fwd" ? FadeInRight : FadeInLeft;

  const card = (
    <WelcomeCard
      name={name}
      username={username}
      avatar={localAvatar}
      interests={stepIndex >= STEPS.indexOf("interests") ? interests : []}
      following={followed.size}
      typing={step === "name" ? "name" : step === "username" ? "username" : null}
      preview={step !== "done"}
      ink={ink}
      muted={muted}
      line={line}
      field={field}
      isLight={isLight}
    />
  );

  const body = (
    <>
      {step === "about" && (
        <View style={{ gap: 22 }}>
          <View>
            <Text style={s.label}>{t("welcome.about.birthday", "Date of birth")}</Text>
            <TouchableOpacity
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("welcome.about.birthday", "Date of birth")}
              style={s.field}
            >
              <Ionicons name="calendar-outline" size={20} color={muted} />
              <Text style={[s.fieldText, !birth && { color: muted, fontWeight: "500" }]}>
                {birth
                  ? birth.toLocaleDateString(i18n.language || undefined, { day: "numeric", month: "long", year: "numeric" })
                  : t("welcome.about.pick", "Pick your birthday")}
              </Text>
            </TouchableOpacity>
            {pickerOpen && (
              <DateTimePicker
                value={birth ?? new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                themeVariant={themeIsLight ? "light" : "dark"}
                onChange={(e, d) => {
                  if (Platform.OS !== "ios") setPickerOpen(false);
                  if (e.type !== "dismissed" && d) setBirth(d);
                }}
              />
            )}
            {Platform.OS === "ios" && pickerOpen && (
              <TouchableOpacity onPress={() => { if (!birth) setBirth(new Date(2000, 0, 1)); setPickerOpen(false); }} style={{ alignSelf: "flex-end", padding: 8 }}>
                <Text style={{ color: ink, fontWeight: "600", fontSize: 15 }}>{t("common.done")}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View>
            <Text style={s.label}>{t("welcome.about.theme", "Your look")}</Text>
            <View style={{ marginHorizontal: PAD - 16 }}>
              <ThemePicker />
            </View>
          </View>
        </View>
      )}

      {step === "name" && (
        <View style={{ gap: 18 }}>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t("welcome.name.placeholder", "Your name")}
            placeholderTextColor={muted}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            maxLength={50}
            returnKeyType="next"
            onSubmitEditing={() => { if (canContinue) void next(); }}
            style={s.input}
          />
          <View>
            <Text style={s.label}>{t("settings.language")}</Text>
            <TouchableOpacity
              onPress={() => setLanguageOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("settings.language")}
              accessibilityValue={{ text: currentLanguage?.nativeName }}
              style={s.field}
            >
              <Ionicons name="globe-outline" size={20} color={muted} />
              <Text style={[s.fieldText, { fontWeight: "500" }]} numberOfLines={1}>
                {currentLanguage?.nativeName ?? i18n.language}
              </Text>
              <Ionicons name="chevron-down" size={18} color={muted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === "username" && (
        <View>
          <View style={[s.inputRow, available === true && { borderColor: "rgba(52,211,153,0.7)" }, available === false && { borderColor: "rgba(239,68,68,0.6)" }]}>
            <Text style={[s.inputText, { color: muted }]}>@</Text>
            <TextInput
              value={username}
              onChangeText={handleUsernameChange}
              placeholder={t("setProfile.usernamePlaceholder")}
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={30}
              returnKeyType="next"
              onSubmitEditing={() => { if (canContinue) void next(); }}
              style={[s.inputText, { flex: 1, paddingVertical: 0 }]}
            />
            {checking ? <ActivityIndicator size="small" color={muted} />
              : available === true ? <Ionicons name="checkmark-circle" size={20} color="#34d399" />
              : available === false ? <Ionicons name="close-circle" size={20} color="#ef4444" />
              : null}
          </View>
          <Text style={[s.hint, available === true && { color: "#34d399" }, available === false && { color: "#ef4444" }]}>
            {available === true ? t("welcome.username.yours", { defaultValue: "@{{name}} is yours", name: username })
              : available === false ? t("setProfile.usernameTaken")
              : t("setProfile.usernameHint")}
          </Text>
        </View>
      )}

      {step === "photo" && (
        <TouchableOpacity onPress={handlePickAvatar} disabled={processingAvatar || saved} style={[s.ghost, { opacity: saved ? 0.5 : 1 }]} accessibilityRole="button">
          {processingAvatar ? <ActivityIndicator size="small" color={ink} /> : <Ionicons name="camera-outline" size={18} color={ink} />}
          <Text style={s.ghostText}>{localAvatar ? t("welcome.photo.change", "Choose another") : t("welcome.photo.choose", "Choose a photo")}</Text>
        </TouchableOpacity>
      )}

      {step === "interests" && (
        <View style={s.chips}>
          {INTEREST_TOPICS.map((topic) => {
            const on = interests.includes(topic.id);
            return (
              <TouchableOpacity
                key={topic.id}
                onPress={() => setInterests((prev) => (prev.includes(topic.id) ? prev.filter((x) => x !== topic.id) : [...prev, topic.id]))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                {/* The fill sits on an inner view: theme skins repaint a button's own
                    neutral fill, and a picked chip has to stay solid ink. */}
                <View style={[s.chip, on && { backgroundColor: ink, borderColor: ink }]}>
                  {on && <Ionicons name="checkmark" size={14} color={colors.background} />}
                  <Text style={[s.chipText, on && { color: colors.background }]}>
                    {t(`welcome.topic.${topic.id}`, topic.id.charAt(0).toUpperCase() + topic.id.slice(1))}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {step === "people" && (
        <View style={{ gap: 8 }}>
          {people === null && [0, 1, 2, 3].map((i) => <View key={i} style={[s.row, { height: 68 }]} />)}
          {people?.length === 0 && <Text style={s.hint}>{t("welcome.people.empty", "No suggestions right now. Explore has more people to find.")}</Text>}
          {people?.map((person) => {
            const on = followed.has(person.address);
            const avatarPath = (person as any).avatarImageUrl || (person as any).avatarUrl;
            const label = person.displayName || person.username || `${person.address.slice(0, 6)}…`;
            return (
              <View key={person.address} style={s.row}>
                {avatarPath
                  ? <SmartImage source={{ uri: getAvatarUrl(avatarPath, 44) }} style={s.rowAvatar} />
                  : <View style={[s.rowAvatar, s.initial]}><Text style={{ color: ink, fontWeight: "700" }}>{label.slice(0, 1).toUpperCase()}</Text></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
                  <Text numberOfLines={1} style={{ color: muted, fontSize: 12 }}>
                    {person.username ? `@${person.username}` : ""}
                    {person.followers ? ` · ${t("welcome.people.followers", { defaultValue: "{{count}} followers", count: formatCompactNumber(person.followers) as any })}` : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => toggleFollow(person.address)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[s.follow, on ? { borderWidth: 1, borderColor: line } : { backgroundColor: ink }]}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: on ? muted : colors.background }}>
                      {on ? t("profile.following", "Following") : t("profile.follow", "Follow")}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {error ? (
        <View style={s.error}>
          <Ionicons name="alert-circle" size={16} color="#f87171" />
          <Text style={{ color: "#f87171", fontSize: 14, flex: 1 }}>{error}</Text>
        </View>
      ) : null}
    </>
  );

  const showBack = step !== "done" && stepIndex > (saved ? STEPS.indexOf("interests") : 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: skin ? "transparent" : colors.background }}>
      {/* A canvas theme's live backdrop shows through, with a veil so text stays readable. */}
      {skin ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} /> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        {step === "done" ? (
          <Animated.View entering={FadeInRight.duration(260)} style={{ flex: 1, justifyContent: "center", paddingHorizontal: PAD }}>
            <Text style={s.eyebrow}>{t("welcome.done.eyebrow", "Profile live")}</Text>
            {card}
            <Text style={[s.title, { textAlign: "center", marginTop: 24 }]}>{title.done}</Text>
            <Text style={[s.sub, { textAlign: "center" }]}>{subtitle.done}</Text>
            <PrimaryButton large title={cta} onPress={() => void next()} className="mt-8" />
          </Animated.View>
        ) : (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: PAD, paddingTop: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            {card}
            <View style={s.dots} accessible accessibilityLabel={t("onboarding.setup.stepOf", { current: stepIndex + 1, total: STEPS.length - 1 })}>
              {STEPS.slice(0, -1).map((k, i) => (
                <View key={k} style={[s.dot, i === stepIndex ? { width: 20, backgroundColor: ink } : { backgroundColor: i < stepIndex ? muted : line }]} />
              ))}
            </View>
            <Animated.View key={step} entering={Entering.duration(260)} style={{ flex: 1 }}>
              <Text style={s.title} accessibilityRole="header">{title[step]}</Text>
              <Text style={s.sub}>{subtitle[step]}</Text>
              {body}
            </Animated.View>
            <View style={s.footer}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {showBack && (
                  <TouchableOpacity onPress={back} disabled={submitting} style={[s.ghost, { flex: 1 }]} accessibilityRole="button">
                    <Text style={s.ghostText}>{t("welcome.back", "Back")}</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }}>
                  {submitting
                    ? <View style={[s.ghost, { borderWidth: 0 }]}><ActivityIndicator color={ink} /></View>
                    : <PrimaryButton large title={cta} onPress={() => void next()} disabled={!canContinue} />}
                </View>
              </View>
              {!saved && (
                <TouchableOpacity onPress={() => void signOutHere()} disabled={submitting} style={{ alignSelf: "center", marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="log-out-outline" size={16} color={muted} />
                  <Text style={{ color: muted, fontSize: 13 }}>{t("setProfile.cancelSignOut")}</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <LanguageSelectModal visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </SafeAreaView>
  );
};

/**
 * The profile card that fills in as the flow is answered: name and @ while
 * typed, the photo, then the picked topics' artwork as the banner and the
 * follow count. Pieces pop in as they arrive.
 */
const WelcomeCard: React.FC<{
  name: string;
  username: string;
  avatar: string | null;
  interests: string[];
  following: number;
  typing: "name" | "username" | null;
  preview: boolean;
  ink: string;
  muted: string;
  line: string;
  field: string;
  isLight: boolean;
}> = ({ name, username, avatar, interests, following, typing, preview, ink, muted, line, field, isLight }) => {
  const { t } = useTranslation();
  const covers = interests.slice(0, 4);
  const initial = (name || username || "?").slice(0, 1).toUpperCase();
  const caret = <View style={{ width: 2, height: 18, backgroundColor: ink, marginLeft: 2 }} />;
  return (
    <View style={[cardStyles.card, { borderColor: line, backgroundColor: isLight ? "#ffffff" : "#141418" }]}>
      <View style={[cardStyles.banner, { backgroundColor: field }]}>
        {covers.map((id) => {
          const cover = topicCover(id);
          return (
            <Animated.View key={id} entering={ZoomIn.springify()} style={{ flex: 1 }}>
              {cover
                ? <SmartImage source={cover} style={{ width: "100%", height: "100%" }} />
                : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" }}><Text style={{ color: ink, fontSize: 12, fontWeight: "600" }}>{t(`welcome.topic.${id}`, id)}</Text></View>}
            </Animated.View>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
        <View style={{ marginTop: -36, marginBottom: 8, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          {avatar
            ? <Animated.View key={avatar} entering={ZoomIn.springify()}><SmartImage source={{ uri: avatar }} recyclingKey={avatar} style={[cardStyles.avatar, { borderColor: isLight ? "#fff" : "rgba(0,0,0,0.6)" }]} /></Animated.View>
            : <View style={[cardStyles.avatar, { borderColor: isLight ? "#fff" : "rgba(0,0,0,0.6)", backgroundColor: isLight ? "#e4e4e7" : "#27272a", alignItems: "center", justifyContent: "center" }]}><Text style={{ color: muted, fontSize: 26, fontWeight: "700" }}>{initial}</Text></View>}
          {preview && <View style={[cardStyles.pill, { borderColor: line }]}><Text style={{ color: muted, fontSize: 11 }}>{t("welcome.preview", "Preview")}</Text></View>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 28 }}>
          <Text numberOfLines={1} style={{ color: name ? ink : muted, fontSize: 21, fontWeight: "700", flexShrink: 1 }}>{name || t("welcome.card.name", "Your name")}</Text>
          {typing === "name" && caret}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text numberOfLines={1} style={{ color: muted, fontSize: 14 }}>@{username || "username"}</Text>
          {typing === "username" && caret}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, minHeight: 24 }}>
          {interests.length
            ? interests.slice(0, 6).map((id) => (
              <Animated.View key={id} entering={ZoomIn.springify()} style={[cardStyles.tag, { backgroundColor: field }]}>
                <Text style={{ color: ink, fontSize: 11, fontWeight: "500" }}>{t(`welcome.topic.${id}`, id.charAt(0).toUpperCase() + id.slice(1))}</Text>
              </Animated.View>
            ))
            : <View style={[cardStyles.tag, { borderWidth: 1, borderStyle: "dashed", borderColor: line }]}><Text style={{ color: muted, fontSize: 11 }}>{t("welcome.card.interests", "Your interests")}</Text></View>}
        </View>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
          <Text style={{ color: muted, fontSize: 13 }}><Text key={following} style={{ color: ink, fontWeight: "700" }}>{following}</Text> {t("welcome.card.following", "following")}</Text>
          <Text style={{ color: muted, fontSize: 13 }}><Text style={{ color: ink, fontWeight: "700" }}>0</Text> {t("welcome.card.followers", "followers")}</Text>
        </View>
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: { borderRadius: 28, borderWidth: 1, overflow: "hidden" },
  banner: { height: 92, flexDirection: "row", overflow: "hidden" },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});

function makeStyles(ink: string, muted: string, line: string, field: string) {
  return StyleSheet.create({
    dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12, marginBottom: 18 },
    dot: { height: 6, width: 6, borderRadius: 3 },
    title: { color: ink, fontSize: 26, lineHeight: 32, fontWeight: "700" },
    sub: { color: muted, fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: 18 },
    eyebrow: { color: "#34d399", fontSize: 12, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 12 },
    label: { color: muted, fontSize: 13, fontWeight: "500", marginBottom: 8 },
    field: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: field, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
    fieldText: { flex: 1, color: ink, fontSize: 17, fontWeight: "600" },
    input: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: field, paddingHorizontal: 16, color: ink, fontSize: 20, fontWeight: "600" },
    inputRow: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: field, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6 },
    inputText: { color: ink, fontSize: 20, fontWeight: "600" },
    hint: { color: muted, fontSize: 13, marginTop: 8 },
    ghost: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: field, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    ghostText: { color: ink, fontSize: 15, fontWeight: "500" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: line, backgroundColor: field, paddingHorizontal: 14, paddingVertical: 9 },
    chipText: { color: ink, fontSize: 14, fontWeight: "500" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: field, padding: 12 },
    rowAvatar: { width: 44, height: 44, borderRadius: 22 },
    initial: { alignItems: "center", justifyContent: "center", backgroundColor: field },
    follow: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
    error: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", backgroundColor: "rgba(239,68,68,0.1)" },
    footer: { paddingTop: 24, paddingBottom: 16 },
  });
}

export default SetProfileScreen;
