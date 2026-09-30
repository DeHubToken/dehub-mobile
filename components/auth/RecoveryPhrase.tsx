import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { copySecretToClipboard } from "../../libs/clipboard.utils";
import { AUTH_RADIUS, AuthButton, AuthErrorNotice, AuthTextButton, authColors, authText } from "./AuthControls";

/**
 * The recovery-phrase pieces shared by sign-up (WalletSetupScreen) and
 * Settings → Back up wallet: the numbered grid, the three warnings, and the
 * one-word check. Callers own useSecureScreen — both already block
 * screenshots for the whole sheet.
 */

export function splitPhrase(phrase: string): string[] {
  return phrase.trim().split(/\s+/).filter(Boolean);
}

export type PhraseCheck = { index: number; choices: string[] };

/**
 * One "tap word #N" question with three choices: the right word and two other
 * words from the same phrase, so a guess from the wordlist is no easier than
 * a guess from the grid. `random` is injectable for tests.
 */
export function buildPhraseCheck(words: string[], random: () => number = Math.random): PhraseCheck | null {
  const distinct = Array.from(new Set(words));
  if (words.length < 3 || distinct.length < 3) return null;
  const index = Math.floor(random() * words.length);
  const answer = words[index];
  const others = distinct.filter((w) => w !== answer);
  const decoys: string[] = [];
  while (decoys.length < 2) {
    const pick = others.splice(Math.floor(random() * others.length), 1)[0];
    decoys.push(pick);
  }
  const choices = [answer, ...decoys];
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { index, choices };
}

/** Numbered two-column grid, masked until the reader taps it, with a copy button. */
export const RecoveryPhraseGrid: React.FC<{
  phrase: string;
  disabled?: boolean;
  /** Called each time the words are uncovered. */
  onReveal?: () => void;
}> = memo(
  ({ phrase, disabled, onReveal }) => {
    const { t } = useTranslation();
    const words = useMemo(() => splitPhrase(phrase), [phrase]);
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // A new phrase starts hidden again.
    useEffect(() => {
      setRevealed(false);
      setCopied(false);
      setCopyError(null);
    }, [phrase]);

    useEffect(
      () => () => {
        if (timer.current) clearTimeout(timer.current);
      },
      []
    );

    const handleCopy = useCallback(async () => {
      try {
        await copySecretToClipboard(words.join(" "));
        setCopyError(null);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopyError(t("walletSetup.couldNotCopy"));
      }
    }, [words, t]);

    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (!revealed) onReveal?.();
            setRevealed(!revealed);
          }}
          accessibilityRole="button"
          accessibilityLabel={revealed ? t("walletBackup.hideWords") : t("walletBackup.tapToReveal")}
          style={styles.phraseCard}
        >
          {words.map((word, i) => (
            <View key={`${i}-${word}`} style={[styles.phraseWord, !revealed && styles.phraseWordHidden]}>
              <Text style={styles.phraseIndex}>{i + 1}</Text>
              <Text style={[styles.phraseText, !revealed && styles.phraseMasked]}>
                {revealed ? word : "•••••"}
              </Text>
            </View>
          ))}
          {!revealed && (
            <View style={styles.revealOverlay} pointerEvents="none">
              <Ionicons name="eye-outline" size={22} color={authColors.label} />
              <Text style={styles.revealLabel}>{t("walletBackup.tapToReveal")}</Text>
            </View>
          )}
        </TouchableOpacity>

        <AuthButton
          icon={copied ? "checkmark" : "copy-outline"}
          label={copied ? t("walletBackup.copied") : t("walletSetup.copyPhrase")}
          onPress={handleCopy}
          disabled={disabled}
          style={{ marginTop: 12 }}
        />
        <AuthErrorNotice message={copyError} style={{ marginTop: 12 }} />
      </View>
    );
  }
);
RecoveryPhraseGrid.displayName = "RecoveryPhraseGrid";

/** The three rules, one line each. */
export const RecoveryPhraseWarnings: React.FC = memo(() => {
  const { t } = useTranslation();
  return (
    <View style={{ marginTop: 16, gap: 6 }}>
      {(["warnOwns", "warnNeverAsk", "warnPaper"] as const).map((key) => (
        <View key={key} style={styles.warningRow}>
          <Ionicons name="alert-circle-outline" size={14} color={authColors.muted} style={{ marginTop: 2 }} />
          <Text style={[authText.caption, { flex: 1 }]}>{t(`walletBackup.${key}`)}</Text>
        </View>
      ))}
    </View>
  );
});
RecoveryPhraseWarnings.displayName = "RecoveryPhraseWarnings";

/** "Tap word #N" from three choices. A wrong tap says so and lets them try again. */
export const RecoveryPhraseCheck: React.FC<{
  phrase: string;
  onPassed: () => void;
  onSkip: () => void;
  busy?: boolean;
}> = memo(({ phrase, onPassed, onSkip, busy }) => {
  const { t } = useTranslation();
  const words = useMemo(() => splitPhrase(phrase), [phrase]);
  const check = useMemo(() => buildPhraseCheck(words), [words]);
  const [wrong, setWrong] = useState<string | null>(null);

  // A phrase too short to quiz has nothing to ask; let them carry on.
  if (!check) {
    return <AuthButton variant="primary" label={t("common.done")} onPress={onPassed} loading={busy} />;
  }
  const n = check.index + 1;

  return (
    <View>
      <Text style={[authText.body, { marginBottom: 16 }]}>{t("walletBackup.checkPrompt", { n })}</Text>
      <View style={{ gap: 10 }}>
        {check.choices.map((choice) => (
          <AuthButton
            key={choice}
            label={choice}
            variant={wrong === choice ? "ghost" : "secondary"}
            disabled={busy}
            onPress={() => {
              if (choice === words[check.index]) {
                setWrong(null);
                onPassed();
              } else {
                setWrong(choice);
              }
            }}
          />
        ))}
      </View>
      <AuthErrorNotice message={wrong ? t("walletBackup.checkWrong", { n }) : null} style={{ marginTop: 12 }} />
      <AuthTextButton label={t("walletBackup.skipCheck")} onPress={onSkip} disabled={busy} style={{ marginTop: 8 }} />
    </View>
  );
});
RecoveryPhraseCheck.displayName = "RecoveryPhraseCheck";

const styles = StyleSheet.create({
  // Two columns of numbered words: numbering is what makes a phrase
  // transcribable without losing your place, and what makes a wrong order
  // obvious when it is typed back in.
  phraseCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    borderRadius: AUTH_RADIUS,
    backgroundColor: authColors.field,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
    overflow: "hidden",
  },
  phraseWord: {
    width: "50%",
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  phraseIndex: {
    color: authColors.subtle,
    fontSize: 12,
    minWidth: 16,
    textAlign: "right",
  },
  phraseText: {
    color: authColors.label,
    fontSize: 15,
    fontWeight: "600",
  },
  // Kept in the layout so the card doesn't jump on reveal, but invisible so
  // the "Tap to reveal" label isn't drawn over the placeholder rows.
  phraseWordHidden: {
    opacity: 0,
  },
  phraseMasked: {
    color: authColors.subtle,
    letterSpacing: 1,
  },
  revealOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: authColors.surface,
  },
  revealLabel: {
    color: authColors.label,
    fontSize: 14,
    fontWeight: "600",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
});
