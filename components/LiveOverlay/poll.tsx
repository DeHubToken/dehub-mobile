/**
 * Live polls on screen. The twin of dehubweb
 * src/components/app/live/overlay/poll.tsx.
 *
 * Over a viewer's player the options are real buttons; in Live Studio's
 * preview they are a picture. Which one it is comes from PollContext, not from
 * the widget.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import { Glass, withAlpha } from "./premium";
import { useWebSocket } from "../../context/WebSocketContext";
import { getStreamPoll, voteInPoll } from "../../services/live.service";
import { isPollOpen, parsePoll, pollLeaders, pollShares, type LivePoll } from "../../libs/live-overlay/polls";
import { setting } from "../../libs/live-overlay/registry";

export interface PollState {
  poll: LivePoll | null;
  myVote: number | null;
  /** Over the player the options are buttons; the Studio preview is only a picture. */
  interactive: boolean;
  vote?: (option: number) => void;
  voting?: boolean;
  /** Why the last vote did not count, if it did not. */
  problem?: "signIn" | "failed" | null;
}

export const PollContext = createContext<PollState>({ poll: null, myVote: null, interactive: false });

/** The choice made on this device, for the highlight. The API holds the vote itself. */
const myVotes = new Map<string, number>();

/** A newer copy of the same poll, or a different poll altogether. Late, older copies are ignored. */
function newer(current: LivePoll | null, incoming: LivePoll): boolean {
  if (!current || current.id !== incoming.id) return true;
  if (incoming.closed !== current.closed) return incoming.closed;
  return incoming.total >= current.total;
}

/**
 * The stream's current poll, kept up to date from its room — which the player
 * has already joined.
 */
export function useStreamPoll(streamId: string | null | undefined, canVote: boolean): Omit<PollState, "interactive"> {
  const { on } = useWebSocket();
  const [poll, setPoll] = useState<LivePoll | null>(null);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [problem, setProblem] = useState<PollState["problem"]>(null);
  const pollRef = useRef<LivePoll | null>(null);

  const take = useCallback((incoming: LivePoll | null) => {
    if (!incoming || !newer(pollRef.current, incoming)) return;
    if (pollRef.current?.id !== incoming.id) {
      setMyVote(myVotes.get(incoming.id) ?? null);
      setProblem(null);
    }
    pollRef.current = incoming;
    setPoll(incoming);
  }, []);

  useEffect(() => {
    pollRef.current = null;
    setPoll(null);
    setMyVote(null);
    if (!streamId) return;
    let cancelled = false;
    getStreamPoll(streamId)
      .then((p) => {
        if (!cancelled) take(p);
      })
      .catch(() => undefined);
    const off = on("stream.poll", (payload: any) => {
      const p = parsePoll(payload);
      if (p && p.streamId === streamId) take(p);
    });
    return () => {
      cancelled = true;
      if (typeof off === "function") off();
    };
  }, [on, streamId, take]);

  const vote = useCallback(
    (option: number) => {
      const current = pollRef.current;
      if (!streamId || !current || voting || myVote != null || !isPollOpen(current)) return;
      setVoting(true);
      setProblem(null);
      voteInPoll(streamId, current.id, option)
        .then((res) => {
          myVotes.set(current.id, res.myVote);
          setMyVote(res.myVote);
          take(res.poll);
        })
        .catch((err) => {
          const status = (err as { status?: number })?.status;
          if (status === 401) setProblem("signIn");
          else if (status === 400) take({ ...current, closed: true });
          else setProblem("failed");
        })
        .finally(() => setVoting(false));
    },
    [streamId, voting, myVote, take],
  );

  return { poll, myVote, vote: canVote ? vote : undefined, voting, problem };
}

function useSecondsLeft(poll: LivePoll | null): number {
  const left = () => (poll ? Math.max(0, Math.ceil((new Date(poll.endsAt).getTime() - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    setSeconds(left());
    if (!poll || poll.closed) return;
    const id = setInterval(() => setSeconds(left()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll?.id, poll?.endsAt, poll?.closed]);
  return seconds;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function PollWidget({ settings, box }: { settings: Record<string, unknown>; box: { width: number; height: number } }) {
  const { t } = useTranslation();
  const { poll, myVote, interactive, vote, voting, problem } = useContext(PollContext);
  const seconds = useSecondsLeft(poll);
  if (!poll) return null;

  const open = !poll.closed && seconds > 0;
  const shares = pollShares(poll);
  const leaders = pollLeaders(poll);
  const tint = setting(settings, "accent", "#ffffff");
  const color = HEX.test(tint) ? tint : "#ffffff";
  const canTap = interactive && open && myVote == null && !!vote && !voting;
  const row = box.height / (poll.options.length + 2);

  const foot =
    problem === "signIn"
      ? t("liveOverlay.poll.signIn")
      : problem === "failed"
        ? t("liveOverlay.poll.failed")
        : myVote != null
          ? t("liveOverlay.poll.voted", { count: poll.total })
          : t("liveOverlay.poll.votes", { count: poll.total });

  return (
    <Glass radius={row * 0.42} shadow={false} style={{ flex: 1, paddingVertical: row * 0.3, paddingHorizontal: row * 0.4, gap: row * 0.14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: row * 0.3 }}>
        <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: row * 0.46, flexShrink: 1 }}>
          {poll.question}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "600", fontSize: row * 0.46 }}>
          {open ? clock(seconds) : t("liveOverlay.poll.closed")}
        </Text>
      </View>
      <View style={{ flex: 1, gap: row * 0.12 }}>
        {poll.options.map((option, i) => {
          const mine = myVote === i;
          const content = (
            <>
              <LinearGradient
                colors={[withAlpha(color, 0.18), withAlpha(color, 0.42)]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${shares[i]}%` as `${number}%` }}
              />
              <View
                style={{
                  width: row * 0.56,
                  height: row * 0.56,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.16)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: row * 0.32 }}>{i + 1}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: "#fff", fontSize: row * 0.4, fontWeight: !open && leaders.has(i) ? "700" : "400" }}
              >
                {option.text}
              </Text>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: row * 0.4, fontVariant: ["tabular-nums"] }}>{shares[i]}%</Text>
            </>
          );
          const base: ViewStyle = {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: row * 0.25,
            paddingHorizontal: row * 0.3,
            borderRadius: row * 0.28,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.06)",
            boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: mine ? color : "rgba(255,255,255,0.06)",
          };
          return interactive ? (
            <Pressable
              key={i}
              disabled={!canTap}
              onPress={() => vote?.(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: mine, disabled: !canTap }}
              accessibilityLabel={t("liveOverlay.poll.voteFor", { option: option.text })}
              style={({ pressed }) => [base, pressed && canTap ? { backgroundColor: "rgba(255,255,255,0.18)" } : null]}
            >
              {content}
            </Pressable>
          ) : (
            <View key={i} style={base}>
              {content}
            </View>
          );
        })}
      </View>
      <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.62)", fontSize: row * 0.32 }}>
        {foot}
      </Text>
    </Glass>
  );
}
