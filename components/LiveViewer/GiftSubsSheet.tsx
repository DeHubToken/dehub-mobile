/**
 * Gift subscriptions from a live: one of the creator's plans for a named
 * person, or for N people picked at random from the stream's chat. The app
 * side of web's GiftSubsDrawer, with the same three legs: the API fixes the
 * recipients and the price, the wallet sends the DHB, the API reads the
 * transfer off the chain and only then grants them.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ethers } from "ethers";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useCreatorPlans } from "../../hooks/useCreatorPlans";
import { buildContract, useWeb3Provider } from "../../hooks/use-web3";
import { useAuthActions } from "../../context/AuthContext";
import { writeContractAA } from "../../libs/aa.write";
import { parseTxError } from "../../libs/web3.util";
import { toastError, toastInfo, toastSuccess } from "../../libs/toast";
import ERC20_ABI from "../../config/abis/erc20.json";
import { planPrice, type SubscriptionPlan } from "../../services/subscription.service";
import {
  clearPendingGift,
  confirmSubscriptionGift,
  quoteSubscriptionGift,
  reconcilePendingGifts,
  rememberPendingGift,
  type GiftResult,
} from "../../services/live-hype.service";

const COUNTS = [1, 5, 10, 20, 50, 100] as const;
type Stage = "idle" | "preparing" | "wallet" | "confirming" | "recording";

interface Props {
  visible: boolean;
  onClose: () => void;
  creatorAddress: string;
  creatorName?: string;
  /** The live stream random gifts go to. */
  streamId?: string | null;
}

const planKey = (p: SubscriptionPlan) => String((p as any).id || (p as any)._id);

export default function GiftSubsSheet({ visible, onClose, creatorAddress, creatorName, streamId }: Props) {
  const { t } = useTranslation();
  const { publishedPlans, isLoading } = useCreatorPlans(visible ? creatorAddress : null);
  const buyable = useMemo(() => publishedPlans.filter((p: any) => p.isActive !== false), [publishedPlans]);
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = buyable.find((p) => planKey(p) === planId) ?? buyable[0];
  const [mode, setMode] = useState<"random" | "user">(streamId ? "random" : "user");
  const [count, setCount] = useState<number>(5);
  const [recipient, setRecipient] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const { requireAuth, switchChain } = useAuthActions();
  const { chainId, provider } = useWeb3Provider();

  useEffect(() => {
    if (visible) void reconcilePendingGifts();
  }, [visible]);

  const unit = plan ? planPrice(plan) ?? 0 : 0;
  const n = mode === "random" ? count : 1;
  const busy = stage !== "idle";
  const canSend = !!plan && !busy && (mode === "random" ? !!streamId : recipient.trim().length > 1);

  const send = () => requireAuth(async () => {
    if (!plan) return;
    let result: GiftResult | null = null;
    try {
      setStage("preparing");
      const quote = await quoteSubscriptionGift(
        planKey(plan),
        mode === "random" ? { count, streamId: streamId || "" } : { recipient: recipient.trim().replace(/^@/, "") },
      );
      if (!quote.giftId || !quote.dhbToken || !quote.treasuryAddress || !quote.dhbAmountWei) {
        throw new Error(t("liveHype.gift.notReady", { defaultValue: "Gifting is not available for this plan yet" }));
      }
      if (quote.mode === "random" && quote.count < quote.requested) {
        toastInfo(t("liveHype.gift.fewer", { count: quote.count }));
      }
      if (chainId !== quote.chainId) await switchChain(quote.chainId);
      if (!provider) throw new Error(t("subscriptions.connectWallet"));
      setStage("wallet");
      const dhb = await buildContract(provider, ERC20_ABI, quote.dhbToken, true);
      const tx = await writeContractAA(dhb, "transfer", [quote.treasuryAddress, ethers.BigNumber.from(quote.dhbAmountWei)], { context: "send" });
      setStage("confirming");
      await tx.wait(1);
      if (!tx?.hash) throw new Error(t("subscriptions.noTxHash"));
      setStage("recording");
      await rememberPendingGift({ giftId: quote.giftId, hash: tx.hash, chainId: quote.chainId });
      // The API reads the chain, which can lag the receipt by a block or two.
      for (let attempt = 0; attempt < 5 && !result; attempt++) {
        try {
          result = await confirmSubscriptionGift(quote.giftId, tx.hash, quote.chainId);
        } catch (err: any) {
          if (attempt === 4 || !/not visible|pending/i.test(String(err?.message || ""))) throw err;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      await clearPendingGift(quote.giftId);
      toastSuccess(t("liveHype.gift.done", { count: result?.granted || result?.count || n }));
      onClose();
    } catch (e: any) {
      toastError(null, e?.message && !e?.code ? e.message : parseTxError(e, "send"));
    } finally {
      setStage("idle");
    }
  });

  const chip = (selected: boolean) =>
    `rounded-xl border ${selected ? "border-theme-neutrals-100 bg-theme-neutrals-700" : "border-theme-neutrals-800 bg-theme-neutrals-800"}`;

  return (
    <GlassModal scrollable visible={visible} onClose={() => { if (!busy) onClose(); }} presentation="bottom" maxHeight="85%" blurIntensity={30}>
      <View className="px-4 pt-2 pb-6" style={{ gap: 14 }}>
        <View className="flex-row items-center justify-center py-2" style={{ gap: 8 }}>
          <Icon name="Gift" size={18} color="#E4E4E7" />
          <Text className="text-theme-neutrals-100 text-lg font-bold">{t("liveHype.gift.title", { defaultValue: "Gift subscriptions" })}</Text>
        </View>

        {isLoading ? (
          <View className="py-6 items-center"><ActivityIndicator color="#A1A1AA" /></View>
        ) : !buyable.length ? (
          <Text className="text-theme-neutrals-400 text-sm">
            {t("liveHype.gift.noPlans", { name: creatorName || t("liveOverlay.someone", { defaultValue: "Someone" }) })}
          </Text>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Text className="text-theme-neutrals-400 text-sm">{t("liveHype.gift.plan", { defaultValue: "Plan" })}</Text>
              {buyable.map((p) => {
                const selected = !!plan && planKey(plan) === planKey(p);
                return (
                  <TouchableOpacity key={planKey(p)} onPress={() => setPlanId(planKey(p))} accessibilityState={{ selected }} className={`${chip(selected)} flex-row items-center justify-between px-3 py-3`}>
                    {selected ? <View pointerEvents="none" style={styles.ring} /> : null}
                    {selected ? <Icon name="CircleCheck" size={16} color="#F4F4F5" /> : <Icon name="Circle" size={16} color="#71717A" />}
                    <Text numberOfLines={1} className="text-theme-neutrals-100 font-medium text-sm flex-1 ml-2">{p.name}</Text>
                    <Text className="text-theme-neutrals-100 text-sm">${(planPrice(p) ?? 0).toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="flex-row rounded-xl bg-theme-neutrals-800 p-1">
              {(["random", "user"] as const).map((m) => {
                const selected = mode === m;
                const disabled = m === "random" && !streamId;
                return (
                  <TouchableOpacity
                    key={m}
                    disabled={disabled}
                    onPress={() => setMode(m)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected, disabled }}
                    className={`flex-1 rounded-lg py-2.5 items-center ${selected ? "bg-theme-neutrals-100" : ""}`}
                    style={{ opacity: disabled ? 0.4 : 1 }}
                  >
                    {selected ? <View pointerEvents="none" style={[styles.ring, { borderRadius: 8 }]} /> : null}
                    <Text className={`text-xs font-semibold ${selected ? "text-theme-neutrals-50" : "text-theme-neutrals-400"}`}>
                      {m === "random"
                        ? t("liveHype.gift.mode.random", { defaultValue: "Random viewers in chat" })
                        : t("liveHype.gift.mode.user", { defaultValue: "Someone specific" })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === "random" ? (
              <View style={{ gap: 8 }}>
                <Text className="text-theme-neutrals-400 text-sm">{t("liveHype.gift.howMany", { defaultValue: "How many" })}</Text>
                <View className="flex-row" style={{ gap: 6 }}>
                  {COUNTS.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setCount(c)} accessibilityState={{ selected: count === c }} className={`${chip(count === c)} flex-1 items-center py-2.5`}>
                      {count === c ? <View pointerEvents="none" style={styles.ring} /> : null}
                      <Text className={`font-semibold text-sm ${count === c ? "text-theme-neutrals-50" : "text-theme-neutrals-400"}`}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-theme-neutrals-500 text-[11px]">{t("liveHype.gift.randomHint")}</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text className="text-theme-neutrals-400 text-sm">{t("liveHype.gift.who", { defaultValue: "Username or wallet address" })}</Text>
                <TextInput
                  value={recipient}
                  onChangeText={(v) => setRecipient(v.slice(0, 64))}
                  placeholder={t("liveHype.gift.whoPlaceholder", { defaultValue: "@username" })}
                  placeholderTextColor="#71717A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-theme-neutrals-800 text-theme-neutrals-100 rounded-xl px-4 py-3 text-[15px]"
                />
              </View>
            )}

            <TouchableOpacity
              onPress={send}
              disabled={!canSend}
              className="rounded-xl bg-theme-neutrals-100 py-3.5 flex-row items-center justify-center"
              style={{ gap: 8, opacity: canSend || busy ? 1 : 0.5 }}
            >
              {busy ? <ActivityIndicator color="#18181B" /> : <Icon name="Gift" size={16} color="#18181B" />}
              <Text className="text-theme-neutrals-900 font-semibold text-[15px]">
                {busy ? t(`liveHype.gift.stage.${stage}`) : t("liveHype.gift.send", { count: n, price: (unit * n).toFixed(2) })}
              </Text>
            </TouchableOpacity>
            <Text className="text-theme-neutrals-500 text-[11px]">{t("liveHype.gift.payHint")}</Text>
          </>
        )}

        <TouchableOpacity disabled={busy} onPress={onClose} className="rounded-xl bg-theme-neutrals-800 py-3.5 items-center" style={{ opacity: busy ? 0.6 : 1 }}>
          <Text className="text-theme-neutrals-100 font-semibold text-[15px]">{t("liveHype.gift.cancel", { defaultValue: "Cancel" })}</Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
}

// Selection is drawn on a child: a Touchable's own fill is repainted as the
// theme's control material, which made the picked plan look like the rest.
const styles = StyleSheet.create({
  ring: { ...StyleSheet.absoluteFillObject, borderRadius: 12, borderWidth: 2, borderColor: "#F4F4F5" },
});
