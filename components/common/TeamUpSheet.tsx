import React, { useDeferredValue, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useCreateTeamUp,
  useJoinTeamUp,
  useLeaveTeamUp,
  useRemoveTeamUpMember,
  useTeamUp,
  useTeamUpTeams,
} from '../../hooks/useSuperpowers';
import { getAvatarUrl, toastError, toastSuccess } from '../../libs';
import { useAuthActions } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';
import GlassModal from '../ui/GlassModal';
import Icon from '../ui/Icon';
import SuperPowerIcon from './SuperPowerIcon';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function memberName(member: { username: string | null; displayName: string | null; address: string }) {
  return member.displayName || (member.username ? `@${member.username.replace(/^@/, '')}` : `${member.address.slice(0, 6)}...${member.address.slice(-4)}`);
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
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const mine = useTeamUp(visible);
  const teams = useTeamUpTeams(deferredSearch, visible && !!address && !mine.data);
  const create = useCreateTeamUp();
  const join = useJoinTeamUp();
  const leave = useLeaveTeamUp();
  const remove = useRemoveTeamUpMember();
  const busy = create.isPending || join.isPending || leave.isPending || remove.isPending;
  const myAddress = address?.toLowerCase() ?? '';

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
        ) : mine.data ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.teamSummary}>
              <View style={styles.grow}>
                <Text style={styles.teamName} numberOfLines={1}>{mine.data.name}</Text>
                <Text style={styles.muted}>{mine.data.memberCount}/{mine.data.maxMembers} members</Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.teamTier}>{mine.data.tier || t('teamUp.noBadgeYet')}</Text>
                <Text style={styles.muted}>{compact.format(mine.data.pooledBadgeBalance)} DHB pooled</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>MEMBERS</Text>
            {mine.data.members.map(member => {
              const owner = member.address.toLowerCase() === mine.data!.ownerAddress.toLowerCase();
              const canRemove = mine.data!.ownerAddress.toLowerCase() === myAddress && !owner;
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
                        t('teamUp.removeBody', { name: memberName(member), team: mine.data!.name }),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('follow.remove'),
                            style: 'destructive',
                            onPress: () => remove.mutate(
                              { teamId: mine.data!.id, address: member.address },
                              { onError: (error: any) => toastError(error?.message || t('teamUp.removeFailed')) },
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
                t('teamUp.leaveBody', { name: mine.data!.name }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('teamUp.leaveAction'),
                    style: 'destructive',
                    onPress: () => leave.mutate(undefined, {
                      onSuccess: () => toastSuccess(t('teamUp.left')),
                      onError: (error: any) => toastError(error?.message || t('teamUp.leaveFailed')),
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
              <View style={styles.inputRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  placeholder={t('teamUp.namePlaceholder')}
                  placeholderTextColor="#61616B"
                  style={styles.input}
                  accessibilityLabel={t('teamUp.namePlaceholder')}
                />
                <Pressable
                  disabled={busy || name.trim().length < 3}
                  style={[styles.primaryButton, (busy || name.trim().length < 3) && styles.disabled]}
                  onPress={() => create.mutate(name, {
                    onSuccess: () => { setName(''); toastSuccess(t('teamUp.created')); },
                    onError: (error: any) => toastError(error?.message || t('teamUp.createFailed')),
                  })}
                >
                  <Text style={styles.primaryButtonText}>{t('communities.create')}</Text>
                </Pressable>
              </View>
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
            ) : (teams.data ?? []).map(team => (
              <View key={team.id} style={styles.teamRow}>
                <View style={styles.grow}>
                  <Text style={styles.memberName} numberOfLines={1}>{team.name}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {team.memberCount}/{team.maxMembers} members, {team.tier || 'no badge yet'}, {compact.format(team.pooledBadgeBalance)} DHB
                  </Text>
                </View>
                <Pressable
                  disabled={busy || team.memberCount >= team.maxMembers}
                  style={[styles.joinButton, (busy || team.memberCount >= team.maxMembers) && styles.disabled]}
                  onPress={() => join.mutate(team.id, {
                    onSuccess: () => toastSuccess(t('teamUp.joined', { name: team.name })),
                    onError: (error: any) => toastError(error?.message || t('teamUp.joinFailed')),
                  })}
                >
                  <Text style={styles.joinButtonText}>{team.memberCount >= team.maxMembers ? 'Full' : 'Join'}</Text>
                </Pressable>
              </View>
            ))}
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
  loading: { paddingVertical: 32, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  right: { alignItems: 'flex-end' },
  teamSummary: { flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14 },
  teamName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  teamTier: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  sectionLabel: { color: '#71717A', fontSize: 10.5, fontWeight: '600', letterSpacing: 1.1, marginTop: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 10 },
  memberName: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '500' },
  owner: { color: '#71717A', fontSize: 11 },
  link: { color: '#A1A1AA', fontSize: 12 },
  primaryButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F4F4F5', paddingHorizontal: 16 },
  primaryButtonText: { color: '#18181B', fontSize: 13, fontWeight: '700' },
  secondaryButton: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, marginTop: 4 },
  secondaryButtonText: { color: '#F4F4F5', fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, color: '#FFFFFF', paddingHorizontal: 12, fontSize: 14 },
  sectionHead: { gap: 3, marginTop: 4 },
  searchWrap: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 11 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 8 },
  empty: { alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 24 },
  emptyText: { color: '#A1A1AA', fontSize: 13 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 11 },
  joinButton: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 9, paddingHorizontal: 13 },
  joinButtonText: { color: '#F4F4F5', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
