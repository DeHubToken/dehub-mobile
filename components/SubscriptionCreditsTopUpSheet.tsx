import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import GlassModal from "./ui/GlassModal";
import { DhbCoin } from "./common/DhbCoin";
import TipPayWith, { tipStageLabel } from "./Tip/TipPayWith";
import { fundTip, type TipFundingSource } from "../libs/tip-funding";
import { FundingError, fundingErrorText } from "../libs/tip-funding-error";
import { buildContract, useWeb3Provider } from "../hooks/use-web3";
import { writeContractAA } from "../libs/aa.write";
import { parseTxError } from "../libs/web3.util";
import { toastError, toastInfo, toastSuccess } from "../libs/toast";
import { useAuthActions } from "../context/AuthContext";
import { ChainId } from "../config/constants";
import ERC20_ABI from "../config/abis/erc20.json";
import {
  claimSubscriptionCreditTopUp,
  clearPendingCreditTopUp,
  FINAL_TOPUP_STATUSES,
  getSubscriptionCreditTopUpTarget,
  rememberPendingCreditTopUp,
} from "../services/credits.service";

const BASE_CHAIN_ID = ChainId.BASE_MAINNET;
const PRESETS = [5, 10, 25, 50];
const MIN_USD = 1;
const MAX_USD = 10_000;
const CLAIM_ATTEMPTS = 6;
const CLAIM_RETRY_MS = 3_000;

const usdFormat = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Today's DHB price, from the balance the pill already fetched. */
  dhbPriceUsd: number;
}

/**
 * Add subscription tokens: pick a dollar amount, send that much DHB at
 * today's price to DeHub, and the API credits it at the price when the
 * transfer landed.
 */
const SubscriptionCreditsTopUpSheet: React.FC<Props> = ({ visible, onClose, dhbPriceUsd }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { account, chainId, provider } = useWeb3Provider();
  const { switchChain } = useAuthActions();
  const [preset, setPreset] = useState<number | null>(10);
  const [custom, setCustom] = useState("");
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const [stage, setStage] = useState("");
  // State updates land after the tap that caused them, so a fast double tap
  // would start two transfers. This flag is set synchronously.
  const inFlight = useRef(false);

  // Switched when the sheet opens, not mid-payment: the provider this
  // component holds only reflects the new chain after a render.
  useEffect(() => {
    if (visible && chainId && chainId !== BASE_CHAIN_ID) {
      switchChain(BASE_CHAIN_ID).catch(() => undefined);
    }
  }, [visible, chainId, switchChain]);

  const usd = preset ?? Number(custom);
  const validUsd = Number.isFinite(usd) && usd >= MIN_USD && usd <= MAX_USD;
  // Whole tokens, rounded up, so the transfer always covers the dollars chosen.
  const tokens = useMemo(
    () => (validUsd && dhbPriceUsd > 0 ? Math.ceil(usd / dhbPriceUsd) : 0),
    [validUsd, usd, dhbPriceUsd],
  );
  const busy = !!stage;
  const canSend = validUsd && !!tokens && !busy && !!account && !!provider;

  const handleTopUp = async () => {
    if (!canSend || !provider || !account || inFlight.current) return;
    if (chainId !== BASE_CHAIN_ID) {
      // Still switching; the next tap sends on Base.
      switchChain(BASE_CHAIN_ID).catch((e: unknown) => toastError(e, t("staking.switchBaseFailed")));
      return;
    }
    inFlight.current = true;
    try {
      setStage(t("credits.topUpStageWallet"));
      const target = await getSubscriptionCreditTopUpTarget(BASE_CHAIN_ID);

      if (payWith) {
        setStage(t("credits.topUpStageFunding"));
        await fundTip({
          source: payWith,
          amountDhb: tokens,
          walletAddress: account,
          onStage: (s) => setStage(tipStageLabel(t as any, s, payWith)),
        });
      }

      setStage(t("credits.topUpStageWallet"));
      const dhbContract = await buildContract(provider, ERC20_ABI, target.dhbToken, true);
      const tx = await writeContractAA(
        dhbContract,
        "transfer",
        [target.treasuryAddress, ethers.utils.parseUnits(String(tokens), 18)],
        { context: "send" },
      );
      if (!tx?.hash) throw new Error(t("subscriptions.noTxHash"));
      // Saved the moment it is sent, before waiting: if the wait fails or the
      // app closes, the transfer may still land, and the hash is what gets it
      // credited. The API answers "pending" for a hash not yet mined.
      await rememberPendingCreditTopUp({ hash: tx.hash, chainId: BASE_CHAIN_ID, address: account });
      setStage(t("credits.topUpStageConfirming"));
      try {
        await tx.wait(1);
      } catch {
        // Confirmation could not be read, which is not the same as failed.
        queryClient.invalidateQueries({ queryKey: ["subscription-credits"] });
        toastInfo(t("credits.topUpPending"));
        onClose();
        return;
      }
      setStage(t("credits.topUpStageCrediting"));
      let credited = false;
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS && !credited; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, CLAIM_RETRY_MS));
        try {
          const result = await claimSubscriptionCreditTopUp(tx.hash, BASE_CHAIN_ID);
          credited = !result?.pending;
        } catch (err) {
          const status = (err as { status?: number })?.status;
          if (status && FINAL_TOPUP_STATUSES.has(status)) {
            await clearPendingCreditTopUp(tx.hash);
            throw err;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["subscription-credits"] });
      if (credited) {
        await clearPendingCreditTopUp(tx.hash);
        toastSuccess(t("credits.topUpDone", { amount: usdFormat(usd) }));
      } else {
        toastInfo(t("credits.topUpPending"));
      }
      onClose();
    } catch (e: unknown) {
      toastError(
        null,
        e instanceof FundingError
          ? fundingErrorText(t as any, e)
          : parseTxError(e, "send") || t("credits.topUpFailed"),
      );
    } finally {
      inFlight.current = false;
      setStage("");
    }
  };

  return (
    <GlassModal visible={visible} onClose={() => !busy && onClose()} presentation="center" blurIntensity={40}>
      <View className="p-5">
        <View className="flex-row items-center mb-4">
          <DhbCoin size={20} />
          <Text className="text-white text-lg font-semibold ml-2">{t("credits.topUpTitle")}</Text>
        </View>

        <View className="flex-row mb-3">
          {PRESETS.map((value) => (
            <TouchableOpacity
              key={value}
              disabled={busy}
              onPress={() => {
                setPreset(value);
                setCustom("");
              }}
              activeOpacity={0.7}
              className={`flex-1 mx-1 py-2 rounded-xl border items-center ${
                preset === value ? "bg-white border-white" : "bg-white/5 border-white/10"
              }`}
            >
              <Text className={`text-sm font-semibold ${preset === value ? "text-black" : "text-white"}`}>${value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          editable={!busy}
          keyboardType="decimal-pad"
          placeholder={t("credits.topUpCustom")}
          placeholderTextColor="#71717a"
          value={custom}
          onChangeText={(text) => {
            setCustom(text.replace(/[^0-9.]/g, ""));
            setPreset(null);
          }}
          className="mx-1 mb-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white"
        />

        <View className="mx-1 rounded-xl bg-white/5 border border-white/10 p-3">
          <View className="flex-row justify-between">
            <Text className="text-zinc-400 text-sm">{t("credits.topUpYouSend")}</Text>
            <Text className="text-white text-sm font-medium">
              {tokens ? t("credits.tokenAmount", { amount: tokens.toLocaleString() }) : "—"}
            </Text>
          </View>
          <View className="flex-row justify-between mt-1.5">
            <Text className="text-zinc-400 text-sm">{t("credits.topUpYouGet")}</Text>
            <Text className="text-white text-sm font-medium">{validUsd ? usdFormat(usd) : "—"}</Text>
          </View>
          <Text className="mt-2 pt-2 border-t border-white/10 text-[11px] leading-4 text-zinc-500">
            {t("credits.subscriptionTokensValueNote")}
          </Text>
        </View>

        {account && tokens ? (
          <View className="mx-1 mt-3">
            <TipPayWith visible={visible} amountDhb={tokens} walletAddress={account} value={payWith} onChange={setPayWith} />
          </View>
        ) : null}

        {busy ? <Text className="text-zinc-400 text-xs text-center mt-3">{stage}</Text> : null}

        <TouchableOpacity
          onPress={handleTopUp}
          disabled={!canSend}
          activeOpacity={0.8}
          className={`mx-1 mt-4 py-3 rounded-xl items-center ${canSend ? "bg-white" : "bg-white/30"}`}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text className="text-black font-semibold">
              {validUsd
                ? t("credits.topUpConfirm", { amount: usdFormat(usd) })
                : t("credits.topUpRange", { min: usdFormat(MIN_USD), max: usdFormat(MAX_USD) })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
};

export default SubscriptionCreditsTopUpSheet;
