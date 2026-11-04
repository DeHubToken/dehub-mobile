import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../../context/AuthContext";
import { toastSuccess } from "../../libs/toast";
import {
  DONE_SNOOZE_MS,
  NOT_NOW_SNOOZE_MS,
  snoozeNonFollowerOffer,
  subscribeNonFollowerOffer,
} from "../../libs/non-follower-streak";
import { getNonFollowerCount, getUnfollowNonFollowersStatus, unfollowAllNonFollowers } from "../../services/user.service";
import NonFollowerOfferSheet, { type NonFollowerOfferStage } from "./NonFollowerOfferSheet";

const POLL_MS = 1500;

/**
 * After two unfollows in a row of people who never followed back, offers to
 * unfollow everyone else who doesn't. Hidden when one or none are left.
 * The server unfollows in the background; this polls progress and shows the
 * result (as a toast if the sheet was closed). Mounted in App.tsx.
 */
export default function NonFollowerOfferHost() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<NonFollowerOfferStage>("offer");
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, failed: 0 });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(false);
  visibleRef.current = visible;

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  useEffect(() => {
    if (!isSignedIn) return;
    return subscribeNonFollowerOffer(async () => {
      try {
        const { count: n, job } = await getNonFollowerCount();
        if (job?.running || n < 2) return;
        setCount(n);
        setStage("offer");
        setProgress({ done: 0, failed: 0 });
        setVisible(true);
      } catch { /* the offer is a nicety; never surface its failure */ }
    });
  }, [isSignedIn]);

  const finish = useCallback((done: number, failed: number) => {
    stopPolling();
    setProgress({ done, failed });
    setStage("done");
    snoozeNonFollowerOffer(DONE_SNOOZE_MS);
    if (!visibleRef.current) {
      toastSuccess(t("follow.nonFollowers.doneToast", { defaultValue: "Unfollowed {{done}} accounts not following you back", done }));
    }
    // Counts, follow buttons and lists all changed under us.
    void queryClient.invalidateQueries({
      predicate: (q) => /follow|profile|account/i.test(String(q.queryKey[0] ?? "")),
    });
  }, [queryClient, t]);

  const poll = useCallback(async () => {
    try {
      const job = await getUnfollowNonFollowersStatus();
      if (!job) { finish(0, 0); return; }
      if (job.total) setCount(job.total);
      setProgress({ done: job.done, failed: job.failed });
      if (!job.running) { finish(job.done, job.failed); return; }
    } catch { /* keep polling; a blip should not end the job on screen */ }
    pollRef.current = setTimeout(() => void poll(), POLL_MS);
  }, [finish]);

  const confirm = async () => {
    setStage("working");
    try {
      const job = await unfollowAllNonFollowers();
      if (job.total) setCount(job.total);
      if (!job.running) { finish(job.done, job.failed); return; }
      pollRef.current = setTimeout(() => void poll(), POLL_MS);
    } catch {
      setStage("error");
    }
  };

  const close = () => {
    // Dismissing the offer counts as Not now.
    if (stage === "offer" || stage === "confirm") snoozeNonFollowerOffer(NOT_NOW_SNOOZE_MS);
    setVisible(false);
  };

  return (
    <NonFollowerOfferSheet
      visible={visible}
      onClose={close}
      stage={stage}
      count={count}
      done={progress.done}
      failed={progress.failed}
      onAsk={() => setStage("confirm")}
      onConfirm={() => void confirm()}
      onBack={() => setStage("offer")}
      onNotNow={close}
    />
  );
}
