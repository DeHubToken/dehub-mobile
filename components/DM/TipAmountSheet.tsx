/**
 * TipAmountSheet — Modal bottom sheet for selecting a voluntary tip amount
 * to attach to a DM message.
 *
 * Quick-select presets + custom text input.
 */
import React, { memo, useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

interface TipAmountSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  /** Current tip amount (if already set) — pre-fills the input. */
  currentAmount?: number;
  /** Minimum tip allowed (default: 1). */
  minAmount?: number;
  /** Current DHB balance of the user (for display & validation). */
  dhbBalance?: number | null;
}

const PRESETS = [1000, 10000, 100000, 250000, 500000, 1000000];

const formatPreset = (n: number): string => {
  if (n >= 1000000) return `${n / 1000000}M`;
  if (n >= 1000) return `${n / 1000}K`;
  return String(n);
};

const TipAmountSheetComponent: React.FC<TipAmountSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  currentAmount = 0,
  minAmount = 1,
  dhbBalance,
}) => {
  const [inputValue, setInputValue] = useState(
    currentAmount > 0 ? String(currentAmount) : "",
  );
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    currentAmount > 0 && PRESETS.includes(currentAmount) ? currentAmount : null,
  );

  const handlePreset = useCallback(
    (amount: number) => {
      setSelectedPreset(amount);
      setInputValue(String(amount));
    },
    [],
  );

  const handleInputChange = useCallback((val: string) => {
    // Allow only numbers and single decimal
    const cleaned = val.replace(/[^0-9.]/g, "");
    // Prevent multiple decimals
    const parts = cleaned.split(".");
    const formatted = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
    setInputValue(formatted);
    setSelectedPreset(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const amount = parseFloat(inputValue);
    if (isNaN(amount) || amount < minAmount) return;
    onConfirm(amount);
    onClose();
  }, [inputValue, minAmount, onConfirm, onClose]);

  const handleRemoveTip = useCallback(() => {
    onConfirm(0);
    onClose();
  }, [onConfirm, onClose]);

  const numericValue = parseFloat(inputValue);
  const isValid = !isNaN(numericValue) && numericValue >= minAmount;
  const exceedsBalance =
    isValid && dhbBalance != null && numericValue > dhbBalance;
  const canConfirm = isValid && !exceedsBalance;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          onPress={onClose}
          className="flex-1 bg-black/60 justify-end"
        >
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={SlideInDown.duration(280).damping(28).stiffness(220)}
              className="bg-theme-neutrals-900 rounded-t-3xl px-5 pt-5 pb-8"
            >
              {/* Handle */}
              <View className="items-center mb-4">
                <View className="w-10 h-1 bg-theme-neutrals-700 rounded-full" />
              </View>

              {/* Header */}
              <View className="flex-row items-center mb-5">
                <Ionicons name="diamond" size={20} color="#3B82F6" />
                <Text className="text-white text-[17px] font-semibold ml-2">
                  Add a Tip
                </Text>
              </View>

              <Text className="text-theme-neutrals-400 text-[13px] mb-4">
                Attach DHB tokens as a tip to your message. The recipient will
                see the tip amount on the message.
                {minAmount > 1 && (
                  <Text className="text-amber-400">
                    {`\nMinimum ${Number(minAmount).toLocaleString()} DHB (covers message fee).`}
                  </Text>
                )}
              </Text>

              {/* Quick-select presets */}
              <View className="flex-row flex-wrap gap-2 mb-4">
                {PRESETS.map((amount) => {
                  const isSelected = selectedPreset === amount;
                  return (
                    <TouchableOpacity
                      key={amount}
                      onPress={() => handlePreset(amount)}
                      activeOpacity={0.7}
                      className={`px-4 py-2 rounded-full border ${
                        isSelected
                          ? "bg-blue-600/20 border-blue-500"
                          : "bg-theme-neutrals-800 border-theme-neutrals-700"
                      }`}
                    >
                      <Text
                        className={`text-[13px] font-medium ${
                          isSelected ? "text-blue-400" : "text-theme-neutrals-300"
                        }`}
                      >
                        {formatPreset(amount)} DHB
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom amount input */}
              <View className="flex-row items-center bg-theme-neutrals-800 rounded-xl px-4 py-3 mb-3">
                <Ionicons name="diamond-outline" size={18} color="#A6A9AC" />
                <TextInput
                  value={inputValue}
                  onChangeText={handleInputChange}
                  placeholder="Custom amount"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  className="flex-1 text-white text-[15px] ml-2 p-0"
                />
                <Text className="text-theme-neutrals-400 text-[13px]">DHB</Text>
              </View>

              {/* Balance indicator */}
              {dhbBalance != null && (
                <View
                  className={`flex-row items-center mb-4 px-3 py-1.5 rounded-lg self-start ${
                    exceedsBalance ? "bg-red-500/10" : "bg-white/5"
                  }`}
                >
                  <Ionicons
                    name="wallet-outline"
                    size={12}
                    color={exceedsBalance ? "#EF4444" : "#A6A9AC"}
                  />
                  <Text
                    className={`text-[11px] font-medium ml-1 ${
                      exceedsBalance
                        ? "text-red-400"
                        : "text-theme-neutrals-400"
                    }`}
                  >
                    {exceedsBalance
                      ? `Insufficient balance · ${Number(dhbBalance).toLocaleString()} DHB`
                      : `Balance: ${Number(dhbBalance).toLocaleString()} DHB`}
                  </Text>
                </View>
              )}

              {/* Buttons */}
              <View className="flex-row gap-3">
                {currentAmount > 0 && (
                  <TouchableOpacity
                    onPress={handleRemoveTip}
                    activeOpacity={0.7}
                    className="flex-1 items-center py-3 bg-theme-neutrals-800 rounded-xl"
                  >
                    <Text className="text-theme-neutrals-400 text-[14px] font-medium">
                      Remove Tip
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={!canConfirm}
                  activeOpacity={0.7}
                  className={`flex-1 items-center py-3 rounded-xl ${
                    canConfirm ? "bg-blue-600" : "bg-theme-neutrals-700"
                  }`}
                >
                  <Text
                    className={`text-[14px] font-semibold ${
                      canConfirm ? "text-white" : "text-theme-neutrals-500"
                    }`}
                  >
                    {exceedsBalance
                      ? "Insufficient DHB"
                      : isValid
                      ? `Attach ${numericValue} DHB Tip`
                      : "Enter amount"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default memo(TipAmountSheetComponent);
