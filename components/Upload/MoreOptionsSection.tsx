import React, { useState } from "react";
import { View, Text, Switch, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Dropdown from "../ui/Dropdown";
import InfoTooltip from "../ui/InfoTooltip";

export type MoreOptionsSectionProps = {
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  // Lock Content
  lockContent: boolean;
  setLockContent: (v: boolean) => void;
  lockTokenSymbol: string;
  setLockTokenSymbol: (v: string) => void;
  lockNetwork: string;
  setLockNetwork: (v: string) => void;
  lockAmount: string;
  setLockAmount: (v: string) => void;
  lockTokenDropdown: { label: string; value: string; disabled?: boolean }[];
  networkDropdown: { label: string; value: string; disabled?: boolean }[];
  // PPV
  payPerView: boolean;
  setPayPerView: (v: boolean) => void;
  ppvTokenSymbol: string;
  setPpvTokenSymbol: (v: string) => void;
  ppvNetwork: string;
  setPpvNetwork: (v: string) => void;
  ppvAmount: string;
  setPpvAmount: (v: string) => void;
  ppvTokenDropdown: { label: string; value: string; disabled?: boolean }[];
  // Bounty
  bounty: boolean;
  setBounty: (v: boolean) => void;
  bountyChain: string;
  setBountyChain: (v: string) => void;
  bountyTokenSymbol: string;
  setBountyTokenSymbol: (v: string) => void;
  bountyFirstXViewer: string;
  setBountyFirstXViewer: (v: string) => void;
  bountyFirstXComment: string;
  setBountyFirstXComment: (v: string) => void;
  bountyAmount: string;
  setBountyAmount: (v: string) => void;
};

const MoreOptionsSection: React.FC<MoreOptionsSectionProps> = (props) => {
  const [showLockInfo, setShowLockInfo] = React.useState(false);
  const [showPPVInfo, setShowPPVInfo] = React.useState(false);
  const [showBountyInfo, setShowBountyInfo] = React.useState(false);

  return (
    <View className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900">
      <TouchableOpacity
        onPress={() => props.setShowAdvanced(!props.showAdvanced)}
        activeOpacity={0.8}
        className="px-4 py-3 flex-row items-center justify-between"
      >
        <Text className="text-white font-semibold">More Options</Text>
        <Ionicons
          name={props.showAdvanced ? "chevron-up" : "chevron-down"}
          size={18}
          color="#9CA3AF"
        />
      </TouchableOpacity>
      {props.showAdvanced && (
        <View className="px-4 pb-4">
          <View className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 relative">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-white font-medium">Lock Content</Text>
                <InfoTooltip open={showLockInfo} onOpenChange={setShowLockInfo} triggerClassName="pl-2">
                  <Text className="text-[11px] leading-4 text-white">
                    Lock Content restricts playback to viewers who hold at least the specified Amount of the selected Token on the chosen Network. Viewers who do not meet the requirement will see a locked state.
                  </Text>
                  <View className="flex-row justify-end mt-2">
                    <TouchableOpacity onPress={() => setShowLockInfo(false)} className="px-2 py-1 rounded bg-zinc-800">
                      <Text className="text-white">Got it</Text>
                    </TouchableOpacity>
                  </View>
                </InfoTooltip>
              </View>
              <Switch value={props.lockContent} onValueChange={props.setLockContent} />
            </View>
            {props.lockContent && (
              <View className="mt-3">
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">Token Symbol</Text>
                  <Dropdown value={props.lockTokenSymbol} onChange={props.setLockTokenSymbol} placeholder="Select token" options={props.lockTokenDropdown} />
                </View>
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">Network</Text>
                  <Dropdown value={props.lockNetwork} onChange={props.setLockNetwork} placeholder="Select network" options={props.networkDropdown} searchable />
                </View>
                <View className="mb-1">
                  <Text className="text-gray-400 mb-1">Amount</Text>
                  <TextInput value={props.lockAmount} onChangeText={props.setLockAmount} placeholder="0.0" keyboardType="decimal-pad" placeholderTextColor="#9CA3AF" className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white" />
                </View>
              </View>
            )}
          </View>

          <View className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 relative">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-white font-medium">Pay Per View</Text>
                <InfoTooltip open={showPPVInfo} onOpenChange={setShowPPVInfo} triggerClassName="pl-2">
                  <Text className="text-[11px] leading-4 text-white">
                    Pay Per View charges viewers the specified Amount in the selected Token on the chosen Network before playback starts. Funds are collected per viewer.
                  </Text>
                  <View className="flex-row justify-end mt-2">
                    <TouchableOpacity onPress={() => setShowPPVInfo(false)} className="px-2 py-1 rounded bg-zinc-800">
                      <Text className="text-white">Got it</Text>
                    </TouchableOpacity>
                  </View>
                </InfoTooltip>
              </View>
              <Switch value={props.payPerView} onValueChange={props.setPayPerView} />
            </View>
            {props.payPerView && (
              <View className="mt-3">
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">Token Symbol</Text>
                  <Dropdown value={props.ppvTokenSymbol} onChange={props.setPpvTokenSymbol} placeholder="Select token" options={props.ppvTokenDropdown} />
                </View>
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">Network</Text>
                  <Dropdown value={props.ppvNetwork} onChange={props.setPpvNetwork} placeholder="Select network" options={props.networkDropdown} searchable />
                </View>
                <View className="mb-1">
                  <Text className="text-gray-400 mb-1">Amount</Text>
                  <TextInput value={props.ppvAmount} onChangeText={props.setPpvAmount} placeholder="0.0" keyboardType="decimal-pad" placeholderTextColor="#9CA3AF" className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white" />
                </View>
              </View>
            )}
          </View>

          <View className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 relative">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-white font-medium">Bounty</Text>
                <InfoTooltip open={showBountyInfo} onOpenChange={setShowBountyInfo} triggerClassName="pl-2">
                  <Text className="text-[11px] leading-4 text-white">
                    Bounty rewards early engagement: you can reward the first X viewers and the first X comments with the specified Amount of the selected Token on the chosen Network after mint.
                  </Text>
                  <View className="flex-row justify-end mt-2">
                    <TouchableOpacity onPress={() => setShowBountyInfo(false)} className="px-2 py-1 rounded bg-zinc-800">
                      <Text className="text-white">Got it</Text>
                    </TouchableOpacity>
                  </View>
                </InfoTooltip>
              </View>
              <Switch value={props.bounty} onValueChange={props.setBounty} />
            </View>
            {props.bounty && (
              <View className="mt-3">
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">Network</Text>
                  <Dropdown value={props.bountyChain} onChange={props.setBountyChain} placeholder="Select network" options={props.networkDropdown} searchable />
                </View>
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">Token Symbol</Text>
                  <Dropdown value={props.bountyTokenSymbol} onChange={props.setBountyTokenSymbol} placeholder="Select token" options={props.lockTokenDropdown} />
                </View>
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">First X Viewers</Text>
                  <TextInput value={props.bountyFirstXViewer} onChangeText={props.setBountyFirstXViewer} placeholder="0" keyboardType="number-pad" placeholderTextColor="#9CA3AF" className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white" />
                </View>
                <View className="mb-3">
                  <Text className="text-gray-400 mb-1">First X Comments</Text>
                  <TextInput value={props.bountyFirstXComment} onChangeText={props.setBountyFirstXComment} placeholder="0" keyboardType="number-pad" placeholderTextColor="#9CA3AF" className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white" />
                </View>
                <View className="mb-1">
                  <Text className="text-gray-400 mb-1">Amount</Text>
                  <TextInput value={props.bountyAmount} onChangeText={props.setBountyAmount} placeholder="0.0" keyboardType="decimal-pad" placeholderTextColor="#9CA3AF" className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white" />
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

export default MoreOptionsSection;
