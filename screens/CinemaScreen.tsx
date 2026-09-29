/**
 * CinemaScreen
 * ============
 * Native port of the web Cinema page (/cinema and /cinema/:filmType/:filmId):
 * search any film or series and see every legal way to watch it in your
 * country, from the JustWatch partner catalogue.
 *
 * One screen, two modes, like the web route: with no `filmId` it is the
 * search hub; with one it is that title's offers and reviews. Picking a result
 * pushes a new instance with the id, so Back returns to the search as it was.
 *
 * Until the partnership completes the catalogue function answers
 * `configured: false`, and the hub shows the "opening soon" state web does.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import Icon from "../components/ui/Icon";
import TitleCard from "../components/Cinema/TitleCard";
import OfferPanel from "../components/Cinema/OfferPanel";
import FilmReviews from "../components/Cinema/FilmReviews";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { ShareLinks } from "../navigation/linking.config";
import {
  fetchProviders,
  fetchTitleOffers,
  searchTitles,
  JustWatchNotConfiguredError,
  objectTypeFromUrl,
  type ObjectType,
} from "../services/justwatch.service";
import {
  CINEMA_LOCALES,
  DEFAULT_LOCALE,
  countryKey,
  detectLocale,
  localeLabel,
  rememberLocale,
} from "../libs/cinema-locales";

type Nav = NativeStackNavigationProp<AppStackParamList>;

/** Catalogue data is public and slow-moving. A missing partner token is a
 *  deployment state, so retrying it only repeats the same answer. */
const shared = {
  staleTime: 30 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  retry: (count: number, error: unknown) => !(error instanceof JustWatchNotConfiguredError) && count < 2,
} as const;

/** Keeps a burst of keystrokes from becoming a burst of partner API calls. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function CountryPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (locale: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t("cinema.close")} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.sheetTitle}>{t("cinema.country")}</Text>
        <FlatList
          data={CINEMA_LOCALES}
          keyExtractor={(l) => l.locale}
          renderItem={({ item }) => {
            const active = item.locale === selected;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(item.locale)}
                style={[styles.sheetRow, active && styles.sheetRowActive]}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={styles.sheetRowText}>{t(countryKey(item))}</Text>
                {active && <Icon name="Check" size={16} color="#FFFFFF" />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

export default function CinemaScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // The KeyboardAvoidingView is the screen root and wraps the ScreenHeader, so
  // only the root SafeAreaView's inset sits above it. Adding the header height
  // would count it twice.
  const keyboardOffset = useKeyboardOffset();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Cinema>>();
  const filmId = route.params?.filmId ? String(route.params.filmId) : undefined;
  const openObjectType = objectTypeFromUrl(route.params?.filmType);
  const { width } = useWindowDimensions();

  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [localeReady, setLocaleReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<ObjectType>("movie");
  const debounced = useDebounced(query.trim(), 350);

  useEffect(() => {
    let alive = true;
    void detectLocale().then((l) => {
      if (!alive) return;
      setLocale(l);
      setLocaleReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const providers = useQuery({
    queryKey: ["justwatch", "providers", locale],
    queryFn: () => fetchProviders(locale),
    enabled: localeReady,
    ...shared,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const search = useQuery({
    queryKey: ["justwatch", "search", locale, searchType, debounced],
    queryFn: () => searchTitles(debounced, locale, searchType),
    enabled: localeReady && !filmId && debounced.length >= 2,
    ...shared,
    staleTime: 10 * 60 * 1000,
  });
  const offers = useQuery({
    queryKey: ["justwatch", "offers", locale, openObjectType, filmId],
    queryFn: () => fetchTitleOffers(filmId!, locale, openObjectType),
    enabled: localeReady && !!filmId,
    ...shared,
  });

  const notConfigured =
    providers.error instanceof JustWatchNotConfiguredError ||
    search.error instanceof JustWatchNotConfiguredError ||
    offers.error instanceof JustWatchNotConfiguredError;

  const current = localeLabel(locale);
  const countryName = t(countryKey(current));
  const openTitle = offers.data?.title ?? null;
  const results = search.data?.results ?? [];

  const pickLocale = useCallback((l: string) => {
    setLocale(l);
    rememberLocale(l);
    setPickerOpen(false);
  }, []);

  const share = useCallback(() => {
    if (!filmId) return;
    const url = ShareLinks.film(openObjectType, filmId);
    const message = openTitle ? `${t("cinema.shareMessage", { title: openTitle.title })}\n${url}` : url;
    void Share.share({ message, url }).catch(() => {});
  }, [filmId, openObjectType, openTitle, t]);

  const columnWidth = (width - 16 * 2 - 12) / 2;

  const countryButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("cinema.countryLabel", { country: countryName })}
      onPress={() => setPickerOpen(true)}
      style={styles.countryBtn}
    >
      <Text style={styles.flag}>{current.flag}</Text>
      <Text style={styles.countryText} numberOfLines={1}>
        {countryName}
      </Text>
      <Icon name="ChevronDown" size={16} color="#A1A1AA" />
    </Pressable>
  );

  const openingSoon = (
    <View style={styles.soon}>
      <Text style={styles.soonTitle}>{t("cinema.openingSoon")}</Text>
      <Text style={styles.body}>{t("cinema.openingSoonBody")}</Text>
    </View>
  );

  const picker = (
    <CountryPicker visible={pickerOpen} selected={locale} onSelect={pickLocale} onClose={() => setPickerOpen(false)} />
  );

  // ── One title ──
  if (filmId) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScreenHeader
          title={openTitle?.title ?? t("cinema.title")}
          rightContent={
            <Pressable accessibilityRole="button" accessibilityLabel={t("cinema.share")} onPress={share} hitSlop={10} style={styles.headerBtn}>
              <Icon name="Share2" size={20} color="#FFFFFF" />
            </Pressable>
          }
        />
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {notConfigured ? (
            openingSoon
          ) : (
            <>
              <View style={{ marginBottom: 16 }}>{countryButton}</View>
              {offers.isError ? (
                <Text style={styles.body}>{t("cinema.titleUnavailable")}</Text>
              ) : (
                <OfferPanel
                  detail={openTitle}
                  providers={providers.data?.providers ?? []}
                  locale={locale}
                  isLoading={!localeReady || offers.isPending}
                />
              )}
              <FilmReviews justwatchId={filmId} objectType={openObjectType} title={openTitle} />
            </>
          )}
        </ScrollView>
        {picker}
      </KeyboardAvoidingView>
    );
  }

  // ── Search hub ──
  const header = (
    <View>
      <View style={styles.eyebrowRow}>
        <Icon name="Clapperboard" size={14} color="#71717A" />
        <Text style={styles.eyebrow}>{t("cinema.title")}</Text>
      </View>
      <Text style={styles.heroTitle} accessibilityRole="header">
        {t("cinema.heroTitle")}
      </Text>
      <Text style={[styles.body, { marginTop: 10 }]}>{t("cinema.heroBody")}</Text>

      {notConfigured ? (
        <View style={{ marginTop: 24 }}>{openingSoon}</View>
      ) : (
        <View style={{ marginTop: 24, gap: 10 }}>
          <View style={styles.searchBox}>
            <Icon name="Search" size={16} color="#52525B" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchType === "movie" ? t("cinema.searchFilms") : t("cinema.searchSeries")}
              placeholderTextColor="#52525B"
              accessibilityLabel={searchType === "movie" ? t("cinema.searchFilms") : t("cinema.searchSeries")}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          <View style={styles.toggle} accessibilityRole="radiogroup">
            {(["movie", "show"] as ObjectType[]).map((type) => {
              const active = searchType === type;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSearchType(type)}
                  style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {type === "movie" ? t("cinema.films") : t("cinema.seriesPlural")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {countryButton}
          <Text style={styles.small}>{t("cinema.pricesFor", { country: countryName })}</Text>

          <View style={{ marginTop: 8, marginBottom: 12 }}>
            {search.isFetching ? (
              <View style={styles.row}>
                <ActivityIndicator size="small" color="#71717A" />
                <Text style={styles.small}>{t("cinema.searching")}</Text>
              </View>
            ) : search.isError ? (
              <Text style={styles.body}>{t("cinema.searchUnavailable")}</Text>
            ) : debounced.length < 2 ? (
              <Text style={styles.small}>
                {searchType === "movie" ? t("cinema.startTypingFilms") : t("cinema.startTypingSeries")}
              </Text>
            ) : results.length === 0 ? (
              <Text style={styles.body}>{t("cinema.nothingFound", { query: debounced })}</Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("cinema.title")} />
      <FlatList
        data={notConfigured || search.isFetching ? [] : results}
        keyExtractor={(item) => `${item.justwatchId}-${item.title}`}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <TitleCard
            title={item}
            width={columnWidth}
            onPress={() =>
              navigation.push(ScreenNames.Cinema, {
                filmType: searchType === "show" ? "series" : "film",
                filmId: String(item.justwatchId),
              })
            }
          />
        )}
      />
      {picker}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  headerBtn: { padding: 6 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  eyebrow: { color: "#71717A", fontSize: 11, fontWeight: "600", letterSpacing: 2, textTransform: "uppercase" },
  heroTitle: { color: "#FFFFFF", fontSize: 32, lineHeight: 36, fontWeight: "700", letterSpacing: -1.2, marginTop: 12 },
  body: { color: "#A1A1AA", fontSize: 15, lineHeight: 23 },
  small: { color: "#71717A", fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  soon: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 20 },
  soonTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "600", marginBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, paddingVertical: 0 },
  toggle: {
    flexDirection: "row",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 4,
  },
  toggleBtn: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  toggleBtnActive: { backgroundColor: "#FFFFFF" },
  toggleText: { color: "#A1A1AA", fontSize: 14 },
  toggleTextActive: { color: "#000000", fontWeight: "600" },
  countryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 14,
  },
  countryText: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  flag: { fontSize: 18 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: "#0B0C0E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingTop: 16,
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", paddingHorizontal: 20, marginBottom: 8 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  sheetRowActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  sheetRowText: { flex: 1, color: "#FFFFFF", fontSize: 15 },
});
