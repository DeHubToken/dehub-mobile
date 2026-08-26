/**
 * MonetizationPanel
 *
 * Slide-up panel for PPV, Bounty, and Token Gated settings —
 * the same switches web shows in PostAccessToggles, in the same order.
 * Each option that needs values has a toggle + expandable inline form:
 * toggling on opens the form; confirming closes it and keeps the toggle on.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import GlassIndicator from "../ui/GlassIndicator";
import CustomSwitch from "../ui/CustomSwitch";
import { isSolanaChain, SOLANA_SPL_TOKENS } from "../../config/solana.constants";
import { supportedTokens, ChainId } from "../../config/constants";
import { useCreatorPlans } from "../../hooks/useCreatorPlans";
import { useUser } from "../../context/AuthContext";


export type PpvData = {
  price: string;
  /** Payment token symbol — DHB on EVM, or an SPL token on Solana (#41). */
  tokenSymbol?: string;
};

export type BountyData = {
  viewers: string;
  commenters: string;
  rewardPerPerson: string;
};

export type TokenGateData = {
  minAmount: string;
  /** Gate token symbol — DHB on EVM, or an SPL token on Solana (#41). */
  tokenSymbol?: string;
  /** Gate token contract address (EVM, #43) — any token on Base / BNB / ETH. */
  contractAddress?: string;
};

export type MonetizationState = {
  ppvEnabled: boolean;
  ppvData: PpvData;
  bountyEnabled: boolean;
  bountyData: BountyData;
  tokenGatedEnabled: boolean;
  tokenGateData: TokenGateData;
  /**
   * Gate the post behind the creator’s own subscription plans. Sent as plan
   * ids in `plans`, never as a token lock — see useUploadPost.
   */
  subscribersEnabled: boolean;
};

type MonetizationPanelProps = {
  state: MonetizationState;
  onChange: (next: MonetizationState) => void;
  /** Which section to auto-expand when the panel mounts, if any. */
  autoExpandSection?: "ppv" | "bounty" | "tokenGated" | null;
  onAutoExpandHandled?: () => void;
  /** Active post mint chain — enables SPL token selection on Solana (#41). */
  postChainId?: number;
};

/** Inline SPL token chip selector (Solana monetization). */
const SplTokenSelector: React.FC<{
  value?: string;
  onSelect: (symbol: string) => void;
}> = ({ value, onSelect }) => (
  <View className="flex-row gap-2 mb-3">
    {SOLANA_SPL_TOKENS.map((t) => {
      const active = (value || "SOL") === t.symbol;
      return (
        <TouchableOpacity
          key={t.symbol}
          onPress={() => onSelect(t.symbol)}
          className={`px-3 py-1.5 rounded-lg border ${
            active
              ? "bg-white/15 border-white/30"
              : "bg-theme-neutrals-900 border-theme-neutrals-700"
          }`}
        >
          <Text className={active ? "text-white text-xs font-semibold" : "text-theme-neutrals-400 text-xs"}>
            {t.symbol}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const EVM_CHAIN_LABELS: Record<number, string> = {
  [ChainId.BASE_MAINNET]: "Base",
  [ChainId.BSC_MAINNET]: "BNB",
  [ChainId.MAINNET]: "Ethereum",
};

/** Validate an EVM ERC-20 contract address (#43 custom token gating). */
const isValidEvmAddress = (addr: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(addr.trim());


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


const MonetizationPanel: React.FC<MonetizationPanelProps> = ({
  state,
  onChange,
  autoExpandSection,
  onAutoExpandHandled,
  postChainId,
}) => {
  const isSolana = isSolanaChain(postChainId);
  // The gate is the creator's own plans, so with none there is nothing to gate
  // on and the row stays off — see the comment on the switch.
  const user = useUser() as any;
  const { hasPlans, isLoading: plansLoading } = useCreatorPlans(user?.address);
  const evmGateChainId = postChainId && !isSolana ? postChainId : ChainId.BASE_MAINNET;
  const evmLockTokens = React.useMemo(
    () => supportedTokens.filter((t) => t.chainId === evmGateChainId),
    [evmGateChainId],
  );
  const evmChainLabel = EVM_CHAIN_LABELS[evmGateChainId] || "Base";
  const ppvCurrency = isSolana ? (state.ppvData.tokenSymbol || "SOL") : "DHB";
  const gateCurrency = isSolana
    ? (state.tokenGateData.tokenSymbol || "SOL")
    : (state.tokenGateData.tokenSymbol || "DHB");
  // Custom (off-list) token-gating on EVM chains (#43)
  const [gateUseCustom, setGateUseCustom] = useState(false);
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
      if (autoExpandSection === "tokenGated") {
        setTokenGateDraft(state.tokenGateData);
        const addr = state.tokenGateData.contractAddress;
        setGateUseCustom(
          !!addr && !evmLockTokens.some((t) => t.address.toLowerCase() === addr.toLowerCase()),
        );
        setGateError(null);
      }
      onAutoExpandHandled?.();
    }
  }, [autoExpandSection, onAutoExpandHandled, state, evmLockTokens]);


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


  const [gateError, setGateError] = useState<string | null>(null);

  const handleTokenGateToggle = useCallback(
    (val: boolean) => {
      if (val) {
        setTokenGateDraft(state.tokenGateData);
        setGateError(null);
        // Re-open in custom mode if the saved gate token isn't one of the listed tokens.
        const addr = state.tokenGateData.contractAddress;
        setGateUseCustom(
          !!addr && !evmLockTokens.some((t) => t.address.toLowerCase() === addr.toLowerCase()),
        );
        setExpandedSection("tokenGated");
      } else {
        onChange({ ...state, tokenGatedEnabled: false });
        if (expandedSection === "tokenGated") setExpandedSection(null);
      }
    },
    [state, onChange, expandedSection, evmLockTokens],
  );

  const confirmTokenGate = useCallback(() => {
    let next = { ...tokenGateDraft };
    if (!isSolana) {
      if (gateUseCustom) {
        const addr = (next.contractAddress || "").trim();
        if (!isValidEvmAddress(addr)) {
          setGateError("Enter a valid token contract address");
          return;
        }
        next = { ...next, contractAddress: addr, tokenSymbol: (next.tokenSymbol || "TOKEN").trim() || "TOKEN" };
      } else {
        // Resolve the listed token (default DHB) to its on-chain address (#43)
        const sym = next.tokenSymbol || "DHB";
        const picked = evmLockTokens.find((t) => t.symbol === sym) || evmLockTokens.find((t) => t.symbol === "DHB");
        next = { ...next, tokenSymbol: picked?.symbol || "DHB", contractAddress: picked?.address };
      }
    }
    setGateError(null);
    onChange({
      ...state,
      tokenGatedEnabled: true,
      tokenGateData: next,
    });
    setExpandedSection(null);
  }, [state, onChange, tokenGateDraft, isSolana, gateUseCustom, evmLockTokens]);

  const handleSubscribersToggle = useCallback(
    (val: boolean) => {
      onChange({ ...state, subscribersEnabled: val });
    },
    [state, onChange],
  );

  const cancelTokenGate = useCallback(() => {
    if (!state.tokenGatedEnabled)
      onChange({ ...state, tokenGatedEnabled: false });
    setExpandedSection(null);
  }, [state, onChange]);


  return (
    // No divider or top margin: these rows are the tail of the composer's single
    // options list (Mint, Title, Category, Community, then these), the way web's
    // PostAccessToggles renders them. UploadScreen is the only render site.
    <View>
      {/* Subscribers — EVM only.
          Not token gating: this sends the creator's plan ids on the post, and
          the feed opens it for whoever holds an active subscription to one.
          Token Gated below asks a different question (own N of a token), which
          any stranger can satisfy.

          Off with no plans, deliberately. The switch used to write a DHB lock
          with no amount when there was nothing real to write, which shipped
          posts gated against nothing. No plans, no gate. */}
      {!isSolana && (
        <View className="py-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Icon name="Star" size={18} color={hasPlans ? "#fff" : "rgba(255,255,255,0.4)"} />
              <Text className={hasPlans ? "text-white text-sm ml-3" : "text-white/40 text-sm ml-3"}>
                Subscribers
              </Text>
            </View>
            <CustomSwitch
              value={state.subscribersEnabled && hasPlans}
              onValueChange={handleSubscribersToggle}
              disabled={!hasPlans}
            />
          </View>
          {!hasPlans && !plansLoading && (
            <Text className="text-theme-neutrals-500 text-xs mt-1.5">
              Create a subscription plan on your profile first.
            </Text>
          )}
          {state.subscribersEnabled && hasPlans && (
            <Text className="text-theme-neutrals-500 text-xs mt-1.5">
              Only your subscribers can open this post.
            </Text>
          )}
        </View>
      )}

      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <Icon name="CreditCard" size={20} color="#fff" />
          <Text className="text-white text-sm ml-3">PPV</Text>
        </View>
        <CustomSwitch
          value={state.ppvEnabled || expandedSection === "ppv"}
          onValueChange={handlePpvToggle}
        />
      </View>
      <ExpandableSection
        expanded={expandedSection === "ppv"}
        maxHeight={SECTION_HEIGHT_PPV + (isSolana ? 48 : 0)}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-3">
            Set PPV Price
          </Text>
          {isSolana && (
            <SplTokenSelector
              value={ppvDraft.tokenSymbol}
              onSelect={(symbol) => setPpvDraft((d) => ({ ...d, tokenSymbol: symbol }))}
            />
          )}
          <Text className="text-theme-neutrals-400 text-xs mb-1.5">
            Price ({ppvCurrency})
          </Text>
          <TextInput
            value={ppvDraft.price}
            onChangeText={(t) => setPpvDraft((d) => ({ ...d, price: t }))}
            placeholder="10"
            placeholderTextColor="#6F7174"
            keyboardType="decimal-pad"
            className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
          />
          <Text className="text-theme-neutrals-500 text-xs mt-1.5">
            {isSolana
              ? `Payments are in ${ppvCurrency} on Solana`
              : "Payments are in DHB on Base chain"}
          </Text>
          <View className="flex-row justify-end mt-3 gap-3">
            <TouchableOpacity onPress={cancelPpv} className="px-4 py-2">
              <Text className="text-theme-neutrals-400 text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmPpv}
              className="flex-row items-center px-4 py-2 rounded-xl overflow-hidden"
            >
              <GlassIndicator borderRadius={12} />
              <Icon name="Check" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>

      {/* Bounty is EVM-only, as on web — the reward is locked in DHB by the
          mint transaction, and there is no Solana path for it. */}
      {!isSolana && (
        <View className="flex-row items-center justify-between py-3">
          <View className="flex-row items-center">
            <Icon name="Gift" size={18} color="#fff" />
            <Text className="text-white text-sm ml-3">Bounty</Text>
          </View>
          <CustomSwitch
            value={state.bountyEnabled || expandedSection === "bounty"}
            onValueChange={handleBountyToggle}
          />
        </View>
      )}
      <ExpandableSection
        expanded={!isSolana && expandedSection === "bounty"}
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
              className="flex-row items-center px-4 py-2 rounded-xl overflow-hidden"
            >
              <GlassIndicator borderRadius={12} />
              <Icon name="Check" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>

      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <Icon name="ShieldCheck" size={18} color="#fff" />
          <Text className="text-white text-sm ml-3">Token Gated</Text>
        </View>
        <CustomSwitch
          value={state.tokenGatedEnabled || expandedSection === "tokenGated"}
          onValueChange={handleTokenGateToggle}
        />
      </View>
      <ExpandableSection
        expanded={expandedSection === "tokenGated"}
        maxHeight={
          SECTION_HEIGHT_TOKEN + (isSolana ? 48 : 56) + (!isSolana && gateUseCustom ? 104 : 0)
        }
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-2">
            Token Gate Settings
          </Text>
          {isSolana ? (
            <>
              <Text className="text-theme-neutrals-400 text-xs mb-3">
                Requires an SPL token on Solana to view
              </Text>
              <SplTokenSelector
                value={tokenGateDraft.tokenSymbol}
                onSelect={(symbol) => setTokenGateDraft((d) => ({ ...d, tokenSymbol: symbol }))}
              />
            </>
          ) : (
            <>
              <Text className="text-theme-neutrals-400 text-xs mb-2">
                Viewers must hold this token on {evmChainLabel}
              </Text>
              {/* Token picker — listed tokens for the chain + custom (#43) */}
              <View className="flex-row flex-wrap gap-2 mb-3">
                {evmLockTokens.map((t) => {
                  const active = !gateUseCustom && (tokenGateDraft.tokenSymbol || "DHB") === t.symbol;
                  return (
                    <TouchableOpacity
                      key={t.address}
                      onPress={() => {
                        setGateUseCustom(false);
                        setGateError(null);
                        setTokenGateDraft((d) => ({ ...d, tokenSymbol: t.symbol, contractAddress: t.address }));
                      }}
                      className={`px-3 py-1.5 rounded-lg border ${
                        active ? "bg-white/15 border-white/30" : "bg-theme-neutrals-900 border-theme-neutrals-700"
                      }`}
                    >
                      <Text className={active ? "text-white text-xs font-semibold" : "text-theme-neutrals-400 text-xs"}>
                        {t.symbol}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => {
                    setGateUseCustom(true);
                    setGateError(null);
                    setTokenGateDraft((d) => ({ ...d, tokenSymbol: "", contractAddress: "" }));
                  }}
                  className={`px-3 py-1.5 rounded-lg border ${
                    gateUseCustom ? "bg-white/15 border-white/30" : "bg-theme-neutrals-900 border-theme-neutrals-700"
                  }`}
                >
                  <Text className={gateUseCustom ? "text-white text-xs font-semibold" : "text-theme-neutrals-400 text-xs"}>
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>
              {gateUseCustom && (
                <>
                  <TextInput
                    value={tokenGateDraft.contractAddress}
                    onChangeText={(t) => {
                      setGateError(null);
                      setTokenGateDraft((d) => ({ ...d, contractAddress: t }));
                    }}
                    placeholder="Contract address (0x…)"
                    placeholderTextColor="#6F7174"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-xs mb-2"
                  />
                  <TextInput
                    value={tokenGateDraft.tokenSymbol}
                    onChangeText={(t) => setTokenGateDraft((d) => ({ ...d, tokenSymbol: t.toUpperCase() }))}
                    placeholder="Symbol (e.g. PEPE)"
                    placeholderTextColor="#6F7174"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm mb-2"
                  />
                </>
              )}
            </>
          )}
          <Text className="text-theme-neutrals-400 text-xs mb-1.5">
            Minimum {gateCurrency} Required
          </Text>
          <TextInput
            value={tokenGateDraft.minAmount}
            onChangeText={(t) => setTokenGateDraft((d) => ({ ...d, minAmount: t }))}
            placeholder="10"
            placeholderTextColor="#6F7174"
            keyboardType="decimal-pad"
            className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
          />
          {gateError && <Text className="text-red-400 text-xs mt-1.5">{gateError}</Text>}
          <View className="flex-row justify-end mt-3 gap-3">
            <TouchableOpacity onPress={cancelTokenGate} className="px-4 py-2">
              <Text className="text-theme-neutrals-400 text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmTokenGate}
              className="flex-row items-center px-4 py-2 rounded-xl overflow-hidden"
            >
              <GlassIndicator borderRadius={12} />
              <Icon name="Check" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>
    </View>
  );
};

export default React.memo(MonetizationPanel);
