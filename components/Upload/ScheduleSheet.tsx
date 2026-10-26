import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { NavigationContext } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { appLocale } from "../../libs/date.util";
import { parseWhen } from "../../libs/parseWhen";
import { KitButton, useKitColors } from "../page/PageKit";
import { SEARCH_INPUT_CLEAR, useSearchFieldMaterial } from "../../hooks/useSearchFieldMaterial";

export type ScheduleKind = "post" | "live" | "stage";

interface ScheduleSheetProps {
  visible: boolean;
  onClose: () => void;
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
  title?: string;
  minimumMinutes?: number;
  /** Words on the tips under the time. Defaults to a post. */
  kind?: ScheduleKind;
  /** Moving something already planned: no "Remove schedule", no Planned link. */
  moving?: boolean;
}

const STEP = 15;
const DAYS_SHOWN = 14;
const DAY_WIDTH = 48;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const atMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** The next quarter hour after `minAhead` minutes from now. */
const firstSlot = (minAhead: number) => {
  const d = new Date(Date.now() + Math.max(minAhead, 0) * 60_000 + 60_000);
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes()) / STEP) * STEP;
  return atMinutes(startOfDay(d), m);
};

/**
 * The "When?" sheet for posts, Lives and Stages, matching web's
 * (dehubweb src/features/post/components/ScheduleSheet.tsx): type a time, tap a
 * pick, or choose a day from the strip and step the time. Page-kit chips and
 * buttons so every theme draws it like the rest of the app.
 */
export default function ScheduleSheet({ visible, onClose, scheduledDate, onSchedule, title, minimumMinutes = 0, kind = "post", moving = false }: ScheduleSheetProps) {
  const { t } = useTranslation();
  // Optional: the sheet also opens from modals that sit outside a navigator.
  const navigation = useContext(NavigationContext);
  const c = useKitColors();
  const field = useSearchFieldMaterial();
  const locale = appLocale();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [minutes, setMinutes] = useState(19 * 60 + 30);
  const [typed, setTyped] = useState("");
  const stripRef = useRef<ScrollView>(null);

  // The sheet stays mounted between opens; re-seed from the prop each time.
  useEffect(() => {
    if (!visible) return;
    const when = scheduledDate ?? firstSlot(Math.max(minimumMinutes, 60));
    setDay(startOfDay(when));
    setMinutes(when.getHours() * 60 + when.getMinutes());
    setTyped("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const earliest = Date.now() + minimumMinutes * 60_000;
  const selectedAt = atMinutes(day, minutes);
  const validTime = selectedAt.getTime() > earliest;

  const parsed = useMemo(() => (typed.trim() ? parseWhen(typed) : null), [typed]);
  useEffect(() => {
    if (!parsed) return;
    setDay(startOfDay(parsed.at));
    if (parsed.hasTime) setMinutes(parsed.at.getHours() * 60 + parsed.at.getMinutes());
  }, [parsed]);

  const today = startOfDay(new Date());
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i)), [today.getTime()]);
  const dayIndex = days.findIndex(d => sameDay(d, day));
  useEffect(() => {
    if (!visible || dayIndex < 0) return;
    stripRef.current?.scrollTo({ x: Math.max(0, (dayIndex - 3) * DAY_WIDTH), animated: true });
  }, [visible, dayIndex]);

  const picks = useMemo(() => {
    const now = new Date();
    const nextWeekday = (wd: number) => addDays(today, ((wd - now.getDay() + 7) % 7) || 7);
    const tonight = atMinutes(today, 20 * 60);
    const primeToday = atMinutes(today, 19 * 60 + 30);
    const prime = primeToday.getTime() > earliest ? primeToday : atMinutes(addDays(today, 1), 19 * 60 + 30);
    const friday = now.getDay() === 5 ? atMinutes(addDays(today, 1), 19 * 60) : atMinutes(nextWeekday(5), 19 * 60);
    return [
      tonight.getTime() > earliest
        ? { id: "tonight", label: t("whenSheet.tonight", { defaultValue: "Tonight" }), at: tonight }
        : { id: "soon", label: t("whenSheet.inAnHour", { defaultValue: "In an hour" }), at: firstSlot(Math.max(minimumMinutes, 60)) },
      { id: "tomorrow", label: t("whenSheet.tomorrow", { defaultValue: "Tomorrow" }), at: atMinutes(addDays(today, 1), 9 * 60) },
      { id: "weekend", label: friday.toLocaleDateString(locale, { weekday: "long" }), at: friday },
      { id: "prime", label: t("whenSheet.primeTime", { defaultValue: "Prime time" }), at: prime, prime: true },
    ];
  }, [today.getTime(), earliest, locale, minimumMinutes, t]);

  const timeLabel = (d: Date) => d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const dayLabel = (d: Date) => (sameDay(d, today)
    ? t("whenSheet.today", { defaultValue: "Today" })
    : sameDay(d, addDays(today, 1))
      ? t("whenSheet.tomorrow", { defaultValue: "Tomorrow" })
      : d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }));
  const zone = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? "";
    } catch { return ""; }
  })();

  const choose = (at: Date) => {
    setDay(startOfDay(at));
    setMinutes(at.getHours() * 60 + at.getMinutes());
    setTyped("");
  };
  const step = (delta: number) => choose(atMinutes(day, minutes + delta));

  const handleConfirm = () => {
    if (!validTime) return;
    onSchedule(selectedAt);
    onClose();
  };
  const handleClear = () => {
    onSchedule(null);
    onClose();
  };

  const kindTip = kind === "live"
    ? t("whenSheet.liveTip", { defaultValue: "Your followers can set a reminder. You start the Live yourself when it is time." })
    : kind === "stage"
      ? t("whenSheet.stageTip", { defaultValue: "It goes on the Upcoming shelf straight away, so people can tap Remind me." })
      : null;

  const chip = (active: boolean) => [styles.pick, { backgroundColor: active ? c.activeBg : c.chipBg, borderWidth: c.isMinimal && !active ? 1 : 0, borderColor: c.hairline }];
  const ink = (active: boolean) => ({ color: active ? c.activeInk : "#FFFFFF" });

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="92%" blurIntensity={40}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close", { defaultValue: "Close" })} style={styles.close}>
          <Icon name="X" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.title}>{title ?? t("whenSheet.title", { defaultValue: "When?" })}</Text>
        <View style={styles.close} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={[styles.typeBox, field.surface]}>
          <Icon name="Clock" size={16} color="rgba(255,255,255,0.6)" />
          <TextInput
            value={typed}
            onChangeText={setTyped}
            onFocus={field.onFocus}
            onBlur={field.onBlur}
            placeholder={t("whenSheet.typePlaceholder", { defaultValue: 'Type a time, like "fri 8pm" or "in 2 hours"' })}
            placeholderTextColor="rgba(255,255,255,0.45)"
            accessibilityLabel={t("whenSheet.typeLabel", { defaultValue: "Type a time" })}
            style={[styles.typeInput, SEARCH_INPUT_CLEAR]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>
        {parsed ? (
          <Text style={styles.parsed}>{dayLabel(parsed.at)}{parsed.hasTime ? `, ${timeLabel(parsed.at)}` : ""}</Text>
        ) : typed.trim() ? (
          <Text style={styles.help}>{t("whenSheet.typeHelp", { defaultValue: 'Try "tonight", "tomorrow 9am", "sat noon" or "30 oct 7pm".' })}</Text>
        ) : null}

        <View style={styles.pickGrid}>
          {picks.map(pick => {
            const tooSoon = pick.at.getTime() <= earliest;
            const active = sameDay(pick.at, day) && pick.at.getHours() * 60 + pick.at.getMinutes() === minutes;
            const sub = pick.id === "weekend"
              ? `${pick.at.toLocaleDateString(locale, { day: "numeric", month: "short" })} · ${timeLabel(pick.at)}`
              : pick.id === "prime" ? `${dayLabel(pick.at)} · ${timeLabel(pick.at)}` : timeLabel(pick.at);
            return (
              <Pressable
                key={pick.id}
                onPress={() => choose(pick.at)}
                disabled={tooSoon}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: tooSoon }}
                style={({ pressed }) => [styles.pickCell, { opacity: tooSoon ? 0.4 : pressed ? 0.8 : 1 }]}
              >
                <View style={chip(active)}>
                  <View style={styles.pickTitleRow}>
                    {pick.prime ? <Icon name="Sparkles" size={13} color={ink(active).color} /> : null}
                    <Text style={[styles.pickTitle, ink(active)]}>{pick.label}</Text>
                  </View>
                  <Text style={[styles.pickSub, ink(active)]}>{sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.eyebrow}>{t("whenSheet.orPickDay", { defaultValue: "Or pick a day" }).toUpperCase()}</Text>
        <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {days.map((d, i) => {
            const active = i === dayIndex;
            return (
              <Pressable
                key={d.getTime()}
                onPress={() => { setDay(d); setTyped(""); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.day, { opacity: active ? 1 : 0.55 }]}
              >
                <Text style={styles.dayName}>{i === 0 ? t("whenSheet.today", { defaultValue: "Today" }) : d.toLocaleDateString(locale, { weekday: "short" })}</Text>
                <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.getDate()}</Text>
                {/* "Beam", as on profile tabs: a short glowing line under the pick. */}
                {active ? <View pointerEvents="none" style={styles.beam} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.timeRow}>
          <Pressable onPress={() => step(-STEP)} accessibilityRole="button" accessibilityLabel={t("whenSheet.earlier", { defaultValue: "15 minutes earlier" })} hitSlop={6}>
            <View style={[styles.stepper, { backgroundColor: c.chipBg, borderColor: c.hairline }]}><Icon name="Minus" size={16} color="#FFFFFF" /></View>
          </Pressable>
          <Text style={styles.time}>{timeLabel(selectedAt)}</Text>
          <Pressable onPress={() => step(STEP)} accessibilityRole="button" accessibilityLabel={t("whenSheet.later", { defaultValue: "15 minutes later" })} hitSlop={6}>
            <View style={[styles.stepper, { backgroundColor: c.chipBg, borderColor: c.hairline }]}><Icon name="Plus" size={16} color="#FFFFFF" /></View>
          </Pressable>
        </View>

        {!validTime ? (
          <Text accessibilityRole="alert" style={[styles.note, { color: "#FBBF24" }]}>
            {minimumMinutes > 0
              ? t("whenSheet.tooSoonMin", { defaultValue: "Pick a time at least {{count}} minutes from now.", count: minimumMinutes })
              : t("whenSheet.tooSoon", { defaultValue: "Pick a time in the future." })}
          </Text>
        ) : (
          <Text style={styles.note}>{t("whenSheet.zone", { defaultValue: "Your time ({{zone}}). Everyone else sees it in their own time.", zone })}</Text>
        )}
        {kindTip ? <Text style={styles.note}>{kindTip}</Text> : null}

        <View style={styles.actions}>
          <KitButton
            label={t("whenSheet.scheduleFor", { defaultValue: "Schedule for {{when}}", when: `${dayLabel(day)}, ${timeLabel(selectedAt)}` })}
            onPress={handleConfirm}
            disabled={!validTime}
          />
          {scheduledDate && !moving ? <KitButton variant="quiet" label={t("whenSheet.remove", { defaultValue: "Remove schedule" })} onPress={handleClear} /> : null}
          {!moving && navigation ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                onClose();
                navigation.navigate(ScreenNames.Planned as never);
              }}
              style={styles.plannedLink}
            >
              <Text style={styles.plannedLinkText}>{t("planned.seeAll", { defaultValue: "See everything you have planned" })}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 14, paddingBottom: 10 },
  close: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  body: { paddingHorizontal: 16, paddingBottom: 20, gap: 14 },
  typeBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 10, paddingHorizontal: 12 },
  typeInput: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "500", paddingVertical: 0 },
  parsed: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginTop: -6 },
  help: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: -6 },
  plannedLink: { alignSelf: "center", paddingVertical: 6 },
  plannedLinkText: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  pickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickCell: { width: "48.5%" },
  pick: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  pickTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  pickTitle: { fontSize: 14, fontWeight: "600" },
  pickSub: { fontSize: 12, fontWeight: "500", opacity: 0.7 },
  eyebrow: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600", letterSpacing: 1.3, marginBottom: -6 },
  strip: { gap: 4 },
  day: { width: DAY_WIDTH - 4, alignItems: "center", paddingTop: 6, paddingBottom: 10, gap: 2 },
  dayName: { color: "#FFFFFF", fontSize: 11, fontWeight: "500" },
  dayNum: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  dayNumActive: { fontWeight: "800" },
  beam: { position: "absolute", bottom: 2, left: "30%", right: "30%", height: 3, borderRadius: 3, backgroundColor: "#fff", shadowColor: "#fff", shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  stepper: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  time: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", minWidth: 124, textAlign: "center", fontVariant: ["tabular-nums"] },
  note: { color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center", marginTop: -6 },
  actions: { gap: 8, marginTop: 4 },
});
