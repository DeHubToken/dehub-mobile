/**
 * MonetizationPanel
 *
 * Slide-up panel for PPV, Bounty, and Token Gated settings.
 * Each option has a toggle + expandable inline form.
 * Toggling on opens the form; confirming closes it and keeps the toggle on.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import CustomSwitch from "../ui/CustomSwitch";

// ── Types ────────────────────────────────────────────────

export type PpvData = {
  price: string;
};

export type BountyData = {
  viewers: string;
  commenters: string;
  rewardPerPerson: string;
};

export type TokenGateData = {
  minAmount: string;
};

export type MonetizationState = {
  ppvEnabled: boolean;
  ppvData: PpvData;
  bountyEnabled: boolean;
  bountyData: BountyData;
  tokenGatedEnabled: boolean;
  tokenGateData: TokenGateData;
};

type MonetizationPanelProps = {
  state: MonetizationState;
  onChange: (next: MonetizationState) => void;
  /** Which section to auto-expand when panel opens (tapped icon in bottom bar) */
  autoExpandSection?: "ppv" | "bounty" | "tokenGated" | null;
  onAutoExpandHandled: () => void;
};

const DHB_ADDRESS = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_SHORT = `${DHB_ADDRESS.slice(0, 8)}…${DHB_ADDRESS.slice(-4)}`;

// ── Animated sub-section wrapper ─────────────────────────

const SECTION_HEIGHT_PPV = 160;
const SECTION_HEIGHT_BOUNTY = 215;
const SECTION_HEIGHT_TOKEN = 160;

type ExpandableSectionProps = {
  expanded: boolean;
  maxHeight: number;
  children: React.ReactNode;
};

const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  expanded,
  maxHeight,
  children,
}) => {
  const height = useSharedValue(expanded ? maxHeight : 0);
  const opacity = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    height.value = withTiming(expanded ? maxHeight : 0, { duration: 220 });
    opacity.value = withTiming(expanded ? 1 : 0, { duration: 220 });
  }, [expanded, maxHeight, height, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: "hidden" as const,
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
};

// ── Main component ───────────────────────────────────────

const MonetizationPanel: React.FC<MonetizationPanelProps> = ({
  state,
  onChange,
  autoExpandSection,
  onAutoExpandHandled,
}) => {
  const [expandedSection, setExpandedSection] = useState<
    "ppv" | "bounty" | "tokenGated" | null
  >(null);

  // Draft state for forms (not committed until confirm)
  const [ppvDraft, setPpvDraft] = useState<PpvData>(state.ppvData);
  const [bountyDraft, setBountyDraft] = useState<BountyData>(state.bountyData);
  const [tokenGateDraft, setTokenGateDraft] = useState<TokenGateData>(
    state.tokenGateData,
  );

  // Handle auto-expand from bottom bar icon tap
  useEffect(() => {
    if (autoExpandSection) {
      setExpandedSection(autoExpandSection);
      // Load current data into draft
      if (autoExpandSection === "ppv") setPpvDraft(state.ppvData);
      if (autoExpandSection === "bounty") setBountyDraft(state.bountyData);
      if (autoExpandSection === "tokenGated")
        setTokenGateDraft(state.tokenGateData);
      onAutoExpandHandled();
    }
  }, [autoExpandSection, onAutoExpandHandled, state]);

  // ── PPV ────────────────────────────────────────────────

  const handlePpvToggle = useCallback(
    (val: boolean) => {
      if (val) {
        setPpvDraft(state.ppvData);
        setExpandedSection("ppv");
      } else {
        onChange({ ...state, ppvEnabled: false });
        if (expandedSection === "ppv") setExpandedSection(null);
      }
    },
    [state, onChange, expandedSection],
  );

  const confirmPpv = useCallback(() => {
    onChange({ ...state, ppvEnabled: true, ppvData: ppvDraft });
    setExpandedSection(null);
  }, [state, onChange, ppvDraft]);

  const cancelPpv = useCallback(() => {
    if (!state.ppvEnabled) onChange({ ...state, ppvEnabled: false });
    setExpandedSection(null);
  }, [state, onChange]);

  // ── Bounty ─────────────────────────────────────────────

  const handleBountyToggle = useCallback(
    (val: boolean) => {
      if (val) {
        setBountyDraft(state.bountyData);
        setExpandedSection("bounty");
      } else {
        onChange({ ...state, bountyEnabled: false });
        if (expandedSection === "bounty") setExpandedSection(null);
      }
    },
    [state, onChange, expandedSection],
  );

  const confirmBounty = useCallback(() => {
    onChange({ ...state, bountyEnabled: true, bountyData: bountyDraft });
    setExpandedSection(null);
  }, [state, onChange, bountyDraft]);

  const cancelBounty = useCallback(() => {
    if (!state.bountyEnabled) onChange({ ...state, bountyEnabled: false });
    setExpandedSection(null);
  }, [state, onChange]);

  // ── Token Gated ────────────────────────────────────────

  const handleTokenGateToggle = useCallback(
    (val: boolean) => {
      if (val) {
        setTokenGateDraft(state.tokenGateData);
        setExpandedSection("tokenGated");
      } else {
        onChange({ ...state, tokenGatedEnabled: false });
        if (expandedSection === "tokenGated") setExpandedSection(null);
      }
    },
    [state, onChange, expandedSection],
  );

  const confirmTokenGate = useCallback(() => {
    onChange({
      ...state,
      tokenGatedEnabled: true,
      tokenGateData: tokenGateDraft,
    });
    setExpandedSection(null);
  }, [state, onChange, tokenGateDraft]);

  const cancelTokenGate = useCallback(() => {
    if (!state.tokenGatedEnabled)
      onChange({ ...state, tokenGatedEnabled: false });
    setExpandedSection(null);
  }, [state, onChange]);

  // ── Render ─────────────────────────────────────────────

  return (
    <View className="border-t border-theme-neutrals-700 mx-4 pt-2 pb-1">
      {/* ── PPV row ─────────────────────────────────── */}
      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text className="text-white text-sm ml-3">PPV</Text>
        </View>
        <CustomSwitch
          value={state.ppvEnabled || expandedSection === "ppv"}
          onValueChange={handlePpvToggle}
        />
      </View>
      <ExpandableSection
        expanded={expandedSection === "ppv"}
        maxHeight={SECTION_HEIGHT_PPV}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-3">
            Set PPV Price
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-1.5">
            Price (DHB)
          </Text>
          <TextInput
            value={ppvDraft.price}
            onChangeText={(t) => setPpvDraft({ price: t })}
            placeholder="10"
            placeholderTextColor="#6F7174"
            keyboardType="decimal-pad"
            className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
          />
          <Text className="text-theme-neutrals-500 text-xs mt-1.5">
            Payments are in DHB on Base chain
          </Text>
          <View className="flex-row justify-end mt-3 gap-3">
            <TouchableOpacity onPress={cancelPpv} className="px-4 py-2">
              <Text className="text-theme-neutrals-400 text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmPpv}
              className="flex-row items-center px-4 py-2 rounded-lg bg-theme-blue-500"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>

      {/* ── Bounty row ──────────────────────────────── */}
      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <FontAwesome6 name="gift" size={18} color="#fff" />
          <Text className="text-white text-sm ml-3">Bounty</Text>
        </View>
        <CustomSwitch
          value={state.bountyEnabled || expandedSection === "bounty"}
          onValueChange={handleBountyToggle}
        />
      </View>
      <ExpandableSection
        expanded={expandedSection === "bounty"}
        maxHeight={SECTION_HEIGHT_BOUNTY}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-2">
            Set Up Bounty
          </Text>
          <View className="flex-row gap-3 mb-2">
            <View className="flex-1">
              <Text className="text-theme-neutrals-400 text-xs mb-1">
                Viewers to reward
              </Text>
              <TextInput
                value={bountyDraft.viewers}
                onChangeText={(t) =>
                  setBountyDraft((d) => ({ ...d, viewers: t }))
                }
                placeholder="0"
                placeholderTextColor="#6F7174"
                keyboardType="number-pad"
                className="h-10 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
              />
            </View>
            <View className="flex-1">
              <Text className="text-theme-neutrals-400 text-xs mb-1">
                Commenters to reward
              </Text>
              <TextInput
                value={bountyDraft.commenters}
                onChangeText={(t) =>
                  setBountyDraft((d) => ({ ...d, commenters: t }))
                }
                placeholder="0"
                placeholderTextColor="#6F7174"
                keyboardType="number-pad"
                className="h-10 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
              />
            </View>
          </View>
          <Text className="text-theme-neutrals-400 text-xs mb-1">
            Reward per person (DHB)
          </Text>
          <TextInput
            value={bountyDraft.rewardPerPerson}
            onChangeText={(t) =>
              setBountyDraft((d) => ({ ...d, rewardPerPerson: t }))
            }
            placeholder="Amount per person"
            placeholderTextColor="#6F7174"
            keyboardType="decimal-pad"
            className="h-10 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
          />
          <View className="flex-row justify-end mt-2 gap-3">
            <TouchableOpacity onPress={cancelBounty} className="px-4 py-2">
              <Text className="text-theme-neutrals-400 text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmBounty}
              className="flex-row items-center px-4 py-2 rounded-lg bg-theme-blue-500"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>

      {/* ── Token Gated row ─────────────────────────── */}
      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <FontAwesome6 name="shield-halved" size={18} color="#fff" />
          <Text className="text-white text-sm ml-3">Token Gated</Text>
        </View>
        <CustomSwitch
          value={state.tokenGatedEnabled || expandedSection === "tokenGated"}
          onValueChange={handleTokenGateToggle}
        />
      </View>
      <ExpandableSection
        expanded={expandedSection === "tokenGated"}
        maxHeight={SECTION_HEIGHT_TOKEN}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-2">
            Token Gate Settings
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-3">
            Requires DHB tokens on Base chain ({DHB_SHORT})
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-1.5">
            Minimum DHB Required
          </Text>
          <TextInput
            value={tokenGateDraft.minAmount}
            onChangeText={(t) => setTokenGateDraft({ minAmount: t })}
            placeholder="10"
            placeholderTextColor="#6F7174"
            keyboardType="decimal-pad"
            className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
          />
          <View className="flex-row justify-end mt-3 gap-3">
            <TouchableOpacity onPress={cancelTokenGate} className="px-4 py-2">
              <Text className="text-theme-neutrals-400 text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmTokenGate}
              className="flex-row items-center px-4 py-2 rounded-lg bg-theme-blue-500"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>
    </View>
  );
};

export default React.memo(MonetizationPanel);
