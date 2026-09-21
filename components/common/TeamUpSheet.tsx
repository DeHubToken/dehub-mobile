import React, { useDeferredValue, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useApproveTeamUpRequest,
  useCancelTeamUpRequest,
  useCreateTeamUp,
  useDenyTeamUpRequest,
  useJoinTeamUp,
  useLeaveTeamUp,
  useRemoveTeamUpMember,
  useTeamUp,
  useTeamUpTeams,
  useUpdateTeamUp,
} from '../../hooks/useSuperpowers';
import type { TeamUpTeam } from '../../services/superpower.service';
import { getAvatarUrl, toastError, toastSuccess } from '../../libs';
import { useAuthActions } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';
import GlassModal from '../ui/GlassModal';
import Icon from '../ui/Icon';
import SuperPowerIcon from './SuperPowerIcon';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
// Mirrors the server's caps so the counter and the refusal never disagree.
const DESCRIPTION_MAX = 280;
const REQUEST_MESSAGE_MAX = 200;
const SWITCH_TRACK = { false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' };

interface Named {
  username: string | null;
  displayName: string | null;
  address: string;
}

function memberName(account: Named) {
  return account.displayName
    || (account.username ? `@${account.username.replace(/^@/, '')}` : `${account.address.slice(0, 6)}...${account.address.slice(-4)}`);
}

function errorText(error: any, fallback: string) {
  return typeof error?.message === 'string' && error.message ? error.message : fallback;
}

function PrivateBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Icon name="Lock" size={9} color="#D4D4D8" />
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function PrivacyToggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.grow}>
        <Text style={styles.toggleLabel}>{t('teamUp.privateLabel')}</Text>
        <Text style={styles.muted}>{t('teamUp.privateHint')}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={SWITCH_TRACK}
        thumbColor="#F4F4F5"
      />
    </View>
  );
}

export default function TeamUpSheet({
  visible,
  onClose,
  address,
}: {
  visible: boolean;
  onClose: () => void;
  address: string | null;
}) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthActions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [search, setSearch] = useState('');
  // The private team whose request note is being written, if any.
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const mine = useTeamUp(visible);
  const teams = useTeamUpTeams(deferredSearch, visible && !!address && !mine.data);
  const create = useCreateTeamUp();
  const update = useUpdateTeamUp();
  const join = useJoinTeamUp();
  const cancelRequest = useCancelTeamUpRequest();
  const approve = useApproveTeamUpRequest();
  const deny = useDenyTeamUpRequest();
  const leave = useLeaveTeamUp();
  const remove = useRemoveTeamUpMember();
  const busy = create.isPending || update.isPending || join.isPending || cancelRequest.isPending
    || approve.isPending || deny.isPending || leave.isPending || remove.isPending;
  const myAddress = address?.toLowerCase() ?? '';
  const team = mine.data;
  const isOwner = !!team && team.ownerAddress.toLowerCase() === myAddress;
  const tierLabel = (tier: string | null) => tier || t('teamUp.noBadgeYet');

  const startEditing = () => {
    setEditDescription(team?.description ?? '');
    setEditPrivate(team?.isPrivate ?? false);
    setEditing(true);
  };

  const sendJoin = (target: TeamUpTeam, message?: string) => join.mutate(
    { teamId: target.id, message },
    {
      onSuccess: result => {
        if ('requested' in result && result.requested) {
          toastSuccess(t('teamUp.requestSent'));
        } else {
          toastSuccess(t('teamUp.joined', { name: target.name }));
        }
        setRequesting(null);
        setRequestMessage('');
      },
      onError: (error: any) => toastError(errorText(
        error,
        target.isPrivate ? t('teamUp.requestFailed') : t('teamUp.joinFailed'),
      )),
    },
  );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <SuperPowerIcon power="team_up" style={styles.powerIcon} />
              <Text style={styles.title}>{t('teamUp.title')}</Text>
            </View>
            <Text style={styles.subtitle}>
              {t('teamUp.subtitle')}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Icon name="X" size={18} color="#A1A1AA" />
          </Pressable>
        </View>

        {!address ? (
          <View style={styles.panel}>
            <Text style={styles.body}>{t('teamUp.signInPrompt')}</Text>
            <Pressable onPress={() => requireAuth(() => {})} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('common.signIn')}</Text>
            </Pressable>
          </View>
        ) : mine.isLoading ? (
          <View style={styles.loading}><ActivityIndicator color="#A1A1AA" /></View>
        ) : team ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.teamSummary}>
              <View style={styles.summaryTop}>
                <View style={styles.grow}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.teamName, styles.shrink]} numberOfLines={1}>{team.name}</Text>
                    {team.isPrivate ? <PrivateBadge label={t('teamUp.privateBadge')} /> : null}
                  </View>
                  <Text style={styles.muted}>
                    {t('teamUp.membersCount', { count: team.memberCount, max: team.maxMembers })}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.teamTier}>{tierLabel(team.tier)}</Text>
                  <Text style={styles.muted}>
                    {t('teamUp.pooled', { amount: compact.format(team.pooledBadgeBalance) })}
                  </Text>
                </View>
              </View>

              {editing ? (
                <View style={styles.editBlock}>
                  <TextInput
                    value={editDescription}
                    onChangeText={setEditDescription}
                    maxLength={DESCRIPTION_MAX}
                    multiline
                    placeholder={t('teamUp.descriptionPlaceholder')}
                    placeholderTextColor="#61616B"
                    style={[styles.input, styles.multiline]}
                    accessibilityLabel={t('teamUp.descriptionPlaceholder')}
                  />
                  <PrivacyToggle value={editPrivate} onValueChange={setEditPrivate} disabled={busy} />
                  <View style={styles.buttonRow}>
                    <Pressable
                      disabled={busy}
                      style={[styles.primaryButton, busy && styles.disabled]}
                      onPress={() => update.mutate(
                        { description: editDescription, isPrivate: editPrivate },
                        {
                          onSuccess: () => { setEditing(false); toastSuccess(t('teamUp.updated')); },
                          onError: (error: any) => toastError(errorText(error, t('teamUp.updateFailed'))),
                        },
                      )}
                    >
                      <Text style={styles.primaryButtonText}>{t('common.save')}</Text>
                    </Pressable>
                    <Pressable disabled={busy} style={styles.ghostButton} onPress={() => setEditing(false)}>
                      <Text style={styles.link}>{t('common.cancel')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  {team.description ? <Text style={styles.description}>{team.description}</Text> : null}
                  {isOwner ? (
                    <Pressable onPress={startEditing} hitSlop={6} style={styles.selfStart}>
                      <Text style={styles.link}>{t('common.edit')}</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>

            {isOwner && team.isPrivate ? (
              <>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel}>{t('teamUp.joinRequests')}</Text>
                  {team.pendingCount > 0 ? (
                    <Text style={styles.muted}>{t('teamUp.waiting', { count: team.pendingCount })}</Text>
                  ) : null}
                </View>
                {(team.joinRequests ?? []).length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.muted}>{t('teamUp.noRequests')}</Text>
                  </View>
                ) : (team.joinRequests ?? []).map(request => (
                  <View key={request.address} style={styles.requestRow}>
                    <View style={styles.memberLine}>
                      <Avatar
                        uri={getAvatarUrl(request.avatarImageUrl || '')}
                        size={36}
                        name={memberName(request)}
                      />
                      <View style={styles.grow}>
                        <Text style={styles.memberName} numberOfLines={1}>{memberName(request)}</Text>
                        {request.message ? <Text style={styles.requestMessage}>{request.message}</Text> : null}
                      </View>
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable
                        disabled={busy}
                        style={[styles.primaryButton, styles.smallButton, busy && styles.disabled]}
                        onPress={() => approve.mutate(
                          { teamId: team.id, address: request.address },
                          {
                            onSuccess: () => toastSuccess(t('teamUp.approved', { name: memberName(request) })),
                            onError: (error: any) => toastError(errorText(error, t('teamUp.approveFailed'))),
                          },
                        )}
                      >
                        <Text style={styles.primaryButtonText}>{t('teamUp.approve')}</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        style={[styles.joinButton, busy && styles.disabled]}
                        onPress={() => deny.mutate(
                          { teamId: team.id, address: request.address },
                          {
                            onSuccess: () => toastSuccess(t('teamUp.declined')),
                            onError: (error: any) => toastError(errorText(error, t('teamUp.declineFailed'))),
                          },
                        )}
                      >
                        <Text style={styles.joinButtonText}>{t('teamUp.decline')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            <Text style={styles.sectionLabel}>{t('teamUp.members')}</Text>
            {team.members.map(member => {
              const owner = member.address.toLowerCase() === team.ownerAddress.toLowerCase();
              const canRemove = isOwner && !owner;
              return (
                <View key={member.address} style={styles.memberRow}>
                  <Avatar
                    uri={getAvatarUrl(member.avatarImageUrl || '')}
                    size={36}
                    name={memberName(member)}
                  />
                  <View style={styles.grow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {memberName(member)} {owner ? <Text style={styles.owner}>{t('communities.owner')}</Text> : null}
                    </Text>
                    <Text style={styles.muted}>{compact.format(member.ownBadgeBalance)} DHB</Text>
                  </View>
                  {canRemove ? (
                    <Pressable
                      disabled={busy}
                      onPress={() => Alert.alert(
                        t('teamUp.removeTitle'),
                        t('teamUp.removeBody', { name: memberName(member), team: team.name }),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('follow.remove'),
                            style: 'destructive',
                            onPress: () => remove.mutate(
                              { teamId: team.id, address: member.address },
                              { onError: (error: any) => toastError(errorText(error, t('teamUp.removeFailed'))) },
                            ),
                          },
                        ],
                      )}
                    >
                      <Text style={styles.link}>{t('follow.remove')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            <Pressable
              disabled={busy}
              style={styles.secondaryButton}
              onPress={() => Alert.alert(
                t('teamUp.leaveTitle'),
                t('teamUp.leaveBody', { name: team.name }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('teamUp.leaveAction'),
                    style: 'destructive',
                    onPress: () => leave.mutate(undefined, {
                      onSuccess: () => toastSuccess(t('teamUp.left')),
                      onError: (error: any) => toastError(errorText(error, t('teamUp.leaveFailed'))),
                    }),
                  },
                ],
              )}
            >
              <Text style={styles.secondaryButtonText}>{t('teamUp.leave')}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>{t('teamUp.make')}</Text>
              <Text style={styles.muted}>{t('teamUp.makeHint')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={40}
                placeholder={t('teamUp.namePlaceholder')}
                placeholderTextColor="#61616B"
                style={styles.input}
                accessibilityLabel={t('teamUp.namePlaceholder')}
              />
              <View>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  maxLength={DESCRIPTION_MAX}
                  multiline
                  placeholder={t('teamUp.descriptionPlaceholder')}
                  placeholderTextColor="#61616B"
                  style={[styles.input, styles.multiline]}
                  accessibilityLabel={t('teamUp.descriptionPlaceholder')}
                />
                <Text style={[styles.muted, styles.hint]}>{t('teamUp.descriptionHint')}</Text>
              </View>
              <PrivacyToggle value={isPrivate} onValueChange={setIsPrivate} disabled={busy} />
              <Pressable
                disabled={busy || name.trim().length < 3}
                style={[styles.primaryButton, (busy || name.trim().length < 3) && styles.disabled]}
                onPress={() => create.mutate(
                  { name, description, isPrivate },
                  {
                    onSuccess: () => {
                      setName('');
                      setDescription('');
                      setIsPrivate(false);
                      toastSuccess(t('teamUp.created'));
                    },
                    onError: (error: any) => toastError(errorText(error, t('teamUp.createFailed'))),
                  },
                )}
              >
                <Text style={styles.primaryButtonText}>{t('communities.create')}</Text>
              </Pressable>
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.panelTitle}>{t('teamUp.join')}</Text>
              <Text style={styles.muted}>{t('teamUp.joinHint')}</Text>
            </View>
            <View style={styles.searchWrap}>
              <Icon name="Search" size={16} color="#71717A" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('teamUp.searchPlaceholder')}
                placeholderTextColor="#61616B"
                style={styles.searchInput}
                accessibilityLabel={t('teamUp.searchPlaceholder')}
              />
            </View>

            {teams.isLoading ? (
              <View style={styles.loading}><ActivityIndicator color="#A1A1AA" /></View>
            ) : (teams.data ?? []).length === 0 ? (
              <View style={styles.empty}>
                <Icon name="Users" size={24} color="#52525B" />
                <Text style={styles.emptyText}>{t('teamUp.none')}</Text>
              </View>
            ) : (teams.data ?? []).map(candidate => {
              const full = candidate.memberCount >= candidate.maxMembers;
              const pending = candidate.myRequestPending === true;
              const composing = requesting === candidate.id;
              return (
                <View key={candidate.id} style={styles.teamCard}>
                  <View style={styles.teamRow}>
                    <View style={styles.grow}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.memberName, styles.shrink]} numberOfLines={1}>{candidate.name}</Text>
                        {candidate.isPrivate ? <PrivateBadge label={t('teamUp.privateBadge')} /> : null}
                      </View>
                      <Text style={styles.muted} numberOfLines={1}>
                        {t('teamUp.teamMeta', {
                          count: candidate.memberCount,
                          max: candidate.maxMembers,
                          tier: tierLabel(candidate.tier),
                          amount: compact.format(candidate.pooledBadgeBalance),
                        })}
                      </Text>
                    </View>
                    {full ? (
                      <View style={[styles.joinButton, styles.disabled]}>
                        <Text style={styles.joinButtonText}>{t('teamUp.full')}</Text>
                      </View>
                    ) : pending ? (
                      <Pressable
                        disabled={busy}
                        style={[styles.joinButton, busy && styles.disabled]}
                        onPress={() => cancelRequest.mutate(candidate.id, {
                          onSuccess: () => toastSuccess(t('teamUp.requestCancelled')),
                          onError: (error: any) => toastError(errorText(error, t('teamUp.cancelRequestFailed'))),
                        })}
                      >
                        <Text style={styles.joinButtonText}>{t('teamUp.cancelRequest')}</Text>
                      </Pressable>
                    ) : candidate.isPrivate ? (
                      <Pressable
                        disabled={busy || composing}
                        style={[styles.joinButton, (busy || composing) && styles.disabled]}
                        onPress={() => { setRequesting(candidate.id); setRequestMessage(''); }}
                      >
                        <Text style={styles.joinButtonText}>{t('teamUp.requestToJoin')}</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        disabled={busy}
                        style={[styles.joinButton, busy && styles.disabled]}
                        onPress={() => sendJoin(candidate)}
                      >
                        <Text style={styles.joinButtonText}>{t('teamUp.joinAction')}</Text>
                      </Pressable>
                    )}
                  </View>
                  {candidate.description ? (
                    <Text style={styles.cardDescription} numberOfLines={2}>{candidate.description}</Text>
                  ) : null}
                  {pending ? (
                    <Text style={styles.muted}>{t('teamUp.requestPending')}</Text>
                  ) : candidate.isPrivate && !composing ? (
                    <Text style={styles.muted}>{t('teamUp.privateCardHint')}</Text>
                  ) : null}
                  {composing ? (
                    <View style={styles.editBlock}>
                      <TextInput
                        value={requestMessage}
                        onChangeText={setRequestMessage}
                        maxLength={REQUEST_MESSAGE_MAX}
                        multiline
                        autoFocus
                        placeholder={t('teamUp.requestMessagePlaceholder')}
                        placeholderTextColor="#61616B"
                        style={[styles.input, styles.multiline]}
                        accessibilityLabel={t('teamUp.requestMessagePlaceholder')}
                      />
                      <View style={styles.buttonRow}>
                        <Pressable
                          disabled={busy}
                          style={[styles.primaryButton, styles.smallButton, busy && styles.disabled]}
                          onPress={() => sendJoin(candidate, requestMessage)}
                        >
                          <Text style={styles.primaryButtonText}>{t('teamUp.sendRequest')}</Text>
                        </Pressable>
                        <Pressable disabled={busy} style={styles.ghostButton} onPress={() => setRequesting(null)}>
                          <Text style={styles.link}>{t('common.cancel')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  sheet: { width: '100%', maxHeight: '82%', paddingHorizontal: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  headerText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  powerIcon: { width: 32, height: 32 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#A1A1AA', fontSize: 12, lineHeight: 17, marginTop: 4 },
  scroll: { maxHeight: 560 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  panel: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, gap: 9 },
  panelTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  body: { color: '#D4D4D8', fontSize: 13, lineHeight: 18 },
  muted: { color: '#808089', fontSize: 11.5, lineHeight: 16 },
  hint: { marginTop: 4 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  right: { alignItems: 'flex-end' },
  selfStart: { alignSelf: 'flex-start' },
  teamSummary: { gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14 },
  summaryTop: { flexDirection: 'row', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  teamTier: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  description: { color: '#D4D4D8', fontSize: 12.5, lineHeight: 17 },
  cardDescription: { color: '#A1A1AA', fontSize: 12, lineHeight: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#D4D4D8', fontSize: 9.5, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionLabel: { color: '#71717A', fontSize: 10.5, fontWeight: '600', letterSpacing: 1.1, marginTop: 4, textTransform: 'uppercase' },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 10 },
  memberLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '500' },
  owner: { color: '#71717A', fontSize: 11 },
  link: { color: '#A1A1AA', fontSize: 12 },
  requestRow: { gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 10 },
  requestMessage: { color: '#A1A1AA', fontSize: 12, lineHeight: 16 },
  requestActions: { flexDirection: 'row', gap: 8, paddingLeft: 46 },
  emptyRow: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 },
  primaryButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F4F4F5', paddingHorizontal: 16 },
  smallButton: { minHeight: 34, borderRadius: 9, paddingHorizontal: 13 },
  primaryButtonText: { color: '#18181B', fontSize: 13, fontWeight: '700' },
  secondaryButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, marginTop: 4 },
  secondaryButtonText: { color: '#F4F4F5', fontSize: 13 },
  ghostButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { minHeight: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, color: '#FFFFFF', paddingHorizontal: 12, fontSize: 14 },
  multiline: { minHeight: 64, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' },
  editBlock: { gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { color: '#FFFFFF', fontSize: 13.5 },
  sectionHead: { gap: 3, marginTop: 4 },
  searchWrap: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 11 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 8 },
  empty: { alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 24 },
  emptyText: { color: '#A1A1AA', fontSize: 13 },
  teamCard: { gap: 6, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 11 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  joinButton: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 9, paddingHorizontal: 13 },
  joinButtonText: { color: '#F4F4F5', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
