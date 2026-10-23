import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTranscript } from "../../hooks/useTranscript";
import { lyricAt, lyricLines } from "../../libs/lyrics-lines";
import { KeepDarkScope } from "../../libs/jsx/tone";

/**
 * Lyrics over an audio post's animation, timed to the track. Same source and
 * look as web (src/components/app/audio/AudioLyrics.tsx): the transcript every
 * audio post already gets, each line on its own solid block so it reads over
 * any visualizer style or colour. A track not transcribed yet is started once.
 */
export function AudioLyrics({ tokenId, currentTime, top = 48, bottom = 56 }: { tokenId: string; currentTime: number; top?: number; bottom?: number }) {
  const { t } = useTranslation();
  const { transcript, status, inFlight, canRetry, start } = useTranscript("audio", tokenId);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || inFlight || !canRetry) return;
    if (status !== "absent" && status !== "failed") return;
    asked.current = true;
    start();
  }, [status, inFlight, canRetry, start]);

  const lines = useMemo(() => lyricLines(transcript?.segments), [transcript?.segments]);
  const { current, next } = lyricAt(lines, currentTime);
  const waiting = status === "absent" || inFlight || (status === "failed" && canRetry);
  const message = lines.length ? null : waiting ? t("audioPost.lyricsLoading") : t("audioPost.lyricsNone");

  return (
    <KeepDarkScope>
      <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.root, { top, bottom }]}>
        {message ? (
          <View style={styles.block}><Text style={styles.next}>{message}</Text></View>
        ) : (
          <>
            <View style={styles.block}><Text style={styles.line}>{current ? current.text : "♪"}</Text></View>
            {next && next !== current ? (
              <View style={[styles.block, styles.blockNext]}><Text style={styles.next}>{next.text}</Text></View>
            ) : null}
          </>
        )}
      </View>
    </KeepDarkScope>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", left: 12, right: 12, alignItems: "center", justifyContent: "center", gap: 6, zIndex: 5 },
  block: { maxWidth: "100%", backgroundColor: "rgba(0,0,0,0.86)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  blockNext: { backgroundColor: "rgba(0,0,0,0.62)" },
  line: { color: "#FFFFFF", fontSize: 16, lineHeight: 22, fontWeight: "600", textAlign: "center" },
  next: { color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 18, fontWeight: "500", textAlign: "center" },
});
