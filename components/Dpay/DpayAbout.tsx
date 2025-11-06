import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type DpayAboutProps = {
  defaultOpen?: boolean;
};

const SectionRow: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }>
  = ({ icon, title, children }) => (
    <View className="mb-3">
      <View className="flex-row items-center mb-1">
        <Ionicons name={icon} size={14} color="#A6A9AC" />
        <Text className="text-white font-medium ml-2">{title}</Text>
      </View>
      <Text className="text-gray-400 text-xs leading-5">
        {children as any}
      </Text>
    </View>
  );

const DpayAbout: React.FC<DpayAboutProps> = ({ defaultOpen = false }) => {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  return (
    <View className="mt-4 rounded-2xl border border-theme-neutrals-700/60 bg-theme-neutrals-800">
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.85}
        className="px-4 py-3 flex-row items-center justify-between"
      >
        <View>
          <Text className="text-white font-semibold">About DeHub & payments</Text>
          {!open && (
            <Text className="text-gray-400 text-[11px] mt-0.5">Your gateway to seamless token payments</Text>
          )}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#9CA3AF" />
      </TouchableOpacity>

      {open && (
        <View className="px-4 pb-4">
          <SectionRow icon="pricetag" title="DeHub Token">
            Tokens are used for subscribing to creators, tipping streamers or unlocking content. The more you hold, the lower your fees are and the more superpowers you unlock like timeline trend boosts and verification badges.
          </SectionRow>
          <SectionRow icon="flash" title="Instant Payments">
            Using Stripe, you can buy tokens instantly and seamlessly into whatever account you're logged into. DeHub makes tokens simple and for all. If you need more support, just pop up in our 24/7 live community chat and ask for admin support.
          </SectionRow>
          <SectionRow icon="shield-checkmark" title="Secure Gateway">
            All payment details are encrypted and processed securely by Stripe. We can't access or store your sensitive information or card details, giving you ultimate peace of mind.
          </SectionRow>
        </View>
      )}
    </View>
  );
};

export default DpayAbout;
