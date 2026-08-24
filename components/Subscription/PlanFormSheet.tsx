import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import {
  createPlan,
  updatePlan,
  confirmPlanPublished,
  normaliseDuration,
  planPrice,
  type SubscriptionPlan,
} from "../../services/subscription.service";
import { toastError, toastSuccess } from "../../libs/toast";
import { useProvider } from "../../context/AuthContext";
import { useSubscriptionContract } from "../../hooks/use-web3";
import { writeContractAA } from "../../libs/aa.write";
import { parseTxError } from "../../libs/web3.util";
import { DHB_TOKEN_ADDRESSES } from "../../config/web3.constants";
import { ethers } from "ethers";

interface PlanFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (plan: SubscriptionPlan) => void;
  /** If provided, we're editing an existing plan */
  editPlan?: SubscriptionPlan | null;
}

/**
 * Whole months, and **lifetime is 0** — the contract's range, not ours. It
 * reverts outside 0–12, so the old day counts (30/90/180/365) produced plans
 * nobody could ever buy.
 */
const DURATION_OPTIONS = [
  { label: "1 Month", months: 1 },
  { label: "3 Months", months: 3 },
  { label: "6 Months", months: 6 },
  { label: "1 Year", months: 12 },
  { label: "Lifetime", months: 0 },
];

const PlanFormSheet: React.FC<PlanFormSheetProps> = ({
  visible,
  onClose,
  onSuccess,
  editPlan,
}) => {
  const { chainId } = useProvider();
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

  // Populate fields when editing
  useEffect(() => {
    if (editPlan) {
      setName(editPlan.name || "");
      setDescription(editPlan.description || "");
      const chainPrice = planPrice(editPlan) ?? 0;
      setPrice(chainPrice > 0 ? String(chainPrice) : "");
      // Legacy 999 lifetime plans fold onto 0 so the preset lights up.
      setDuration(normaliseDuration(editPlan.duration) ?? 1);
      setBenefits(editPlan.benefits || []);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setDuration(1);
      setBenefits([]);
    }
    setBenefitInput("");
  }, [editPlan, visible]);

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
      toastError(null, "Plan name is required");
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      toastError(null, "Enter a valid price");
      return;
    }

    const targetChain = chainId || 8453;
    const dhbToken = DHB_TOKEN_ADDRESSES[targetChain];
    if (!isEditing && !dhbToken) {
      toastError(null, "Subscriptions are not available on this network — switch to Base or BNB");
      return;
    }

    setSaving(true);
    try {
      let result: SubscriptionPlan | undefined;
      if (isEditing && editPlan) {
        const planId = editPlan.id || editPlan._id || "";
        result = await updatePlan(planId, {
          name: name.trim(),
          description: description.trim() || undefined,
          duration,
          benefits,
          price: parsedPrice,
        });
        toastSuccess("Plan updated");
      } else {
        // The token is the chain's DHB **address**. This used to send the
        // string "DHB", which is not an address and cannot be charged — the
        // API now rejects it rather than storing an unbuyable plan.
        setStage("Creating…");
        result = await createPlan({
          name: name.trim(),
          description: description.trim() || undefined,
          duration,
          tier: 1,
          benefits,
          chains: [{ chainId: targetChain, token: dhbToken, price: parsedPrice }],
        });

        const planId = result?.id || result?._id;
        if (!planId) throw new Error("The plan was not created");

        // A plan only becomes buyable once it is listed on chain. If this leg
        // fails the plan survives unpublished and can be published later,
        // rather than silently reverting for every buyer.
        if (!subscriptionContract) {
          toastSuccess("Plan created — connect your wallet to publish it");
        } else {
          setStage("Confirm in your wallet…");
          const tx = await writeContractAA(
            subscriptionContract,
            "createPlan",
            [
              ethers.BigNumber.from(String(planId)),
              duration,
              name.trim(),
              description.trim() || "",
              ethers.utils.parseUnits(String(parsedPrice), 18),
              true,
              dhbToken,
            ],
            { context: "send" },
          );
          setStage("Waiting for the transaction…");
          await tx.wait(1);
          setStage("Finishing up…");
          await confirmPlanPublished(String(planId), targetChain);
          toastSuccess("Plan created and published");
        }
      }
      if (result) onSuccess(result);
      onClose();
    } catch (e) {
      toastError(null, parseTxError(e, "send"));
    } finally {
      setSaving(false);
      setStage("");
    }
  }, [name, description, price, duration, benefits, isEditing, editPlan, chainId, subscriptionContract, onSuccess, onClose]);

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="90%"
      blurIntensity={30}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <Text className="text-white font-bold text-base">
            {isEditing ? "Edit Plan" : "Create Subscription Plan"}
          </Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Icon name="X" size={20} color="#A1A1AA" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">Plan Name *</Text>
            <TextInput
              className="bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
              placeholderTextColor="#8B8D90"
              placeholder="e.g. Premium, Gold, VIP..."
              value={name}
              onChangeText={setName}
              maxLength={50}
            />
          </View>

          {/* Description */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">Description</Text>
            <TextInput
              className="bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
              placeholderTextColor="#8B8D90"
              placeholder="What subscribers get..."
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
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">Price (DHB) *</Text>
            <TextInput
              className="bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
              placeholderTextColor="#8B8D90"
              placeholder="0"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />
          </View>

          {/* Duration */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">Duration</Text>
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
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Benefits */}
          <View>
            <Text className="text-theme-neutrals-400 text-xs font-medium mb-1.5">Benefits</Text>
            <View className="flex-row gap-2 mb-2">
              <TextInput
                className="flex-1 bg-theme-neutrals-800 border border-theme-neutrals-700 text-white text-sm px-4 py-3 rounded-xl"
                placeholderTextColor="#8B8D90"
                placeholder="Add a benefit..."
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
            disabled={saving}
            activeOpacity={0.85}
            className={`py-3.5 rounded-xl items-center bg-white ${saving ? "opacity-60" : ""}`}
          >
            {saving ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <Text className="text-black font-semibold text-sm">
                {isEditing ? "Save Changes" : "Create & Publish"}
              </Text>
            )}
          </TouchableOpacity>
          {/* Publishing opens the wallet, so the button alone leaves people
              wondering what it is waiting for. */}
          <Text className="text-theme-neutrals-400 text-xs text-center mt-2">
            {stage || (isEditing ? " " : "Publishing is an on-chain transaction")}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </GlassModal>
  );
};

export default PlanFormSheet;
