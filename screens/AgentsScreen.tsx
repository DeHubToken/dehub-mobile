/**
 * AgentsScreen
 * ============
 * Native port of web's /app/agents (src/pages/app/AgentsPage.tsx): create,
 * inspect and delete the AI agents a wallet owns. Each agent card carries its
 * API key, its personal MCP connector URL and the wallet it posts from.
 *
 * The agent wallet block asks the owner to fund gas, so it is left out of the
 * App Store build with the other paid surfaces (config/storefront).
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageEmpty, PageSection } from "../components/page/PageKit";
import { useUser } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import { WEBSITE_LINK } from "../config/links";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { openInApp } from "../libs/links.utils";
import { copyToClipboard } from "../libs/clipboard.utils";
import { toastError, toastSuccess } from "../libs/toast";
import { tokenRefreshManager } from "../libs/token-refresh";
import { retryWalletSession } from "../libs/wallet-session";
import {
  AGENT_AUTH_UNAVAILABLE,
  AGENT_SIGN_IN_REQUIRED,
  MCP_BASE,
  agentConnectorUrl,
  deleteAgent,
  fetchMyAgents,
  registerAgent,
  type AIAgent,
} from "../services/agents.service";

const MUTED = "#A1A1AA";

const maskApiKey = (key: string) =>
  key.substring(0, 10) + "•".repeat(20) + key.substring(key.length - 4);
const maskConnectorUrl = (key: string) => `${MCP_BASE}/k/${key.substring(0, 10)}${"•".repeat(16)}`;

function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={styles.iconBtn}>
      <Icon name={icon} size={15} color={MUTED} />
    </Pressable>
  );
}

function SecretBlock({
  icon,
  label,
  value,
  help,
  actions,
}: {
  icon?: IconName;
  label: string;
  value: string;
  help?: string;
  actions: React.ReactNode;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <View style={styles.blockLabelRow}>
          {icon ? <Icon name={icon} size={12} color={MUTED} /> : null}
          <Text style={styles.blockLabel}>{label}</Text>
        </View>
        <View style={styles.blockActions}>{actions}</View>
      </View>
      <Text style={styles.mono} selectable>
        {value}
      </Text>
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

export default function AgentsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUser();
  const walletAddress = (user?.walletAddress || user?.address || null) as string | null;
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [revealing, setRevealing] = useState(false);
  // Keys registration just handed back. The list only carries a key for a
  // signed request, so a new agent's key would otherwise vanish on refetch
  // whenever this phone has no session yet. Kept for this visit only.
  const [createdKeys, setCreatedKeys] = useState<Record<string, string>>({});

  const { data: agents, isLoading, isError, refetch } = useQuery({
    queryKey: ["ai-agents", walletAddress],
    queryFn: () => fetchMyAgents(walletAddress as string),
    enabled: !!walletAddress,
  });

  const createAgent = useMutation({
    mutationFn: () => registerAgent({ name: name.trim(), description: description.trim(), walletAddress: walletAddress as string }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      setIsCreating(false);
      setName("");
      setDescription("");
      toastSuccess(t("agents.agentCreated"), { description: t("agents.saveApiKey") });
      const id = data?.agent?.id;
      const key = data?.agent?.api_key;
      if (id) setVisibleKeys((prev) => new Set([...prev, id]));
      if (id && key) setCreatedKeys((prev) => ({ ...prev, [id]: key }));
    },
    onError: (error: Error) => {
      if (error?.message === AGENT_SIGN_IN_REQUIRED) {
        Alert.alert(t("agents.createSignIn"), undefined, [
          { text: t("agents.cancel"), style: "cancel" },
          { text: t("agents.signInAgain"), onPress: () => navigation.navigate(ScreenNames.SignIn) },
        ]);
        return;
      }
      const description = error?.message === AGENT_AUTH_UNAVAILABLE ? t("agents.checkConnection") : error?.message;
      toastError(t("agents.failedCreate"), t("agents.failedCreate"), { description });
    },
  });

  const removeAgent = useMutation({
    mutationFn: (agentId: string) => deleteAgent(agentId, walletAddress as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toastSuccess(t("agents.agentDeleted"));
    },
    onError: () => toastError(t("agents.failedDelete"), t("agents.failedDelete")),
  });

  /**
   * A missing key means this phone could not prove the wallet just now. Try
   * to prove it before asking anyone to sign in: mint a session, and if the
   * DeHub token has lapsed, refresh it and mint again. Only when that fails is
   * signing in again the answer.
   */
  const revealKeys = async () => {
    if (!walletAddress || revealing) return;
    setRevealing(true);
    try {
      let reason = await retryWalletSession(walletAddress);
      if (reason === "no_token" && (await tokenRefreshManager.attemptRefresh())) {
        reason = await retryWalletSession(walletAddress);
      }
      if (!reason) {
        const { data } = await refetch();
        if (data?.some((agent) => agent.api_key)) return;
      }
      if (reason === "no_token") {
        Alert.alert(t("agents.revealSignIn"), undefined, [
          { text: t("agents.cancel"), style: "cancel" },
          { text: t("agents.signInAgain"), onPress: () => navigation.navigate(ScreenNames.SignIn) },
        ]);
      } else {
        toastError(t("agents.revealFailed"), t("agents.revealFailed"));
      }
    } finally {
      setRevealing(false);
    }
  };

  const toggleKey = (id: string) =>
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = (value: string, message: string) => {
    copyToClipboard(value);
    toastSuccess(message);
  };

  const confirmDelete = (agent: AIAgent) =>
    Alert.alert(agent.name, t("agents.deleteConfirm"), [
      { text: t("agents.cancel"), style: "cancel" },
      { text: t("agents.delete"), style: "destructive", onPress: () => removeAgent.mutate(agent.id) },
    ]);

  if (!walletAddress) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("agents.title")} icon="assistant" />
        <View style={styles.centered}>
          <PageEmpty
            icon="assistant"
            title={t("agents.connectToManage")}
            body={t("agents.signInToCreate")}
            action={<KitButton label={t("screens.signIn")} onPress={() => navigation.navigate(ScreenNames.SignIn)} />}
          />
        </View>
      </View>
    );
  }

  const renderAgent = (agent: AIAgent) => {
    const visible = visibleKeys.has(agent.id);
    const apiKey = agent.api_key ?? createdKeys[agent.id] ?? null;
    return (
      <PageSection key={agent.id}>
        <View style={styles.cardInner}>
          <View style={styles.agentHead}>
            <View style={styles.avatar}>
              <Icon name="Bot" size={20} color="#fff" />
            </View>
            <View style={styles.agentText}>
              <Text style={styles.agentName} numberOfLines={1}>
                {agent.name}
              </Text>
              {agent.description ? <Text style={styles.agentDesc}>{agent.description}</Text> : null}
            </View>
            <View style={[styles.badge, agent.is_active && styles.badgeActive]}>
              <Text style={[styles.badgeText, agent.is_active && styles.badgeTextActive]}>
                {agent.is_active ? t("agents.active") : t("agents.inactive")}
              </Text>
            </View>
          </View>

          {apiKey ? (
            <SecretBlock
              label={t("agents.apiKey")}
              value={visible ? apiKey : maskApiKey(apiKey)}
              actions={
                <>
                  <IconButton icon={visible ? "EyeOff" : "Eye"} label={t("agents.apiKey")} onPress={() => toggleKey(agent.id)} />
                  <IconButton icon="Copy" label={t("common.copy")} onPress={() => copy(apiKey, t("agents.apiKeyCopied"))} />
                </>
              }
            />
          ) : (
            <SecretBlock
              label={t("agents.apiKey")}
              value={t("agents.keyHidden")}
              actions={
                <Pressable
                  onPress={revealKeys}
                  disabled={revealing}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.revealBtn}
                >
                  {revealing ? <ActivityIndicator size="small" color={MUTED} /> : <Icon name="Eye" size={13} color={MUTED} />}
                  <Text style={styles.revealText}>{t("agents.revealKey")}</Text>
                </Pressable>
              }
            />
          )}

          <SecretBlock
            icon="Link2"
            label={t("agents.connectorUrl")}
            value={!apiKey ? `${MCP_BASE}/k/${"•".repeat(16)}` : visible ? agentConnectorUrl(apiKey) : maskConnectorUrl(apiKey)}
            help={t("agents.connectorUrlHelp")}
            actions={
              apiKey ? (
                <IconButton
                  icon="Copy"
                  label={t("common.copy")}
                  onPress={() => copy(agentConnectorUrl(apiKey), t("agents.connectorUrlCopied"))}
                />
              ) : null
            }
          />

          {DIGITAL_PURCHASES_ENABLED ? (
            <SecretBlock
              icon="Wallet"
              label={t("agents.agentWallet")}
              value={agent.owner_wallet_address}
              help={t("agents.agentWalletHelp")}
              actions={
                <IconButton
                  icon="Copy"
                  label={t("common.copy")}
                  onPress={() => copy(agent.owner_wallet_address, t("agents.walletCopied"))}
                />
              }
            />
          ) : null}

          <View style={styles.meta}>
            <Text style={styles.metaText}>
              {t("agents.created")} {new Date(agent.created_at).toLocaleDateString(i18n.language)}
            </Text>
            <Pressable
              onPress={() => confirmDelete(agent)}
              style={styles.deleteBtn}
              accessibilityRole="button"
              disabled={removeAgent.isPending}
            >
              <Icon name="Trash2" size={13} color="#F87171" />
              <Text style={styles.deleteText}>{t("agents.delete")}</Text>
            </Pressable>
          </View>
        </View>
      </PageSection>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("agents.title")} icon="assistant" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t("agents.description")}</Text>
        <View style={styles.links}>
          <Pressable onPress={() => navigation.navigate(ScreenNames.Connect)} style={styles.link} accessibilityRole="link">
            <Icon name="Plug" size={14} color="#fff" />
            <Text style={styles.linkText}>{t("nav.connectAi")}</Text>
          </Pressable>
          <Pressable onPress={() => openInApp(`${WEBSITE_LINK}/skill.md`)} style={styles.link} accessibilityRole="link">
            <Icon name="ExternalLink" size={14} color="#fff" />
            <Text style={styles.linkText}>{t("agents.apiDocs")}</Text>
          </Pressable>
        </View>

        {isCreating ? (
          <PageSection>
            <View style={styles.cardInner}>
              <Text style={styles.formTitle}>{t("agents.newAgent")}</Text>
              <Text style={styles.agentDesc}>{t("agents.createDescription")}</Text>
              <Text style={styles.fieldLabel}>{t("agents.agentName")}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("agents.agentNamePlaceholder")}
                placeholderTextColor="#8B8D90"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>{t("agents.agentDescription")}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t("agents.agentDescriptionPlaceholder")}
                placeholderTextColor="#8B8D90"
                multiline
                style={[styles.input, styles.inputMultiline]}
              />
              <View style={styles.formActions}>
                <Pressable
                  onPress={() => createAgent.mutate()}
                  disabled={!name.trim() || createAgent.isPending}
                  style={[styles.primaryBtn, (!name.trim() || createAgent.isPending) && styles.disabled]}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryBtnText}>
                    {createAgent.isPending ? t("agents.creating") : t("agents.createAgent")}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setIsCreating(false)} style={styles.ghostBtn} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>{t("agents.cancel")}</Text>
                </Pressable>
              </View>
            </View>
          </PageSection>
        ) : (
          <KitButton
            variant="quiet"
            onPress={() => setIsCreating(true)}
            style={styles.createBtn}
            icon={<Icon name="Plus" size={16} color="#fff" />}
            label={t("agents.createNew")}
          />
        )}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : isError ? (
          <PageEmpty
            icon="assistant"
            title={t("agents.loadFailed")}
            action={<KitButton variant="quiet" label={t("common.retry")} onPress={() => refetch()} />}
          />
        ) : !agents?.length ? (
          <PageEmpty icon="assistant" title={t("agents.noAgents")} />
        ) : (
          agents.map(renderAgent)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  content: { paddingTop: 4, paddingBottom: 48, gap: 12 },
  intro: { color: MUTED, fontSize: 13, lineHeight: 19, paddingHorizontal: 16 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: 16 },
  link: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { color: "#fff", fontSize: 13, textDecorationLine: "underline" },
  loading: { paddingVertical: 32, alignItems: "center" },
  centered: { flex: 1, justifyContent: "center" },

  cardInner: { gap: 12 },
  agentHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  agentText: { flex: 1, minWidth: 0, gap: 2 },
  agentName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  agentDesc: { color: MUTED, fontSize: 13, lineHeight: 18 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: "rgba(255,255,255,0.08)" },
  badgeActive: { backgroundColor: "#fff" },
  badgeText: { color: MUTED, fontSize: 11, fontWeight: "600" },
  badgeTextActive: { color: "#000" },

  block: { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12, gap: 4 },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blockLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  blockLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  blockActions: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 4 },
  revealBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  revealText: { color: MUTED, fontSize: 12, fontWeight: "600" },
  mono: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "monospace" },
  help: { color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 16, marginTop: 4 },

  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaText: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  deleteText: { color: "#F87171", fontSize: 12 },

  formTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  fieldLabel: { color: MUTED, fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  formActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  primaryBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#000", fontSize: 14, fontWeight: "600" },
  ghostBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  ghostBtnText: { color: "#fff", fontSize: 14 },
  disabled: { opacity: 0.5 },
  createBtn: { marginHorizontal: 16 },
});
