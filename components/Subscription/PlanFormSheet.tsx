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
import { createPlan, updatePlan, type SubscriptionPlan } from "../../services/subscription.service";
import { toastError, toastSuccess } from "../../libs/toast";
import { useProvider } from "../../context/AuthContext";

interface PlanFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (plan: SubscriptionPlan) => void;
  /** If provided, we're editing an existing plan */
  editPlan?: SubscriptionPlan | null;
}

const DURATION_OPTIONS = [
  { label: "1 Month", days: 30 },
  { label: "3 Months", days: 90 },
  { label: "6 Months", days: 180 },
  { label: "1 Year", days: 365 },
];

const PlanFormSheet: React.FC<PlanFormSheetProps> = ({
  visible,
  onClose,
  onSuccess,
  editPlan,
}) => {
  const { chainId } = useProvider();
  const isEditing = !!editPlan;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState(30);
  const [benefitInput, setBenefitInput] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Populate fields when editing
  useEffect(() => {
    if (editPlan) {
      setName(editPlan.name || "");
      setDescription(editPlan.description || "");
      const chainPrice = editPlan.chains?.[0]?.price ?? editPlan.price ?? 0;
      setPrice(chainPrice > 0 ? String(chainPrice) : "");
      setDuration(editPlan.duration || 30);
      setBenefits(editPlan.benefits || []);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setDuration(30);
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

    setSaving(true);
    try {
      let result: SubscriptionPlan;
      if (isEditing && editPlan) {
        const planId = editPlan._id || editPlan.id || "";
        result = await updatePlan(planId, {
          name: name.trim(),
          description: description.trim() || undefined,
          duration,
          benefits,
          price: parsedPrice,
        });
        toastSuccess("Plan updated");
      } else {
        result = await createPlan({
          name: name.trim(),
          description: description.trim() || undefined,
          duration,
          tier: 1,
          benefits,
          chains: [
            {
              chainId: chainId || 8453,
              token: "DHB",
              price: parsedPrice,
            },
          ],
        });
        toastSuccess("Plan created");
      }
      onSuccess(result);
      onClose();
    } catch (e) {
      toastError(e, isEditing ? "Failed to update plan" : "Failed to create plan");
    } finally {
      setSaving(false);
    }
  }, [name, description, price, duration, benefits, isEditing, editPlan, chainId, onSuccess, onClose]);

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
                  key={opt.days}
                  onPress={() => setDuration(opt.days)}
                  activeOpacity={0.7}
                  className={`px-4 py-2 rounded-xl border ${
                    duration === opt.days
                      ? "bg-white border-white"
                      : "bg-theme-neutrals-800 border-theme-neutrals-700"
                  }`}
                >
                  <Text className={`text-sm font-medium ${duration === opt.days ? "text-black" : "text-theme-neutrals-400"}`}>
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
                {isEditing ? "Save Changes" : "Create Plan"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GlassModal>
  );
};

export default PlanFormSheet;
