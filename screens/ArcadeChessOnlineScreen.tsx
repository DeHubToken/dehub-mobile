/**
 * ArcadeChessOnlineScreen
 * =======================
 * Native port of dehubweb's ArcadeChessOnlinePage
 * (`/arcade/kings-gambit/online`): a lobby of open challenges, then the live
 * board.
 *
 * THE SPLIT
 * ---------
 * Same split as the web page, with a WebView where the web has a sandboxed
 * iframe. The board is the vendored King's Gambit build loaded from dehub.io
 * with `#online`, and it never sees a token or a socket. Everything that talks
 * to a server happens here, natively: matchmaking and moves through the
 * `chess-match` edge function, the opponent's moves and the server's verdicts
 * over Supabase Realtime.
 *
 * The game's host bridge was written for both hosts: it posts to
 * `window.ReactNativeWebView` when present and listens for `message` events on
 * `window` and `document`, so messages in are dispatched into the page as
 * MessageEvents carrying `{ source: 'dehub-host', ... }`. Protocol, in short:
 * the frame announces `bridge-ready`, this side answers `start`, `move` comes
 * out after every local move and `opponent-move`, `clock` and `result` go in.
 * A `desync` from the board or a refused move both mean the boards disagree,
 * and the cure is the same: re-`start` from the server's position.
 *
 * The WebView is unmounted while the app is backgrounded (as ArcadeGameScreen
 * does, so a GL loop does not burn a cached process). On return it reloads,
 * announces `bridge-ready` again, and is restarted from a fresh read of the
 * match — which also covers any moves missed while the socket was asleep.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ScreenOrientation from "expo-screen-orientation";
import Icon from "../components/ui/Icon";
import Avatar from "../components/common/Avatar";
import ScreenHeader from "../components/ScreenHeader";
import { ScreenNames } from "../navigation/ScreenNames";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { getAuthToken } from "../libs/auth.utils";
import { openInApp } from "../libs/links.utils";
import { toastError } from "../libs";
import { WEBSITE_LINK } from "../config/links";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { colors } from "../theme/colors";
import {
  useWorkProfile,
  workProfileAvatar,
  workProfileName,
  type WorkProfile,
} from "../hooks/useWorkProfiles";

/** `#online` holds the game's own menu back — the lobby here is the menu. */
const FRAME_URL = `${WEBSITE_LINK}/chess-game/index.html#online`;
const GAME_SOURCE = "chess-game";
const HOST_SOURCE = "dehub-host";

const OPEN_QUERY_KEY = "chess-open-challenges";
const MINE_QUERY_KEY = "chess-my-match";
const RECORDS_QUERY_KEY = "chess-records";
/** Same key web's ArcadeLeaderboard caches the King's Gambit ladder under. */
const LADDER_QUERY_KEY = "arcade-board";
const LADDER_LIMIT = 10;
/** Games before a rating is treated as settled rather than still finding its level. */
const PROVISIONAL_UNDER = 5;
/** Gold, silver, bronze, then nothing — the rank's colour. */
const PODIUM = ["#FCD34D", "#D4D4D8", "#D97706"];
/** Same key useWorkProfile caches under, so a row's lookup is reused here. */
const PROFILE_QUERY_KEY = "work-wallet-profile";

const CLOCK_CHOICES = [5, 10, 15].map((minutes) => minutes * 60_000);

interface ChessMatch {
  id: string;
  status: "open" | "active" | "finished" | "cancelled";
  created_by: string;
  opponent: string | null;
  white_wallet: string | null;
  black_wallet: string | null;
  stake_dhb: number;
  clock_initial_ms: number;
  start_fen: string | null;
  fen: string;
  turn: "w" | "b";
  ply: number;
  white_ms: number | null;
  black_ms: number | null;
  last_move_at: string | null;
  winner: "w" | "b" | null;
  end_reason: string | null;
  created_at: string;
}

interface ChessMoveRow {
  match_id: string;
  ply: number;
  wallet: string;
  from_sq: string;
  to_sq: string;
  promotion: string | null;
  white_ms: number | null;
  black_ms: number | null;
}

interface ChessRecord {
  wallet: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

/** Remaining ms for the side to move, charged for the time since the last
 * move landed — the same arithmetic the edge function settles with. */
function liveClock(match: ChessMatch): { whiteMs: number; blackMs: number } {
  let whiteMs = match.white_ms ?? 0;
  let blackMs = match.black_ms ?? 0;
  if (match.status === "active" && match.last_move_at) {
    const spent = Math.max(0, Date.now() - new Date(match.last_move_at).getTime());
    if (match.turn === "w") whiteMs -= spent;
    else blackMs -= spent;
  }
  return { whiteMs: Math.max(0, whiteMs), blackMs: Math.max(0, blackMs) };
}

async function invokeChess(
  body: Record<string, unknown>,
  wallet: string | null,
): Promise<{ match?: ChessMatch; error?: string }> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["x-dehub-token"] = token;
    if (wallet) headers["x-wallet-address"] = wallet;
  }
  const { data, error } = await supabase.functions.invoke("chess-match", { body, headers });
  if (error) {
    // The function answers errors as JSON with a message worth showing;
    // supabase-js buries the body in the error context.
    try {
      const context = (error as { context?: Response }).context;
      if (context) {
        const parsed = await context.json();
        if (parsed?.error) return { error: String(parsed.error) };
      }
    } catch {
      // Fall through to the generic message.
    }
    return { error: "" };
  }
  return data as { match?: ChessMatch; error?: string };
}

async function readMatch(id: string): Promise<ChessMatch | null> {
  const { data } = await supabase.from("chess_matches").select("*").eq("id", id).maybeSingle();
  return (data as ChessMatch | null) ?? null;
}

function otherPlayer(match: ChessMatch, me: string | null): string | null {
  if (!me) return null;
  return match.created_by === me ? match.opponent : match.created_by;
}

/** One rung of the `chess_ladder()` Elo ladder, the same read web's board makes. */
interface ChessLadderRow {
  wallet: string;
  rating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

async function fetchChessLadder(limit: number): Promise<ChessLadderRow[]> {
  try {
    // Not in the generated types (managed by migration), hence the loose handle.
    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("chess_ladder", { p_limit: limit });
    if (error || !Array.isArray(data)) return [];
    return data as ChessLadderRow[];
  } catch {
    // Until the ladder exists the board is empty rather than the lobby broken.
    return [];
  }
}

// ---------------------------------------------------------------- the lobby

const ChallengeRow = ({
  match,
  record,
  mine,
  busy,
  onJoin,
  onCancel,
}: {
  match: ChessMatch;
  record?: ChessRecord;
  mine: boolean;
  busy: boolean;
  onJoin: (match: ChessMatch) => void;
  onCancel: (match: ChessMatch) => void;
}) => {
  const { t } = useTranslation();
  const profile = useWorkProfile(match.created_by);
  const name = workProfileName(profile, match.created_by);
  const minutes = Math.round(match.clock_initial_ms / 60_000);
  const recordLine =
    !record || record.played === 0
      ? t("arcade.chessOnline.firstBattle")
      : t("arcade.chessOnline.record", { wins: record.wins, losses: record.losses, draws: record.draws });
  return (
    <View style={styles.row}>
      <View style={styles.rowWho}>
        <Avatar uri={workProfileAvatar(profile, 40)} size={40} name={name} />
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
            {mine ? <Text style={styles.rowYou}> {t("arcade.chessOnline.you")}</Text> : null}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {profile?.username ? `@${profile.username} · ` : ""}
            {recordLine}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {t("arcade.chessOnline.minutes", { count: minutes })} ·{" "}
            {match.start_fen ? t("arcade.chessOnline.kingsGambitOpening") : t("arcade.chessOnline.standard")}
          </Text>
        </View>
      </View>
      {mine ? (
        <Pressable
          disabled={busy}
          onPress={() => onCancel(match)}
          style={[styles.rowButton, styles.rowButtonMuted, busy && styles.disabled]}
        >
          <Icon name="X" size={14} color="#D4D4D8" />
          <Text style={styles.rowButtonMutedLabel}>{t("arcade.chessOnline.withdraw")}</Text>
        </Pressable>
      ) : (
        <Pressable
          disabled={busy}
          onPress={() => onJoin(match)}
          style={[styles.rowButton, styles.rowButtonPrimary, busy && styles.disabled]}
        >
          <Icon name="Crown" size={14} color={colors.accentForeground} />
          <Text style={styles.rowButtonPrimaryLabel}>{t("arcade.chessOnline.accept")}</Text>
        </Pressable>
      )}
    </View>
  );
};

// ---------------------------------------------------------------- the ladder

const LadderRow = ({ row, rank, mine }: { row: ChessLadderRow; rank: number; mine: boolean }) => {
  const { t } = useTranslation();
  const profile = useWorkProfile(row.wallet);
  const name = workProfileName(profile, row.wallet);
  return (
    <View style={[styles.ladderRow, mine && styles.ladderRowMine]}>
      <Text style={[styles.ladderRank, { color: PODIUM[rank - 1] ?? "#52525B" }]}>{rank}</Text>
      <Avatar uri={workProfileAvatar(profile, 32)} size={32} name={name} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
          {mine ? <Text style={styles.rowYou}> {t("arcade.chessOnline.you")}</Text> : null}
        </Text>
        <Text style={styles.ladderDetail} numberOfLines={1}>
          {t("arcade.gamesRecord", {
            count: row.played,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
          })}
        </Text>
      </View>
      <View style={styles.ladderValue}>
        <Text style={styles.ladderRating}>{row.rating}</Text>
        {row.played < PROVISIONAL_UNDER ? (
          <Text style={styles.ladderProvisional}>{t("leaderboard.provisional")}</Text>
        ) : null}
      </View>
    </View>
  );
};

/** The top ten of the King's Gambit Elo ladder, as web shows under its lobby. */
const ChessLadder = ({ wallet }: { wallet: string | null }) => {
  const { t } = useTranslation();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [LADDER_QUERY_KEY, "kings-gambit", LADDER_LIMIT],
    queryFn: () => fetchChessLadder(LADDER_LIMIT),
    // The ladder replays every finished match per call; a minute stale is fine.
    staleTime: 60_000,
  });
  return (
    <View style={styles.ladder}>
      <View style={styles.ladderHead}>
        <Icon name="Trophy" size={18} color="#A1A1AA" />
        <Text style={styles.sectionTitle}>{t("arcade.kingsGambitBoardTitle")}</Text>
      </View>
      <Text style={styles.ladderBlurb}>{t("arcade.kingsGambitBoardBlurb")}</Text>
      {isLoading ? (
        [0, 1, 2].map((i) => <View key={i} style={styles.ladderSkeleton} />)
      ) : rows.length === 0 ? (
        <View style={styles.ladderEmpty}>
          <Text style={styles.ladderEmptyText}>{t("arcade.kingsGambitBoardEmpty")}</Text>
        </View>
      ) : (
        rows.map((row, index) => (
          <LadderRow key={row.wallet} row={row} rank={index + 1} mine={Boolean(wallet) && row.wallet === wallet} />
        ))
      )}
    </View>
  );
};

// ----------------------------------------------------------------- the screen

const ArcadeChessOnlineScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const wallet = user?.walletAddress?.toLowerCase() ?? null;

  const [match, setMatch] = useState<ChessMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [clockMs, setClockMs] = useState<number>(CLOCK_CHOICES[1]);
  const [variant, setVariant] = useState<"standard" | "kings-gambit">("kings-gambit");

  const webRef = useRef<WebView>(null);
  /** Bumped on every `bridge-ready`, so a reloaded board is started again. */
  const [frameEpoch, setFrameEpoch] = useState(0);
  const startedEpoch = useRef(0);
  /** Last ply relayed into the board, so a Realtime replay is not a repeat. */
  const relayedPly = useRef(-1);
  /** Throttles flag claims: one call per fallen flag, not one per tick. */
  const claimedAt = useRef(0);
  const [suspended, setSuspended] = useState(false);

  const inMatch = match !== null && match.status !== "cancelled";

  const serverError = useCallback(
    (message?: string) => toastError(message || t("arcade.chessOnline.serverDidNotAnswer")),
    [t],
  );

  // ------------------------------------------------------------- lobby data
  const { data: openChallenges = [], isLoading: lobbyLoading } = useQuery({
    queryKey: [OPEN_QUERY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chess_matches")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as ChessMatch[];
    },
    enabled: !inMatch,
    staleTime: 10_000,
  });

  // A live match of mine, from a previous visit or another device.
  const { data: myLiveMatch } = useQuery({
    queryKey: [MINE_QUERY_KEY, wallet],
    queryFn: async () => {
      if (!wallet) return null;
      const { data, error } = await supabase
        .from("chess_matches")
        .select("*")
        .in("status", ["open", "active"])
        .or(`created_by.eq.${wallet},opponent.eq.${wallet}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ChessMatch | null) ?? null;
    },
    enabled: !!wallet && !inMatch,
    staleTime: 10_000,
  });

  const lobbyWallets = useMemo(() => {
    const set = new Set<string>();
    for (const challenge of openChallenges) set.add(challenge.created_by);
    return [...set].sort();
  }, [openChallenges]);

  const { data: recordRows } = useQuery({
    queryKey: [RECORDS_QUERY_KEY, lobbyWallets.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("chess_records").select("*").in("wallet", lobbyWallets);
      if (error) throw error;
      return (data || []) as ChessRecord[];
    },
    enabled: lobbyWallets.length > 0,
    staleTime: 30_000,
  });
  const records = useMemo(() => {
    const map: Record<string, ChessRecord> = {};
    for (const row of recordRows ?? []) map[row.wallet] = row;
    return map;
  }, [recordRows]);

  // The other seat, for the "return to the board" line and the board's name tag.
  const liveOpponent = useWorkProfile(myLiveMatch ? otherPlayer(myLiveMatch, wallet) : null);
  const matchOpponentWallet = match ? otherPlayer(match, wallet) : null;
  useWorkProfile(matchOpponentWallet);

  // Keep the lobby honest while it is on screen. Every move in every running
  // game is an UPDATE on this table and none of them changes the lobby, so an
  // active row with ply > 0 is skipped; the rest coalesce into one refetch.
  useEffect(() => {
    if (inMatch) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let recordsDirty = false;
    const flush = () => {
      timer = null;
      void queryClient.invalidateQueries({ queryKey: [OPEN_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [MINE_QUERY_KEY] });
      if (recordsDirty) {
        recordsDirty = false;
        void queryClient.invalidateQueries({ queryKey: [RECORDS_QUERY_KEY] });
      }
    };
    const channel = supabase
      .channel("chess-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "chess_matches" }, (payload) => {
        const row = payload.new as Partial<ChessMatch> | undefined;
        if (payload.eventType === "UPDATE" && row?.status === "active" && (row.ply ?? 0) > 0) return;
        if (payload.eventType === "UPDATE" && row?.status === "finished") recordsDirty = true;
        if (!timer) timer = setTimeout(flush, 1000);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [inMatch, queryClient]);

  // ------------------------------------------------------- board messaging
  const postToFrame = useCallback((message: Record<string, unknown>) => {
    const data = JSON.stringify({ source: HOST_SOURCE, ...message });
    webRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:${data}})); true;`,
    );
  }, []);

  /** (Re)start the board from the match as the server tells it. */
  const startFrame = useCallback(
    (current: ChessMatch) => {
      if (!wallet) return;
      const color = current.white_wallet === wallet ? "w" : "b";
      const opponentWallet = current.white_wallet === wallet ? current.black_wallet : current.white_wallet;
      const opponentProfile = opponentWallet
        ? (queryClient.getQueryData([PROFILE_QUERY_KEY, opponentWallet]) as WorkProfile | undefined)
        : undefined;
      const clocks = liveClock(current);
      postToFrame({
        type: "start",
        color,
        clockMs: current.clock_initial_ms,
        fen: current.ply > 0 ? current.fen : current.start_fen ?? undefined,
        opponent: workProfileName(opponentProfile, opponentWallet),
      });
      postToFrame({ type: "clock", whiteMs: clocks.whiteMs, blackMs: clocks.blackMs });
      relayedPly.current = current.ply - 1;
    },
    [postToFrame, queryClient, wallet],
  );

  const resync = useCallback(
    async (id: string) => {
      const fresh = await readMatch(id);
      if (!fresh) return;
      setMatch(fresh);
      if (fresh.status === "active" || fresh.status === "finished") startFrame(fresh);
      if (fresh.status === "finished") postToFrame({ type: "result", winner: fresh.winner, reason: fresh.end_reason });
    },
    [postToFrame, startFrame],
  );

  // Hand the board over once it has announced itself and the match is live.
  // A reloaded board (after the app was backgrounded) announces itself again
  // and is started from a fresh read, not from what this side remembers.
  useEffect(() => {
    if (!match || frameEpoch === 0 || startedEpoch.current === frameEpoch) return;
    if (match.status !== "active" && match.status !== "finished") return;
    startedEpoch.current = frameEpoch;
    void resync(match.id);
  }, [frameEpoch, match, resync]);

  const onFrameMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: { source?: string; type?: string; [key: string]: unknown };
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!data || data.source !== GAME_SOURCE) return;
      if (data.type === "bridge-ready") {
        setFrameEpoch((n) => n + 1);
        return;
      }
      if (data.type === "exit") {
        setMatch(null);
        return;
      }
      if (!match) return;
      if (data.type === "move") {
        void (async () => {
          const result = await invokeChess(
            { action: "move", matchId: match.id, from: data.from, to: data.to, promotion: data.promotion ?? undefined },
            wallet,
          );
          if (result.match) {
            setMatch(result.match);
            const clocks = liveClock(result.match);
            postToFrame({ type: "clock", whiteMs: clocks.whiteMs, blackMs: clocks.blackMs });
            relayedPly.current = result.match.ply - 1;
            if (result.match.status === "finished") {
              postToFrame({ type: "result", winner: result.match.winner, reason: result.match.end_reason });
            }
          } else {
            // The server refused a move the board believed in: the server wins.
            serverError(result.error);
            await resync(match.id);
          }
        })();
        return;
      }
      if (data.type === "resign") {
        void invokeChess({ action: "resign", matchId: match.id }, wallet).then((result) => {
          if (result.match) setMatch(result.match);
        });
        return;
      }
      if (data.type === "desync") void resync(match.id);
      // 'game-ended' is deliberately unused: the board's opinion is not a
      // verdict. Every ending arrives from the server.
    },
    [match, postToFrame, resync, serverError, wallet],
  );

  // The match feed: the opponent's moves and the server's verdicts.
  useEffect(() => {
    if (!match?.id || !wallet) return;
    const channel = supabase
      .channel(`chess-match-${match.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chess_moves", filter: `match_id=eq.${match.id}` },
        (payload) => {
          const row = payload.new as ChessMoveRow;
          if (row.ply <= relayedPly.current) return;
          relayedPly.current = row.ply;
          if (row.wallet === wallet) return;
          postToFrame({ type: "opponent-move", from: row.from_sq, to: row.to_sq, promotion: row.promotion ?? undefined });
          if (row.white_ms !== null && row.black_ms !== null) {
            postToFrame({ type: "clock", whiteMs: row.white_ms, blackMs: row.black_ms });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chess_matches", filter: `id=eq.${match.id}` },
        (payload) => {
          const next = payload.new as ChessMatch;
          setMatch((current) => (current && current.id === next.id ? next : current));
          if (next.status === "finished") {
            postToFrame({ type: "result", winner: next.winner, reason: next.end_reason });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [match?.id, postToFrame, wallet]);

  // The flag watch. The server is the only judge, but somebody has to ask:
  // when the opponent's clock has been dry for two seconds, claim it.
  useEffect(() => {
    if (!match || match.status !== "active" || !wallet) return;
    const myColor = match.white_wallet === wallet ? "w" : "b";
    if (match.turn === myColor) return;
    const timer = setInterval(() => {
      const clocks = liveClock(match);
      const opponentMs = match.turn === "w" ? clocks.whiteMs : clocks.blackMs;
      const dryForMs = match.last_move_at
        ? Date.now() -
          new Date(match.last_move_at).getTime() -
          (match.turn === "w" ? match.white_ms ?? 0 : match.black_ms ?? 0)
        : 0;
      if (opponentMs > 0 || dryForMs < 2000) return;
      if (Date.now() - claimedAt.current < 10_000) return;
      claimedAt.current = Date.now();
      void invokeChess({ action: "claim-timeout", matchId: match.id }, wallet).then((result) => {
        if (result.match) setMatch(result.match);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [match, wallet]);

  // Unmount the board while backgrounded; it restarts from the server on return.
  useEffect(() => {
    if (!inMatch) return;
    const sub = AppState.addEventListener("change", (state) => setSuspended(state === "background"));
    return () => sub.remove();
  }, [inMatch]);

  // The board is worth the whole screen in either orientation while a match
  // is up; the rest of the app stays portrait.
  useEffect(() => {
    if (!inMatch) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [inMatch]);

  // Every way out of a match (hardware back, the exit, the edge swipe) goes
  // back to the lobby rather than off the screen. The match carries on on the
  // server and the lobby offers the way back to it.
  useEffect(() => {
    if (!inMatch) return;
    return navigation.addListener("beforeRemove", (e: any) => {
      e.preventDefault();
      setMatch(null);
    });
  }, [inMatch, navigation]);

  // ------------------------------------------------------------- actions
  const enterMatch = useCallback((next: ChessMatch) => {
    setFrameEpoch(0);
    startedEpoch.current = 0;
    relayedPly.current = -1;
    setMatch(next);
  }, []);

  const createChallenge = useCallback(async () => {
    setBusy(true);
    const result = await invokeChess({ action: "create", clockMs, variant, stakeDhb: 0 }, wallet);
    setBusy(false);
    if (result.match) enterMatch(result.match);
    else serverError(result.error);
  }, [clockMs, enterMatch, serverError, variant, wallet]);

  const joinChallenge = useCallback(
    async (target: ChessMatch) => {
      setBusy(true);
      const result = await invokeChess({ action: "join", matchId: target.id }, wallet);
      setBusy(false);
      if (result.match) enterMatch(result.match);
      else {
        serverError(result.error);
        void queryClient.invalidateQueries({ queryKey: [OPEN_QUERY_KEY] });
      }
    },
    [enterMatch, queryClient, serverError, wallet],
  );

  const cancelChallenge = useCallback(
    async (target: ChessMatch) => {
      setBusy(true);
      const result = await invokeChess({ action: "cancel", matchId: target.id }, wallet);
      setBusy(false);
      if (!result.match && result.error !== undefined) serverError(result.error);
      if (match?.id === target.id) setMatch(null);
      void queryClient.invalidateQueries({ queryKey: [OPEN_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [MINE_QUERY_KEY] });
    },
    [match?.id, queryClient, serverError, wallet],
  );

  const leaveScreen = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace(ScreenNames.Arcade);
  }, [navigation]);

  const onShouldStartLoadWithRequest = useCallback((req: WebViewNavigation) => {
    if (req.url.startsWith(`${WEBSITE_LINK}/`) || req.url === WEBSITE_LINK) return true;
    if (/^https?:\/\//i.test(req.url)) {
      openInApp(req.url);
      return false;
    }
    return true;
  }, []);

  // ------------------------------------------------------------- rendering
  if (inMatch && match) {
    const waiting = match.status === "open";
    const finished = match.status === "finished";
    return (
      <View style={styles.matchScreen}>
        <StatusBar hidden />
        {suspended ? (
          <View style={styles.web} />
        ) : (
          <WebView
            ref={webRef}
            source={{ uri: FRAME_URL }}
            style={styles.web}
            containerStyle={styles.web}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            androidLayerType="hardware"
            domStorageEnabled
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            setSupportMultipleWindows={false}
            cacheEnabled
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onMessage={onFrameMessage}
          />
        )}

        <Pressable
          onPress={() => setMatch(null)}
          accessibilityRole="button"
          accessibilityLabel={t("arcade.chessOnline.backToLobby")}
          hitSlop={12}
          style={styles.exit}
        >
          <Icon name="ChevronLeft" size={20} color="#FFFFFF" />
        </Pressable>

        {waiting ? (
          <View style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.waitingPill}>
              <ActivityIndicator size="small" color="#D4D4D8" />
              <Text style={styles.waitingText}>{t("arcade.chessOnline.waiting")}</Text>
              <Pressable
                disabled={busy}
                onPress={() => void cancelChallenge(match)}
                style={[styles.pillButton, busy && styles.disabled]}
              >
                <Text style={styles.pillButtonLabel}>{t("arcade.chessOnline.withdraw")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {finished ? (
          <View style={styles.bottomBar} pointerEvents="box-none">
            <Pressable onPress={() => setMatch(null)} style={styles.lobbyButton}>
              <Text style={styles.lobbyButtonLabel}>{t("arcade.chessOnline.backToLobby")}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("arcade.chessOnline.title")} onBackPress={leaveScreen} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          {DIGITAL_PURCHASES_ENABLED ? t("arcade.chessOnlineIntro") : t("arcade.chessOnline.intro")}
        </Text>
        <Pressable
          onPress={() => navigation.navigate(ScreenNames.ArcadeGame, { slug: "kings-gambit" })}
          hitSlop={8}
        >
          <Text style={styles.link}>{t("arcade.chessOnline.playComputer")}</Text>
        </Pressable>

        {!wallet ? (
          <View style={styles.card}>
            <Text style={styles.signInTitle}>{t("arcade.chessOnline.signInTitle")}</Text>
            <Text style={styles.signInBody}>{t("arcade.chessOnline.signInBody")}</Text>
          </View>
        ) : (
          <>
            {myLiveMatch ? (
              <Pressable onPress={() => enterMatch(myLiveMatch)} style={styles.resume}>
                <Text style={styles.resumeTitle}>
                  {myLiveMatch.status === "active"
                    ? t("arcade.chessOnline.battleUnderway", {
                        name: workProfileName(liveOpponent, otherPlayer(myLiveMatch, wallet)),
                      })
                    : t("arcade.chessOnline.challengeStillOpen")}
                </Text>
                <Text style={styles.resumeAction}>{t("arcade.chessOnline.returnToBoard")}</Text>
              </Pressable>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("arcade.chessOnline.openChallengeTitle")}</Text>
              <View style={styles.chips}>
                {CLOCK_CHOICES.map((ms) => (
                  <Pressable
                    key={ms}
                    onPress={() => setClockMs(ms)}
                    style={[styles.chip, clockMs === ms && styles.chipOn]}
                  >
                    <Text style={[styles.chipLabel, clockMs === ms && styles.chipLabelOn]}>
                      {t("arcade.chessOnline.minutes", { count: ms / 60_000 })}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setVariant(variant === "kings-gambit" ? "standard" : "kings-gambit")}
                  style={[styles.chip, variant === "kings-gambit" && styles.chipOn]}
                >
                  <Text style={[styles.chipLabel, variant === "kings-gambit" && styles.chipLabelOn]}>
                    {t("arcade.chessOnline.kingsGambitOpening")}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                disabled={busy}
                onPress={() => void createChallenge()}
                style={[styles.primary, busy && styles.disabled]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accentForeground} />
                ) : (
                  <Icon name="Plus" size={14} color={colors.accentForeground} />
                )}
                <Text style={styles.primaryLabel}>{t("arcade.chessOnline.openTheChallenge")}</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, styles.listTitle]}>{t("arcade.chessOnline.openChallenges")}</Text>
            {lobbyLoading ? (
              <Text style={styles.muted}>{t("arcade.chessOnline.loadingLobby")}</Text>
            ) : openChallenges.length === 0 ? (
              <Text style={styles.muted}>{t("arcade.chessOnline.noChallenges")}</Text>
            ) : (
              openChallenges.map((challenge) => (
                <ChallengeRow
                  key={challenge.id}
                  match={challenge}
                  record={records[challenge.created_by]}
                  mine={challenge.created_by === wallet}
                  busy={busy}
                  onJoin={(target) => void joinChallenge(target)}
                  onCancel={(target) => void cancelChallenge(target)}
                />
              ))
            )}
          </>
        )}

        {/* Outside the sign-in gate, as on web: the ladder is the reason to sign in. */}
        <ChessLadder wallet={wallet} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.neutrals[900] },
  content: { paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  intro: { color: "#A1A1AA", fontSize: 12, lineHeight: 18, paddingHorizontal: 2 },
  link: { color: "#A1A1AA", fontSize: 12, textDecorationLine: "underline", paddingHorizontal: 2 },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  signInTitle: { color: "#D4D4D8", fontSize: 14, textAlign: "center" },
  signInBody: { color: "#71717A", fontSize: 12, textAlign: "center" },
  resume: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    gap: 4,
  },
  resumeTitle: { color: "#FDE68A", fontSize: 14, fontWeight: "500" },
  resumeAction: { color: "#FBBF24", fontSize: 12, fontWeight: "600" },
  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  listTitle: { marginTop: 8, paddingHorizontal: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#27272A" },
  chipOn: { backgroundColor: "#FFFFFF" },
  chipLabel: { color: "#D4D4D8", fontSize: 12, fontWeight: "600" },
  chipLabelOn: { color: "#000000" },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: colors.accent,
  },
  primaryLabel: { color: colors.accentForeground, fontSize: 12, fontWeight: "600" },
  muted: { color: "#71717A", fontSize: 12, paddingHorizontal: 2 },
  disabled: { opacity: 0.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowWho: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  rowYou: { color: "#71717A", fontSize: 10, fontWeight: "400" },
  rowMeta: { color: "#71717A", fontSize: 12 },
  rowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowButtonMuted: { backgroundColor: "#27272A" },
  rowButtonMutedLabel: { color: "#D4D4D8", fontSize: 12, fontWeight: "600" },
  rowButtonPrimary: { backgroundColor: colors.accent },
  rowButtonPrimaryLabel: { color: colors.accentForeground, fontSize: 12, fontWeight: "600" },
  ladder: { marginTop: 18, gap: 6 },
  ladderHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  ladderBlurb: { color: "#71717A", fontSize: 11, lineHeight: 16, paddingHorizontal: 2, marginBottom: 2 },
  ladderEmpty: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 22, backgroundColor: "#18181B" },
  ladderEmptyText: { color: "#71717A", fontSize: 12, textAlign: "center" },
  ladderSkeleton: { height: 52, borderRadius: 12, backgroundColor: "#18181B" },
  ladderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ladderRowMine: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.2)" },
  ladderRank: { width: 22, textAlign: "center", fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  ladderDetail: { color: "#71717A", fontSize: 11 },
  ladderValue: { alignItems: "flex-end" },
  ladderRating: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  ladderProvisional: { color: "#52525B", fontSize: 10 },
  matchScreen: { flex: 1, backgroundColor: "#000" },
  web: { flex: 1, backgroundColor: "#000" },
  exit: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 28, alignItems: "center" },
  waitingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: "rgba(24,24,27,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  waitingText: { color: "#D4D4D8", fontSize: 12 },
  pillButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#27272A" },
  pillButtonLabel: { color: "#E4E4E7", fontSize: 12, fontWeight: "600" },
  lobbyButton: { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9, backgroundColor: "#FFFFFF" },
  lobbyButtonLabel: { color: "#000000", fontSize: 12, fontWeight: "600" },
});

export default ArcadeChessOnlineScreen;
