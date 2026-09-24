import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { openAppSettings } from "../../libs/permissions.util";

/**
 * Wallet QR codes are either the bare address or an EIP-681 / Solana Pay URI
 * ("ethereum:0xabc@8453?value=…", "solana:Mint…?amount=…"). Keep only the
 * address so the field validates it like a typed one.
 */
export function addressFromQr(data: string): string {
  const body = data.trim().replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "");
  return body.split(/[@?/]/)[0].trim();
}

type Props = {
  /** Receives the pasted or scanned text; the field decides whether it is valid. */
  onValue: (value: string) => void;
  /** Offer the QR scanner next to Paste. */
  scan?: boolean;
  disabled?: boolean;
};

/**
 * Paste and Scan QR buttons for a wallet-address field. Addresses are 42+
 * characters nobody types by hand, and the keyboard's own paste is two taps
 * away inside a long-press menu.
 */
export default function AddressInputTools({ onValue, scan = false, disabled = false }: Props) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);

  const paste = useCallback(async () => {
    const text = (await Clipboard.getStringAsync().catch(() => ""))?.trim();
    if (text) onValue(text);
  }, [onValue]);

  return (
    <>
      <View style={styles.row}>
        <Pressable
          onPress={paste}
          disabled={disabled}
          hitSlop={6}
          accessibilityRole="button"
          style={({ pressed }) => [styles.chip, (pressed || disabled) && styles.dim]}
        >
          <Icon name="ClipboardPaste" size={14} color="#E4E4E7" />
          <Text style={styles.chipText}>{t("common.paste")}</Text>
        </Pressable>
        {scan && (
          <Pressable
            onPress={() => setScanning(true)}
            disabled={disabled}
            hitSlop={6}
            accessibilityRole="button"
            style={({ pressed }) => [styles.chip, (pressed || disabled) && styles.dim]}
          >
            <Icon name="ScanLine" size={14} color="#E4E4E7" />
            <Text style={styles.chipText}>{t("common.scanQr")}</Text>
          </Pressable>
        )}
      </View>
      {scan && scanning && (
        <QrScanModal
          onClose={() => setScanning(false)}
          onScan={(data) => {
            setScanning(false);
            const address = addressFromQr(data);
            if (address) onValue(address);
          }}
        />
      )}
    </>
  );
}

function QrScanModal({ onClose, onScan }: { onClose: () => void; onScan: (data: string) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera keeps reporting the same code every frame; take the first one.
  const [done, setDone] = useState(false);

  const askForCamera = useCallback(async () => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      await openAppSettings();
      return;
    }
    await requestPermission();
  }, [permission, requestPermission]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scanner}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={done ? undefined : ({ data }) => {
              if (!data) return;
              setDone(true);
              onScan(data);
            }}
          />
        ) : (
          <Pressable onPress={askForCamera} style={styles.permission} accessibilityRole="button">
            <Icon name="Camera" size={28} color="#E4E4E7" />
            <Text style={styles.permissionText}>{t("common.allowCameraForQr")}</Text>
          </Pressable>
        )}
        {permission?.granted && (
          <View pointerEvents="none" style={styles.frameWrap}>
            <View style={styles.frame} />
            <Text style={styles.hint}>{t("common.scanQrHint")}</Text>
          </View>
        )}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={[styles.close, { top: insets.top + 12 }]}
        >
          <Icon name="X" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  dim: { opacity: 0.5 },
  chipText: { color: "#E4E4E7", fontSize: 13, fontWeight: "600" },
  scanner: { flex: 1, backgroundColor: "#000" },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  permissionText: { color: "#E4E4E7", fontSize: 15, textAlign: "center" },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 20 },
  frame: { width: 240, height: 240, borderRadius: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" },
  hint: { color: "#FFFFFF", fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  close: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});
