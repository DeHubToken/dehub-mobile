import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Image, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { DhbCoin } from "../common/DhbCoin";
import { sanitizeAmountInput } from "../../libs/amount-input";
import { toastError, toastSuccess } from "../../libs/toast";
import { APP_TOKENS_QUERY_KEY, useAppTokens } from "../../hooks/useAppTokens";
import {
  findAppTokenRecipient, newAppTokenKey, sendAppTokens,
  type AppTokenEntry, type AppTokenPerson,
} from "../../services/app-tokens.service";

/**
 * App tokens: DHB held on DeHub, not on a chain. The send sheet moves app
 * tokens to another account and never touches a chain; the history sheet
 * shows the balance and every movement. Mirrors web AppTokens.tsx.
 */

const fmt = (amount: string | number) =>
  Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 });

function personName(p?: AppTokenPerson) {
  if (!p) return "";
  return p.username ? `@${p.username}` : `${p.address.slice(0, 6)}…${p.address.slice(-4)}`;
}

export const AppTokenSendSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useAppTokens(open);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState<AppTokenPerson | null>(null);
  const [looking, setLooking] = useState(false);
  const [sending, setSending] = useState(false);
  // One key per attempt: kept across a retry of the same send, replaced once it lands.
  const keyRef = useRef(newAppTokenKey());

  const balance = Number(data?.balance ?? 0);
  const value = Number(amount);
  const tooMuch = value > balance;
  const canSend = !!recipient && value > 0 && !tooMuch && !sending;

  useEffect(() => {
    setRecipient(null);
    const text = to.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLooking(true);
      try {
        const found = await findAppTokenRecipient(text);
        if (!cancelled) setRecipient(found);
      } catch {
        if (!cancelled) setRecipient(null);
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [to]);

  // A changed send is a new send, so it gets a new key.
  useEffect(() => { keyRef.current = newAppTokenKey(); }, [to, amount]);

  const close = () => { if (!sending) onClose(); };

  const send = async () => {
    if (!canSend || !recipient) return;
    setSending(true);
    try {
      await sendAppTokens({ to: recipient.address, amount: amount.trim(), key: keyRef.current, purpose: "transfer", note: note.trim() || undefined });
      toastSuccess(t("appTokens.sent", { amount: fmt(amount), name: personName(recipient) }));
      keyRef.current = newAppTokenKey();
      setTo(""); setAmount(""); setNote("");
      void queryClient.invalidateQueries({ queryKey: [APP_TOKENS_QUERY_KEY] });
      onClose();
    } catch (err: any) {
      const code = err?.code;
      toastError(
        code === "INSUFFICIENT" ? t("appTokens.errorInsufficient")
          : code === "RATE_LIMIT" ? t("appTokens.errorRateLimit")
          : code === "NO_RECIPIENT" ? t("appTokens.errorNoRecipient")
          : code === "SELF" ? t("appTokens.errorSelf")
          : err?.message || t("appTokens.errorGeneric"),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassModal visible={open} onClose={close} presentation="center" blurIntensity={40}>
      <View className="p-6 gap-5">
        <View>
          <Text className="text-white font-bold text-2xl tracking-wider">{t("appTokens.sendTitle")}</Text>
          <Text className="text-[12px] text-white/60 mt-2 leading-5">{t("appTokens.sendHint")}</Text>
        </View>
        <View>
          <Text className="text-white text-base font-semibold mb-2">{t("appTokens.to")}</Text>
          <TextInput
            placeholder={t("appTokens.toPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholderTextColor="#8B8D90"
            value={to}
            onChangeText={setTo}
            className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base"
          />
          {looking ? (
            <Text className="text-xs text-white/60 mt-2">{t("appTokens.looking")}</Text>
          ) : recipient ? (
            <View className="flex-row items-center gap-2 mt-2">
              {recipient.avatarImageUrl
                ? <Image source={{ uri: recipient.avatarImageUrl }} className="w-6 h-6 rounded" />
                : <Ionicons name="person-circle-outline" size={22} color="#aaa" />}
              <Text className="text-sm text-white" numberOfLines={1}>{recipient.displayName || personName(recipient)}</Text>
              {!!recipient.displayName && <Text className="text-xs text-white/50" numberOfLines={1}>{personName(recipient)}</Text>}
            </View>
          ) : to.trim().length >= 2 ? (
            <Text className="text-xs text-white/60 mt-2">{t("appTokens.errorNoRecipient")}</Text>
          ) : null}
        </View>
        <View>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-base text-white">{t("appTokens.amount")}</Text>
            <TouchableOpacity onPress={() => setAmount(String(balance))} hitSlop={8}>
              <Text className="text-[11px] text-white/60">{t("appTokens.available", { amount: fmt(balance) })}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#8B8D90"
            value={amount}
            onChangeText={(v) => setAmount(sanitizeAmountInput(v))}
            className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base"
          />
          {tooMuch && <Text className="text-xs text-white/80 mt-1">{t("appTokens.errorInsufficient")}</Text>}
          <TextInput
            placeholder={t("appTokens.notePlaceholder")}
            placeholderTextColor="#8B8D90"
            value={note}
            maxLength={140}
            onChangeText={setNote}
            className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base mt-3"
          />
        </View>
        <View className="flex-row items-center justify-center gap-3">
          <AccentButtonGradient>
            <TouchableOpacity
              disabled={!canSend}
              onPress={send}
              className={`flex-row items-center gap-2 px-5 h-11 rounded-xl bg-transparent ${!canSend ? "opacity-60" : ""}`}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
              <Text className="text-white font-semibold">{t("appTokens.sendButton")}</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
          <TouchableOpacity
            disabled={sending}
            onPress={close}
            className={`px-5 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center ${sending ? "opacity-60" : ""}`}
          >
            <Text className="text-white font-semibold">{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

function EntryRow({ entry }: { entry: AppTokenEntry }) {
  const { t } = useTranslation();
  const who = personName(entry.counterparty);
  const label = {
    opening: t("appTokens.kindOpening"),
    send: t("appTokens.kindSent", { name: who }),
    receive: t("appTokens.kindReceived", { name: who }),
    spend: t("appTokens.kindSpent"),
    refund: t("appTokens.kindRefund"),
    deposit: t("appTokens.kindDeposit"),
    adjust: t("appTokens.kindAdjust"),
  }[entry.kind];
  const positive = !entry.amount.startsWith("-");
  return (
    <View className="flex-row items-center justify-between gap-3 py-2.5 border-b border-white/5">
      <View className="flex-1 min-w-0">
        <Text className="text-sm text-white" numberOfLines={1}>{label}</Text>
        <Text className="text-[11px] text-white/50" numberOfLines={1}>
          {new Date(entry.at).toLocaleString()}{entry.note ? ` · ${entry.note}` : ""}
        </Text>
      </View>
      <Text className={`text-sm font-medium ${positive ? "text-emerald-400" : "text-white"}`}>
        {positive ? "+" : "−"}{fmt(entry.amount.replace("-", ""))} <DhbCoin />
      </Text>
    </View>
  );
}

export const AppTokenHistorySheet: React.FC<{ open: boolean; onClose: () => void; onSend: () => void }> = ({ open, onClose, onSend }) => {
  const { t } = useTranslation();
  const { data, isLoading } = useAppTokens(open);
  return (
    <GlassModal visible={open} onClose={onClose} presentation="bottom" scrollable>
      <View className="p-5 gap-4">
        <Text className="text-white font-bold text-xl">{t("appTokens.title")}</Text>
        <View className="rounded-xl bg-white/5 border border-white/10 p-4">
          <Text className="text-2xl font-bold text-white">{fmt(data?.balance ?? 0)} <DhbCoin /></Text>
          <Text className="text-[12px] leading-5 text-white/50 mt-2">{t("appTokens.explainer")}</Text>
        </View>
        <TouchableOpacity onPress={() => { onClose(); onSend(); }} className="h-11 rounded-xl bg-theme-neutrals-700 flex-row items-center justify-center gap-2">
          <Ionicons name="arrow-up" size={16} color="#fff" />
          <Text className="text-white font-semibold">{t("assets.send")}</Text>
        </TouchableOpacity>
        <Text className="text-[11px] uppercase tracking-wide text-white/50">{t("appTokens.history")}</Text>
        {isLoading ? <ActivityIndicator color="#aaa" /> : data?.entries?.length ? (
          <ScrollView style={{ maxHeight: 360 }}>
            {data.entries.map((e, i) => <EntryRow key={`${e.at}-${i}`} entry={e} />)}
          </ScrollView>
        ) : (
          <Text className="text-sm text-white/50">{t("appTokens.noHistory")}</Text>
        )}
      </View>
    </GlassModal>
  );
};
