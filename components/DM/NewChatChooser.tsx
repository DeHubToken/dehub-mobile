/**
 * What the + in Messages opens: a direct message, a new group, or a new
 * channel. Mirrors dehubweb NewMessageSelector.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";

interface Props {
  visible: boolean;
  onClose: () => void;
  onMessage: () => void;
  onGroup: () => void;
  onChannel: () => void;
}

export default function NewChatChooser({ visible, onClose, onMessage, onGroup, onChannel }: Props) {
  const { t } = useTranslation();
  const options = [
    { key: "dm", icon: "Mail", title: t("communities.newChat.message", { defaultValue: "New message" }), detail: t("communities.newChat.messageDetail", { defaultValue: "A private chat with one person" }), onPress: onMessage },
    { key: "group", icon: "Users", title: t("communities.newChat.newGroup", { defaultValue: "New group" }), detail: t("communities.newChat.groupDetail", { defaultValue: "Chat with many people, public or private" }), onPress: onGroup },
    { key: "channel", icon: "Megaphone", title: t("communities.newChat.newChannel", { defaultValue: "New channel" }), detail: t("communities.newChat.channelDetail", { defaultValue: "Broadcast to followers, free or paid" }), onPress: onChannel },
  ];
  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View style={styles.sheet}>
        <Text style={styles.title}>{t("communities.newChat.title", { defaultValue: "Start something" })}</Text>
        {options.map((o) => (
          <TouchableOpacity
            key={o.key}
            accessibilityRole="button"
            onPress={() => { onClose(); o.onPress(); }}
            testID={`new-chat-${o.key}`}
          >
            <View style={styles.row}>
              <View style={styles.iconBox}><Icon name={o.icon as any} size={20} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{o.title}</Text>
                <Text style={styles.rowDetail}>{o.detail}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: 20, paddingBottom: 12, gap: 10 },
  title: { color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "600" },
  rowDetail: { color: "#a1a1aa", fontSize: 13, marginTop: 2 },
});
