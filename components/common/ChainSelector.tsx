import React, { memo, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { ChainId, chainIcons } from "../../config/constants";
import { SOLANA_MAINNET_CHAIN_ID } from "../../config/solana.constants";

export interface ChainOption {
  id: number;
  name: string;
  symbol: string;
  icon: any;
}

const SOLANA_LOGO = { uri: "https://cryptologos.cc/logos/solana-sol-logo.png" };

/** EVM chains used for tips, uploads, PPV. */
export const EVM_CHAINS: ChainOption[] = [
  { id: ChainId.BASE_MAINNET, name: "Base", symbol: "BASE", icon: chainIcons[ChainId.BASE_MAINNET] },
  { id: ChainId.BSC_MAINNET, name: "BNB", symbol: "BNB", icon: chainIcons[ChainId.BSC_MAINNET] },
  { id: ChainId.MAINNET, name: "Ethereum", symbol: "ETH", icon: chainIcons[ChainId.MAINNET] },
];

/** Solana chain (post minting only — not EVM tips/PPV). */
export const SOLANA_CHAIN_OPTION: ChainOption = {
  id: SOLANA_MAINNET_CHAIN_ID,
  name: "Solana",
  symbol: "SOL",
  icon: SOLANA_LOGO,
};

const ALL_CHAINS: ChainOption[] = [...EVM_CHAINS, SOLANA_CHAIN_OPTION];

export function getChainOption(chainId?: number): ChainOption | undefined {
  return ALL_CHAINS.find((c) => c.id === chainId);
}

interface ChainSelectorProps {
  selectedChainId?: number;
  onChange: (chainId: number) => void;
  variant?: "icon" | "compact";
  disabled?: boolean;
  /** Heading inside the picker sheet */
  title?: string;
  /** Include Solana (post minting). Default false (EVM-only). */
  includeSolana?: boolean;
}

const ChainSelectorComponent: React.FC<ChainSelectorProps> = ({
  selectedChainId,
  onChange,
  variant = "compact",
  disabled = false,
  title = "Choose network",
  includeSolana = false,
}) => {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const chains = includeSolana ? ALL_CHAINS : EVM_CHAINS;
  const selected = useMemo(
    () => getChainOption(selectedChainId) || chains[0],
    [selectedChainId, chains],
  );

  const handleSelect = (id: number) => {
    setOpen(false);
    if (id !== selectedChainId) onChange(id);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        activeOpacity={0.7}
        style={[
          styles.trigger,
          variant === "icon" && styles.triggerIcon,
          disabled && { opacity: 0.5 },
        ]}
      >
        <Image source={selected.icon} style={styles.triggerIconImg} />
        {variant === "compact" && (
          <>
            <Text style={styles.triggerText}>{selected.name}</Text>
            <Icon name="ChevronDown" size={14} color="#A6A9AC" />
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
            onPress={() => {}}
          >
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
              {...(Platform.OS === "android"
                ? { experimentalBlurMethod: "dimezisBlurView" }
                : {})}
            />
            <View style={[StyleSheet.absoluteFill, styles.sheetOverlay]} />

            <Text style={styles.title}>{title}</Text>

            {chains.map((chain) => {
              const active = chain.id === selectedChainId;
              return (
                <TouchableOpacity
                  key={chain.id}
                  onPress={() => handleSelect(chain.id)}
                  activeOpacity={0.7}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <View style={styles.rowLeft}>
                    <Image source={chain.icon} style={styles.rowIcon} />
                    <Text style={styles.rowName}>{chain.name}</Text>
                  </View>
                  {active && <Icon name="Check" size={18} color="#F9FBFF" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  triggerIcon: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  triggerIconImg: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  triggerText: {
    color: "#F9FBFF",
    fontSize: 13,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sheetOverlay: {
    backgroundColor: "rgba(20,20,20,0.55)",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  title: {
    color: "#F9FBFF",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  rowActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  rowName: {
    color: "#F9FBFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default memo(ChainSelectorComponent);
