/**
 * CareersScreen
 * =============
 * Native port of the web CareersPage (/app/careers). Static role listings with
 * an inline BDM application form that writes to Supabase `job_applications`
 * (same table as web). Wording mirrors the web app's careers.* i18n strings.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon, { type IconName } from "../components/ui/Icon";
import { supabase } from "../services/supabase";
import { toastError, toastSuccess } from "../libs";
import { openInApp } from "../libs/links.utils";
import { WEBSITE_LINK, SUPPORT_MAIL } from "../config/links";
import { Linking } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BDM_RESP = [
  { icon: "Handshake" as IconName, text: "Identify and secure strategic partnerships with Web2 and Web3 companies that align with DeHub's mission" },
  { icon: "Target" as IconName, text: "Build and manage a pipeline of prospective partners, sponsors, and integration opportunities" },
  { icon: "Globe" as IconName, text: "Represent DeHub at industry events, conferences, and virtual summits" },
  { icon: "TrendingUp" as IconName, text: "Negotiate partnership terms, revenue-sharing models, and co-marketing agreements" },
  { icon: "Sparkles" as IconName, text: "Collaborate with the product and marketing teams to develop joint campaigns and integrations" },
];
const BDM_REQ = [
  "Proven experience in business development, partnerships, or sales within tech, gaming, or Web3",
  "Strong existing network in the crypto/Web3 or creator economy space is a huge plus",
  "Excellent communication and negotiation skills — you can close deals and build lasting relationships",
  "Self-motivated and comfortable working autonomously in a remote-first environment",
  "Genuine interest in decentralised social media, NFTs, or blockchain technology",
];
const AMB_RESP = [
  { icon: "Megaphone" as IconName, text: "Create and share authentic content about DeHub across your personal social channels" },
  { icon: "Heart" as IconName, text: "Actively engage with the DeHub community on the app — post, comment, and interact with other users" },
  { icon: "Globe" as IconName, text: "Attend and represent DeHub at real-life events, meetups, and conferences in your area" },
  { icon: "Users" as IconName, text: "Onboard new users and creators to the platform through your personal network" },
  { icon: "Sparkles" as IconName, text: "Provide feedback and ideas from the community to help shape the product roadmap" },
];
const AMB_REQ = [
  "Active social media presence with genuine engagement (follower count matters less than authenticity)",
  "Passion for Web3, crypto, gaming, or creator culture",
  "Strong communication skills and ability to explain complex concepts simply",
  "Self-starter who can plan and execute campaigns independently",
  "Previous ambassador, influencer, or community management experience is a bonus",
];

const Tag = ({ icon, label }: { icon: IconName; label: string }) => (
  <View style={styles.tag}>
    <Icon name={icon} size={13} color="#D4D4D8" />
    <Text style={styles.tagText}>{label}</Text>
  </View>
);

const SectionBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Bullet = ({ icon, text }: { icon: IconName; text: string }) => (
  <View style={styles.bulletRow}>
    <Icon name={icon} size={15} color="#71717A" />
    <Text style={styles.bulletText}>{text}</Text>
  </View>
);

interface BDMForm {
  name: string;
  email: string;
  telegram: string;
  twitter: string;
  instagram: string;
  linkedin: string;
  other_socials: string;
  past_experience: string;
  why_hire_you: string;
}
const EMPTY_FORM: BDMForm = {
  name: "", email: "", telegram: "", twitter: "",
  instagram: "", linkedin: "", other_socials: "",
  past_experience: "", why_hire_you: "",
};

const Field = ({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "email-address" | "default";
}) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={{ color: "#F87171" }}> *</Text>}
    </Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#52525B"
      style={[styles.input, multiline && styles.inputMultiline]}
      multiline={multiline}
      autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
      keyboardType={keyboardType}
    />
  </View>
);

export default function CareersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<BDMForm>(EMPTY_FORM);

  const set = useCallback((key: keyof BDMForm) => (t: string) => setForm((p) => ({ ...p, [key]: t })), []);

  const toggleForm = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFormOpen((v) => !v);
  }, []);

  const submit = useCallback(async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toastError("Name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("job_applications").insert({
        role: "Business Development Manager",
        name: form.name.trim(),
        email: form.email.trim(),
        telegram: form.telegram.trim() || null,
        twitter: form.twitter.trim() || null,
        instagram: form.instagram.trim() || null,
        linkedin: form.linkedin.trim() || null,
        other_socials: form.other_socials.trim() || null,
        past_experience: form.past_experience.trim() || null,
        why_hire_you: form.why_hire_you.trim() || null,
      });
      if (error) throw error;
      toastSuccess("Application submitted successfully! We'll be in touch.");
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch {
      toastError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Careers at DeHub</Text>
          <Text style={styles.subtitle}>Join the team building the future of decentralised social media</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 32, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          We're looking for passionate individuals who want to be part of the next wave of social media — one that puts
          creators and communities first. All roles are fully remote with flexible hours.
        </Text>

        {/* ── BDM Role ── */}
        <View style={styles.roleCard}>
          <View style={styles.roleHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>Business Development Managers</Text>
              <Text style={styles.roleCategory}>Partnerships & Growth</Text>
            </View>
            <View style={styles.openBadge}>
              <Text style={styles.openBadgeText}>Open</Text>
            </View>
          </View>

          <View style={styles.tagsRow}>
            <Tag icon="DollarSign" label="Negotiable Salary + OTE Commission" />
            <Tag icon="Clock" label="Flexible Hours" />
            <Tag icon="MapPin" label="Fully Remote" />
          </View>

          <SectionBlock title="About the Role">
            <Text style={styles.paragraph}>
              As one of our Business Development Managers at DeHub, you will be part of the driving force behind our
              partnership strategy. Your mission is to identify, engage, and close deals with companies across both Web2
              and Web3 — from gaming studios and content platforms to blockchain projects and DeFi protocols. This is an
              OTE (On-Target Earnings) commission-based position: the harder you hustle, the more you earn. The role is
              simple, bring on companies, projects, communities or any large profile accounts on to DeHub, and get paid.
            </Text>
          </SectionBlock>

          <SectionBlock title="Key Responsibilities">
            <View style={{ gap: 10 }}>{BDM_RESP.map((r, i) => <Bullet key={i} {...r} />)}</View>
          </SectionBlock>

          <SectionBlock title="What We're Looking For">
            <View style={{ gap: 10 }}>{BDM_REQ.map((t, i) => <Bullet key={i} icon="CircleCheckBig" text={t} />)}</View>
          </SectionBlock>

          <SectionBlock title="Compensation">
            <Text style={styles.paragraph}>
              This role offers a negotiable base salary plus an uncapped OTE commission structure tied directly to the
              partnerships you bring in. Top performers have unlimited earning potential.
            </Text>
          </SectionBlock>

          <Pressable style={styles.applyBtn} onPress={toggleForm}>
            <Icon name={formOpen ? "ChevronUp" : "Briefcase"} size={16} color="#FFFFFF" />
            <Text style={styles.applyText}>{formOpen ? "Close Application" : "Apply as BDM"}</Text>
          </Pressable>

          {formOpen && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>Your Application</Text>
              <Field label="Full Name" required value={form.name} onChangeText={set("name")} placeholder="Jane Smith" />
              <Field label="Email" required value={form.email} onChangeText={set("email")} placeholder="you@example.com" keyboardType="email-address" />
              <Field label="Telegram" value={form.telegram} onChangeText={set("telegram")} placeholder="@username" />
              <Field label="X (Twitter)" value={form.twitter} onChangeText={set("twitter")} placeholder="@username" />
              <Field label="Instagram" value={form.instagram} onChangeText={set("instagram")} placeholder="@username" />
              <Field label="LinkedIn" value={form.linkedin} onChangeText={set("linkedin")} placeholder="linkedin.com/in/you" />
              <Field label="Other Socials" value={form.other_socials} onChangeText={set("other_socials")} placeholder="TikTok, YouTube, Discord, etc." />
              <Field label="Past Experience" value={form.past_experience} onChangeText={set("past_experience")} placeholder="Tell us about your relevant BD, partnerships, or sales experience..." multiline />
              <Field label="Why should we hire you?" value={form.why_hire_you} onChangeText={set("why_hire_you")} placeholder="What makes you the right person for this role?" multiline />
              <Pressable style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Icon name="Send" size={15} color="#000000" />
                    <Text style={styles.submitText}>Submit Application</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Brand Ambassador Role ── */}
        <View style={styles.roleCard}>
          <View style={styles.roleHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>Brand Ambassador</Text>
              <Text style={styles.roleCategory}>Community & Evangelism</Text>
            </View>
            <View style={styles.openBadge}>
              <Text style={styles.openBadgeText}>Open</Text>
            </View>
          </View>

          <View style={styles.tagsRow}>
            <Tag icon="DollarSign" label="Negotiable Monthly Salary" />
            <Tag icon="Clock" label="Flexible Hours" />
            <Tag icon="MapPin" label="Fully Remote" />
          </View>

          <SectionBlock title="About the Role">
            <Text style={styles.paragraph}>
              As a DeHub Brand Ambassador you are the face and voice of the platform in your community. Your job is to
              spread the word about DeHub across every channel you touch — social media, IRL meetups, gaming events,
              university campuses, and beyond. This is a paid monthly salary role, not commission-based; you'll earn a
              consistent income while growing alongside the platform.
            </Text>
          </SectionBlock>

          <SectionBlock title="Key Responsibilities">
            <View style={{ gap: 10 }}>{AMB_RESP.map((r, i) => <Bullet key={i} {...r} />)}</View>
          </SectionBlock>

          <SectionBlock title="What We're Looking For">
            <View style={{ gap: 10 }}>{AMB_REQ.map((t, i) => <Bullet key={i} icon="CircleCheckBig" text={t} />)}</View>
          </SectionBlock>

          <SectionBlock title="Compensation">
            <Text style={styles.paragraph}>
              Brand Ambassadors receive a negotiable monthly salary paid consistently. Additional bonuses may be awarded
              based on campaign performance, user sign-ups, and community growth milestones.
            </Text>
          </SectionBlock>

          <Pressable style={styles.applyBtn} onPress={() => openInApp(`${WEBSITE_LINK}/creators`)}>
            <Icon name="Users" size={16} color="#FFFFFF" />
            <Text style={styles.applyText}>Apply as Brand Ambassador</Text>
            <Icon name="ExternalLink" size={13} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Don't see a role that fits? Reach out to us on{" "}
            <Text style={styles.footerLink} onPress={() => Linking.openURL(`mailto:${SUPPORT_MAIL}`)}>
              {SUPPORT_MAIL}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },
  intro: { color: "#D4D4D8", fontSize: 13, lineHeight: 20, marginBottom: 16, paddingHorizontal: 2 },
  roleCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 14,
    marginBottom: 16,
  },
  roleHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  roleTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  roleCategory: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  openBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  openBadgeText: { color: "#34D399", fontSize: 10, fontWeight: "600" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: { color: "#D4D4D8", fontSize: 11 },
  sectionTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", marginBottom: 10 },
  paragraph: { color: "#A1A1AA", fontSize: 13, lineHeight: 20 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletText: { flex: 1, color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    marginTop: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  applyText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  form: { marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", gap: 14 },
  formTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  fieldLabel: { color: "#D4D4D8", fontSize: 13 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: "top" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginTop: 4,
  },
  submitText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  footer: { marginTop: 12, alignItems: "center" },
  footerText: { color: "#71717A", fontSize: 12, textAlign: "center" },
  footerLink: { color: "#D4D4D8", textDecorationLine: "underline" },
});
