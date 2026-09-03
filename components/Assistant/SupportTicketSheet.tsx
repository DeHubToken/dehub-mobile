/**
 * Support Ticket Sheet
 * ====================
 * The Support button's whole surface: what you have already filed, and a form
 * to file something new.
 *
 * Deliberately not a conversation. The assistant can raise a ticket too, but
 * that route spends a paid model round trip to fill in a form, and it reads the
 * statuses back in its own words — the last thing somebody chasing a two-week-
 * old bug report wants. This talks to `/api/support` directly: no quote, no DHB
 * transfer, no paywall.
 *
 * Web twin: `src/components/app/assistant/SupportTicketDrawer.tsx`.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import GlassModal from '../ui/GlassModal';
import Icon, { type IconName } from '../ui/Icon';
import { toastError, toastInfo, toastSuccess } from '../../libs/toast';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_SEVERITIES,
  createSupportTicket,
  getMySupportTickets,
  isTicketOpen,
  type SupportCategory,
  type SupportSeverity,
  type SupportTicket,
} from '../../services/support.service';

export const SUPPORT_TICKETS_QUERY_KEY = ['support', 'tickets'] as const;

/**
 * Read the caller's tickets. Exported so the assistant header can badge the
 * button with how many are still open without mounting the sheet — that count
 * is the entire reason somebody taps it.
 */
export function useMySupportTickets(enabled: boolean) {
  return useQuery({
    queryKey: SUPPORT_TICKETS_QUERY_KEY,
    queryFn: () => getMySupportTickets(25),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

const OPEN_COLOR = '#F9FBFF';
const MUTED_COLOR = '#6F7174';

const TicketRow = memo<{ ticket: SupportTicket }>(({ ticket }) => {
  const { t } = useTranslation();
  const open = isTicketOpen(ticket.status);
  const iconName: IconName = ticket.status === 'resolved' ? 'CircleCheckBig' : open ? 'Clock' : 'CircleAlert';

  return (
    <View style={s.row}>
      <View style={s.rowHead}>
        <View style={s.rowHeadText}>
          <Text style={s.subject} numberOfLines={2}>
            {ticket.subject}
          </Text>
          <Text style={s.meta}>
            {ticket.ref} · {t(`support.category.${ticket.category}`)}
          </Text>
        </View>
        <View style={[s.pill, open ? s.pillOpen : s.pillClosed]}>
          <Icon name={iconName} size={11} color={open ? OPEN_COLOR : MUTED_COLOR} />
          <Text style={[s.pillText, { color: open ? OPEN_COLOR : MUTED_COLOR }]}>
            {t(`support.status.${ticket.status}`)}
          </Text>
        </View>
      </View>

      {/* The one thing on a ticket written for the reporter to read. */}
      {!!ticket.resolution && <Text style={s.resolution}>{ticket.resolution}</Text>}

      <Text style={s.timestamp}>{t('support.filedOn', { date: formatDate(ticket.createdAt) })}</Text>
    </View>
  );
});

/** Dates arrive as strings and are occasionally absent or unparseable. */
function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

/** A pill row standing in for a picker — nine options do not need a modal. */
const OptionRow = memo<{
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  label: (value: string) => string;
}>(({ options, value, onChange, label }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.optionScroll}>
    {options.map((option) => (
      <TouchableOpacity
        key={option}
        onPress={() => onChange(option)}
        activeOpacity={0.7}
        style={[s.option, value === option && s.optionActive]}
      >
        <Text style={[s.optionText, value === option && s.optionTextActive]}>{label(option)}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
));

interface SupportTicketSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Signed in? Nothing is fetched when not. */
  enabled?: boolean;
}

const SupportTicketSheet: React.FC<SupportTicketSheetProps> = ({
  visible,
  onClose,
  enabled = true,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);

  const [category, setCategory] = useState<SupportCategory>('bug');
  const [severity, setSeverity] = useState<SupportSeverity>('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');

  const { data, isLoading, isError, refetch } = useMySupportTickets(enabled && visible);

  // Opening the sheet is the user asking "what happened to my ticket", so the
  // answer should not be a minute stale.
  useEffect(() => {
    if (visible) refetch();
  }, [visible, refetch]);

  const { openTickets, closedTickets } = useMemo(() => {
    const tickets = data?.tickets ?? [];
    return {
      openTickets: tickets.filter((ticket) => isTicketOpen(ticket.status)),
      closedTickets: tickets.filter((ticket) => !isTicketOpen(ticket.status)),
    };
  }, [data]);

  const resetForm = useCallback(() => {
    setSubject('');
    setDescription('');
    setStepsToReproduce('');
    setCategory('bug');
    setSeverity('normal');
  }, []);

  const file = useMutation({
    mutationFn: () =>
      createSupportTicket({
        category,
        severity,
        subject: subject.trim(),
        description: description.trim(),
        stepsToReproduce: stepsToReproduce.trim() || undefined,
      }),
    onSuccess: (result) => {
      // The server hands back the ticket you already have rather than opening a
      // second one for the same complaint — say so, or it reads as a bug.
      if (result.duplicateOf) {
        toastInfo(t('support.alreadyOpen', { ref: result.duplicateOf }));
      } else if (result.emailed) {
        toastSuccess(t('support.filed', { ref: result.ref }));
      } else {
        // Recorded, but the mail did not leave. The reference still resolves,
        // so this is "we have it", not "try again".
        toastSuccess(t('support.filedNotEmailed', { ref: result.ref }));
      }
      resetForm();
      setComposing(false);
      queryClient.invalidateQueries({ queryKey: SUPPORT_TICKETS_QUERY_KEY });
    },
    onError: (error: any) => {
      // The API's refusals are written for the reporter ("the description is
      // too thin to act on", "you have already opened three tickets today") —
      // show them, do not replace them with a generic failure.
      toastError(error?.message || t('support.filingFailed'));
    },
  });

  const canSubmit =
    subject.trim().length >= 3 && description.trim().length >= 20 && !file.isPending;

  const isEmpty = !isLoading && !isError && openTickets.length === 0 && closedTickets.length === 0;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="88%">
      <View style={s.header}>
        <TouchableOpacity
          onPress={composing ? () => setComposing(false) : onClose}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={composing ? t('support.backToTickets') : t('support.title')}
        >
          <Icon name={composing ? 'ArrowLeft' : 'LifeBuoy'} size={18} color={OPEN_COLOR} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>{composing ? t('support.newTicket') : t('support.title')}</Text>
          <Text style={s.subtitle}>
            {composing ? t('support.newTicketHint') : t('support.subtitle')}
          </Text>
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {composing ? (
          <>
            <Text style={s.fieldLabel}>{t('support.categoryLabel')}</Text>
            <OptionRow
              options={SUPPORT_CATEGORIES}
              value={category}
              onChange={(value) => setCategory(value as SupportCategory)}
              label={(value) => t(`support.category.${value}`)}
            />

            <Text style={s.fieldLabel}>{t('support.severityLabel')}</Text>
            <OptionRow
              options={SUPPORT_SEVERITIES}
              value={severity}
              onChange={(value) => setSeverity(value as SupportSeverity)}
              label={(value) => t(`support.severity.${value}`)}
            />

            <Text style={s.fieldLabel}>{t('support.subjectLabel')}</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={160}
              placeholder={t('support.subjectPlaceholder')}
              placeholderTextColor={MUTED_COLOR}
              style={s.input}
            />

            <Text style={s.fieldLabel}>{t('support.descriptionLabel')}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={4000}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              placeholder={t('support.descriptionPlaceholder')}
              placeholderTextColor={MUTED_COLOR}
              style={[s.input, s.textarea]}
            />

            <Text style={s.fieldLabel}>{t('support.stepsLabel')}</Text>
            <TextInput
              value={stepsToReproduce}
              onChangeText={setStepsToReproduce}
              maxLength={2000}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              placeholder={t('support.stepsPlaceholder')}
              placeholderTextColor={MUTED_COLOR}
              style={[s.input, s.textareaSmall]}
            />

            <TouchableOpacity
              onPress={() => file.mutate()}
              disabled={!canSubmit}
              activeOpacity={0.8}
              style={[s.submit, !canSubmit && s.submitDisabled]}
            >
              {file.isPending && <ActivityIndicator size="small" color="#0B0C0D" />}
              <Text style={s.submitText}>
                {file.isPending ? t('support.submitting') : t('support.submit')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setComposing(true)}
              activeOpacity={0.8}
              style={s.newTicket}
            >
              <Icon name="Plus" size={15} color={OPEN_COLOR} />
              <Text style={s.newTicketText}>{t('support.newTicket')}</Text>
            </TouchableOpacity>

            {isLoading && <ActivityIndicator style={s.spinner} color={MUTED_COLOR} />}

            {isError && !isLoading && <Text style={s.empty}>{t('support.loadFailed')}</Text>}

            {isEmpty && <Text style={s.empty}>{t('support.noTickets')}</Text>}

            {openTickets.length > 0 && (
              <>
                <Text style={s.sectionHeading}>
                  {t('support.openHeading', { n: openTickets.length })}
                </Text>
                {openTickets.map((ticket) => (
                  <TicketRow key={ticket.ref} ticket={ticket} />
                ))}
              </>
            )}

            {closedTickets.length > 0 && (
              <>
                <Text style={s.sectionHeading}>
                  {t('support.closedHeading', { n: closedTickets.length })}
                </Text>
                {closedTickets.map((ticket) => (
                  <TicketRow key={ticket.ref} ticket={ticket} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </GlassModal>
  );
};

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerText: { flex: 1 },
  title: { color: '#F9FBFF', fontSize: 17, fontWeight: '600' },
  subtitle: { color: '#6F7174', fontSize: 12, marginTop: 2 },
  body: { maxHeight: 520 },
  bodyContent: { padding: 16, paddingBottom: 24 },
  newTicket: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 16,
  },
  newTicketText: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  spinner: { marginVertical: 28 },
  empty: { color: '#6F7174', fontSize: 13, textAlign: 'center', marginVertical: 28 },
  sectionHeading: {
    color: '#6F7174',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    marginBottom: 8,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowHeadText: { flex: 1 },
  subject: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  meta: { color: '#6F7174', fontSize: 11, marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillOpen: { borderColor: 'rgba(255,255,255,0.3)' },
  pillClosed: { borderColor: 'rgba(255,255,255,0.1)' },
  pillText: { fontSize: 11 },
  resolution: {
    color: 'rgba(249,251,255,0.7)',
    fontSize: 12,
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.2)',
  },
  timestamp: { color: '#55585B', fontSize: 11, marginTop: 8 },
  fieldLabel: { color: '#6F7174', fontSize: 12, marginBottom: 6, marginTop: 12 },
  optionScroll: { flexGrow: 0 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginRight: 6,
  },
  optionActive: { backgroundColor: '#F9FBFF', borderColor: '#F9FBFF' },
  optionText: { color: '#A6A9AC', fontSize: 12 },
  optionTextActive: { color: '#0B0C0D', fontWeight: '600' },
  input: {
    // 16px or iOS zooms the whole sheet on focus.
    fontSize: 16,
    color: '#F9FBFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: { height: 120 },
  textareaSmall: { height: 84 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F9FBFF',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 20,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#0B0C0D', fontSize: 14, fontWeight: '600' },
});

export default memo(SupportTicketSheet);
