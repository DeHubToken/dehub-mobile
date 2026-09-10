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
import Avatar from './Avatar';
import GlassModal from '../ui/GlassModal';
import Icon from '../ui/Icon';

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
            <Text style={styles.title}>Team up</Text>
            <Text style={styles.subtitle}>
              Combine wallet power with up to seven others. Everyone wears the badge your total unlocks.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="X" size={18} color="#A1A1AA" />
          </Pressable>
        </View>

        {!address ? (
          <View style={styles.panel}>
            <Text style={styles.body}>Sign in to make or join a team. No badge is required.</Text>
            <Pressable onPress={() => requireAuth(() => {})} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Sign in</Text>
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
                <Text style={styles.teamTier}>{mine.data.tier || 'No badge yet'}</Text>
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
                      {memberName(member)} {owner ? <Text style={styles.owner}>Owner</Text> : null}
                    </Text>
                    <Text style={styles.muted}>{compact.format(member.ownBadgeBalance)} DHB</Text>
                  </View>
                  {canRemove ? (
                    <Pressable
                      disabled={busy}
                      onPress={() => Alert.alert(
                        'Remove member?',
                        `Remove ${memberName(member)} from ${mine.data!.name}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => remove.mutate(
                              { teamId: mine.data!.id, address: member.address },
                              { onError: (error: any) => toastError(error?.message || 'Could not remove that member') },
                            ),
                          },
                        ],
                      )}
                    >
                      <Text style={styles.link}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            <Pressable
              disabled={busy}
              style={styles.secondaryButton}
              onPress={() => Alert.alert(
                'Leave team?',
                `Leave ${mine.data!.name}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: () => leave.mutate(undefined, {
                      onSuccess: () => toastSuccess('You left the team'),
                      onError: (error: any) => toastError(error?.message || 'Could not leave that team'),
                    }),
                  },
                ],
              )}
            >
              <Text style={styles.secondaryButtonText}>Leave team</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Make a team</Text>
              <Text style={styles.muted}>You become the owner. Team names are public.</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  placeholder="Team name"
                  placeholderTextColor="#61616B"
                  style={styles.input}
                  accessibilityLabel="Team name"
                />
                <Pressable
                  disabled={busy || name.trim().length < 3}
                  style={[styles.primaryButton, (busy || name.trim().length < 3) && styles.disabled]}
                  onPress={() => create.mutate(name, {
                    onSuccess: () => { setName(''); toastSuccess('Team created'); },
                    onError: (error: any) => toastError(error?.message || 'Could not create that team'),
                  })}
                >
                  <Text style={styles.primaryButtonText}>Create</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.panelTitle}>Join a team</Text>
              <Text style={styles.muted}>You can only be in one team at a time.</Text>
            </View>
            <View style={styles.searchWrap}>
              <Icon name="Search" size={16} color="#71717A" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search teams"
                placeholderTextColor="#61616B"
                style={styles.searchInput}
                accessibilityLabel="Search teams"
              />
            </View>

            {teams.isLoading ? (
              <View style={styles.loading}><ActivityIndicator color="#A1A1AA" /></View>
            ) : (teams.data ?? []).length === 0 ? (
              <View style={styles.empty}>
                <Icon name="Users" size={24} color="#52525B" />
                <Text style={styles.emptyText}>No teams found.</Text>
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
                    onSuccess: () => toastSuccess(`Joined ${team.name}`),
                    onError: (error: any) => toastError(error?.message || 'Could not join that team'),
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
