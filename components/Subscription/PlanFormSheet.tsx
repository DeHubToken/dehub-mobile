import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import {
  createPlan,
  updatePlan,
  confirmPlanPublished,
  normaliseDuration,
  planPrice,
  primaryPlanChain,
  type SubscriptionPlan,
} from "../../services/subscription.service";
import { toastError, toastSuccess } from "../../libs/toast";
import { useAuthActions, useProvider } from "../../context/AuthContext";
import { useSubscriptionContract } from "../../hooks/use-web3";
import { writeContractAA } from "../../libs/aa.write";
import { parseTxError } from "../../libs/web3.util";
import { ethers } from "ethers";
import { ChainId, chainIcons } from "../../config/constants";
import ChainSelector, {
  SOLANA_CHAIN_OPTION,
  type ChainOption,
} from "../common/ChainSelector";
import { SOLANA_MAINNET_CHAIN_ID } from "../../config/solana.constants";
import {
  DHB_PRELISTING_USD,
  dhbForUsd,
  formatDhbPayment,
  subscriptionPaymentToken,
} from "../../libs/subscription-pricing";
import { sanitizeAmountInput } from "../../libs/amount-input";

interface PlanFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (plan: SubscriptionPlan) => void;
  /** Called only after a newly created plan is confirmed on chain. */
  onPublished?: () => void;
  /** If provided, we're editing an existing plan */
  editPlan?: SubscriptionPlan | null;
}

/**
 * Whole months, and **lifetime is 0** — the contract's range, not ours. It
 * reverts outside 0–12, so the old day counts (30/90/180/365) produced plans
 * nobody could ever buy.
 */
const DURATION_OPTIONS = [
  { labelKey: "subscriptions.durations.oneMonth", months: 1 },
  { labelKey: "subscriptions.durations.threeMonths", months: 3 },
  { labelKey: "subscriptions.durations.sixMonths", months: 6 },
  { labelKey: "subscriptions.durations.oneYear", months: 12 },
  { labelKey: "subscriptions.durations.lifetime", months: 0 },
];

const SUBSCRIPTION_CHAIN_OPTIONS: ChainOption[] = [
  {
    id: ChainId.BASE_MAINNET,
    name: "Base",
    symbol: "BASE",
    icon: chainIcons[ChainId.BASE_MAINNET],
  },
  {
    id: ChainId.BSC_MAINNET,
    name: "BNB",
    symbol: "BNB",
    icon: chainIcons[ChainId.BSC_MAINNET],
  },
  {
    id: ChainId.ROBINHOOD_MAINNET,
    name: "Robinhood",
    symbol: "RHC",
    icon: chainIcons[ChainId.ROBINHOOD_MAINNET],
  },
  SOLANA_CHAIN_OPTION,
];

const UNAVAILABLE_SUBSCRIPTION_CHAINS = [
  ChainId.ROBINHOOD_MAINNET,
  SOLANA_MAINNET_CHAIN_ID,
];

const PlanFormSheet: React.FC<PlanFormSheetProps> = ({
  visible,
  onClose,
  onSuccess,
  onPublished,
  editPlan,
}) => {
  const { t } = useTranslation();
  const { chainId } = useProvider();
  const { switchChain } = useAuthActions();
  const subscriptionContract = useSubscriptionContract();
  const isEditing = !!editPlan;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState(1);
  const [stage, setStage] = useState("");
  const [benefitInput, setBenefitInput] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(ChainId.BASE_MAINNET);

  const existingChain = editPlan ? primaryPlanChain(editPlan) : undefined;
  const priceCurrency = (
    existingChain?.currency || editPlan?.currency || (isEditing ? "DHB" : "USDT")
  ).toUpperCase();
  const existingIsUsdPriced = !isEditing || ["USD", "USDT", "USDC"].includes(priceCurrency);
  const originalPrice = editPlan ? (planPrice(editPlan) || 0) : 0;
  const originalDollarPrice = existingIsUsdPriced
    ? originalPrice
    : originalPrice * DHB_PRELISTING_USD;
  const dhbEstimate = dhbForUsd(Number(price), DHB_PRELISTING_USD);

  // Populate fields when editing
  useEffect(() => {
    if (editPlan) {
      setName(editPlan.name || "");
      setDescription(editPlan.description || "");
      setPrice(originalDollarPrice > 0 ? String(originalDollarPrice) : "");
      // Legacy 999 lifetime plans fold onto 0 so the preset lights up.
      setDuration(normaliseDuration(editPlan.duration) ?? 1);
      setBenefits(editPlan.benefits || []);
      setSelectedChainId(primaryPlanChain(editPlan)?.chainId || ChainId.BASE_MAINNET);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setDuration(1);
      setBenefits([]);
      setSelectedChainId(ChainId.BASE_MAINNET);
    }
    setBenefitInput("");
  }, [editPlan, visible, originalDollarPrice]);

  // The subscription contract hook follows the active wallet chain. Keep it
  // aligned with the network selected in the header before the publish step.
  useEffect(() => {
    if (!visible || isEditing || selectedChainId === chainId) return;
    if (UNAVAILABLE_SUBSCRIPTION_CHAINS.includes(selectedChainId)) return;

    let active = true;
    setSwitchingChain(true);
    switchChain(selectedChainId)
      .catch((error) => {
        if (active) toastError(error, t("subscriptions.switchFailed"));
      })
      .finally(() => {
        if (active) setSwitchingChain(false);
      });

    return () => {
      active = false;
    };
  }, [visible, isEditing, selectedChainId, chainId, switchChain, t]);

  const addBenefit = useCallback(() => {
    const trimmed = benefitInput.trim();
    if (!trimmed) return;
    setBenefits(prev => [...prev, trimmed]);
    setBenefitInput("");
  }, [benefitInput]);

  const removeBenefit = useCallback((idx: number) => {
    setBenefits(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toastError(null, t("subscriptions.planNameRequired"));
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      toastError(null, t("subscriptions.enterValidPrice"));
      return;
    }

    const targetChain = selectedChainId;
    const paymentToken = subscriptionPaymentToken(targetChain);
    if (!paymentToken || UNAVAILABLE_SUBSCRIPTION_CHAINS.includes(targetChain)) {
      toastError(null, t("subscriptions.availableChains"));
      return;
    }
    if (!isEditing && (switchingChain || chainId !== targetChain)) {
      toastError(null, t("subscriptions.waitForSwitch"));
      return;
    }
    if (!isEditing && !subscriptionContract) {
      toastError(null, t("subscriptions.connectAndWait"));
      return;
    }

    setSaving(true);
    try {
      let result: SubscriptionPlan | undefined;
      if (isEditing && editPlan) {
        const planId = editPlan.id || editPlan._id || "";
        const migratePricing = !existingIsUsdPriced || parsedPrice !== originalDollarPrice;
        result = await updatePlan(planId, {
          name: name.trim(),
          description: description.trim() || undefined,
          duration,
          benefits,
          ...(migratePricing
            ? {
                chains: [{
                  chainId: targetChain,
                  token: paymentToken.address,
                  price: parsedPrice,
                  currency: paymentToken.symbol,
                  decimals: paymentToken.decimals,
                }],
              }
            : {}),
        });
        toastSuccess(t("subscriptions.planUpdated"));
      } else {
        setStage(t("subscriptions.creating"));
        result = await createPlan({
          name: name.trim(),
          description: description.trim() || undefined,
          duration,
          tier: 1,
          benefits,
          chains: [{
            chainId: targetChain,
            token: paymentToken!.address,
            price: parsedPrice,
            currency: paymentToken!.symbol,
            decimals: paymentToken!.decimals,
          }],
        });

        const planId = result?.id || result?._id;
        if (!planId) throw new Error("The plan was not created");

        // A plan only becomes buyable once it is listed on chain. If this leg
        // fails the plan survives unpublished and can be published later,
        // rather than silently reverting for every buyer.
        setStage(t("subscriptions.confirmInWallet"));
        const tx = await writeContractAA(
          subscriptionContract,
          "createPlan",
          [
            ethers.BigNumber.from(String(planId)),
            duration,
            name.trim(),
            description.trim() || "",
            ethers.utils.parseUnits(String(parsedPrice), paymentToken!.decimals),
            true,
            paymentToken!.address,
          ],
          { context: "send" },
        );
        setStage(t("subscriptions.waitingTx"));
        await tx.wait(1);
        setStage(t("subscriptions.finishing"));
        await confirmPlanPublished(String(planId), targetChain);
        toastSuccess(t("subscriptions.planPublished"));
        onPublished?.();
      }
      if (result) onSuccess(result);
      onClose();
    } catch (e) {
      toastError(null, parseTxError(e, "send"));
    } finally {
      setSaving(false);
      setStage("");
    }
  }, [name, description, price, duration, benefits, isEditing, editPlan, existingIsUsdPriced, originalDollarPrice, selectedChainId, switchingChain, chainId, subscriptionContract, onSuccess, onPublished, onClose, t]);

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="90%"
      panelHeight="90%"
      blurIntensity={30}
    >
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <Text className="text-white font-bold text-base">
            {isEditing ? t("subscriptions.editPlan") : t("subscriptions.createPlanTitle")}
          </Text>
          <View className="flex-row items-center gap-1">
            <ChainSelector
              selectedChainId={selectedChainId}
              onChange={setSelectedChainId}
              variant="settings"
              title={t("subscriptions.network")}
              options={SUBSCRIPTION_CHAIN_OPTIONS}
              unavailableChainIds={UNAVAILABLE_SUBSCRIPTION_CHAINS}
              disabled={isEditing || saving}
            />
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Icon name="X" size={20} color="#A1A1AA" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">{t("subscriptions.planNameLabel")}</Text>
            <TextInput
              className="bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
              placeholderTextColor="#8B8D90"
              placeholder={t("subscriptions.planNamePlaceholder")}
              value={name}
              onChangeText={setName}
              maxLength={50}
            />
          </View>

          {/* Description */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">{t("stores.description")}</Text>
            <TextInput
              className="bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
              placeholderTextColor="#8B8D90"
              placeholder={t("subscriptions.descriptionPlaceholder")}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              style={{ textAlignVertical: "top", minHeight: 80 }}
              maxLength={300}
            />
          </View>

          {/* Price */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">
              {t("subscriptions.priceLabel")}
            </Text>
            <View className="relative">
              <TextInput
                className="bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm pl-4 pr-40 py-3 rounded-xl"
                placeholderTextColor="#8B8D90"
                placeholder="0.00"
                value={price}
                onChangeText={(v) => setPrice(sanitizeAmountInput(v, 2))}
                keyboardType="decimal-pad"
              />
              <View pointerEvents="none" className="absolute right-3 inset-y-0 justify-center">
                <Text className="text-theme-neutrals-400 text-xs">
                  {price ? formatDhbPayment(dhbEstimate) : t("subscriptions.tokensUnit")}
                </Text>
              </View>
            </View>
            {!existingIsUsdPriced && (
              <Text className="text-theme-neutrals-500 text-xs mt-1.5">
                {t("subscriptions.legacyMigrationNote")}
              </Text>
            )}
          </View>

          {/* Duration */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">{t("filters.duration")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {DURATION_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.months}
                  onPress={() => setDuration(opt.months)}
                  activeOpacity={0.7}
                  className={`px-4 py-2 rounded-xl border ${
                    duration === opt.months
                      ? "bg-white border-white"
                      : "bg-theme-neutrals-800 border-theme-neutrals-700"
                  }`}
                >
                  <Text className={`text-sm font-medium ${duration === opt.months ? "text-black" : "text-theme-neutrals-400"}`}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Benefits */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">{t("subscriptions.benefits")}</Text>
            <View className="flex-row gap-2 mb-2">
              <TextInput
                className="flex-1 bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
                placeholderTextColor="#8B8D90"
                placeholder={t("subscriptions.benefitPlaceholder")}
                value={benefitInput}
                onChangeText={setBenefitInput}
                onSubmitEditing={addBenefit}
                returnKeyType="done"
                maxLength={100}
              />
              <TouchableOpacity
                onPress={addBenefit}
                activeOpacity={0.7}
                className="bg-white px-4 rounded-xl items-center justify-center"
              >
                <Icon name="Plus" size={18} color="#000000" />
              </TouchableOpacity>
            </View>
            {benefits.map((b, idx) => (
              <View key={idx} className="flex-row items-center bg-theme-neutrals-800/60 rounded-xl px-3 py-2 mb-1.5">
                <Icon name="Check" size={14} color="#D4D4D8" />
                <Text className="flex-1 text-white text-sm ml-2">{b}</Text>
                <TouchableOpacity onPress={() => removeBenefit(idx)} activeOpacity={0.7} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                  <Icon name="X" size={14} color="#A1A1AA" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className="px-5 pb-6 pt-2 border-t border-white/10">
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || switchingChain || (!isEditing && (chainId !== selectedChainId || !subscriptionContract))}
            activeOpacity={0.85}
            className={`py-3.5 rounded-xl items-center bg-white ${saving || switchingChain ? "opacity-60" : ""}`}
          >
            {saving || switchingChain ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <Text className="text-black font-semibold text-sm">
                {isEditing ? t("common.saveChanges") : t("subscriptions.createAndPublish")}
              </Text>
            )}
          </TouchableOpacity>
          {/* Publishing opens the wallet, so the button alone leaves people
              wondering what it is waiting for. */}
          <Text className="text-theme-neutrals-400 text-xs text-center mt-2">
            {stage || (isEditing ? " " : t("subscriptions.publishingOnChain"))}
          </Text>
        </View>
      </View>
    </GlassModal>
  );
};

export default PlanFormSheet;
