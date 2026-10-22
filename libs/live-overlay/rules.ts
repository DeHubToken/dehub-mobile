/**
 * Stream rules, as the stream API stores them. The twin of dehubweb
 * src/lib/live-overlay/rules.ts (and dehub-stream-backend
 * src/live-overlay/live-rules.ts). The server validates and runs them; this is
 * the shape Live Studio edits and the names it shows.
 */

export const RULE_TRIGGERS = ['tip', 'follow', 'subscribe', 'share', 'live', 'command', 'keyword', 'chat'] as const;
export type RuleTriggerType = (typeof RULE_TRIGGERS)[number];

export const RULE_ACTION_TYPES = ['alert', 'sound', 'say', 'chat', 'webhook'] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export const RULE_AUDIENCES = ['everyone', 'followers', 'subscribers'] as const;
export type RuleAudience = (typeof RULE_AUDIENCES)[number];

/** The sounds a rule can play, by id — served by the web app. The server refuses anything else. */
export const RULE_SOUND_FILES: Record<string, string> = {
  airhorn: 'https://dehub.io/sounds/airhorn.wav',
  applause: 'https://dehub.io/sounds/applause.wav',
  cricket: 'https://dehub.io/sounds/crickets.mp3',
  drumroll: 'https://dehub.io/sounds/drumroll.wav',
  lol: 'https://dehub.io/sounds/lol.mp3',
  'ooh-ahh': 'https://dehub.io/sounds/ooh-ahh.mp3',
  'ooh-man': 'https://dehub.io/sounds/ooh-man.wav',
  'ohh-girl': 'https://dehub.io/sounds/ohh-girl.ogg',
  'ba-dum-tish': 'https://dehub.io/sounds/ba-dum-tish.wav',
  spooky: 'https://dehub.io/sounds/spooky.wav',
  'magic-spell': 'https://dehub.io/sounds/magic-spell.m4a',
  shhh: 'https://dehub.io/sounds/shhh.m4a',
};
export const RULE_SOUNDS = Object.keys(RULE_SOUND_FILES);

export const MAX_RULES = 30;
export const MAX_ACTIONS = 5;

export interface RuleTrigger {
  type: RuleTriggerType;
  minAmount?: number;
  command?: string;
  keyword?: string;
}

export type RuleAction =
  | { type: 'alert'; text: string; durationMs: number }
  | { type: 'sound'; sound: string }
  | { type: 'say'; text: string }
  | { type: 'chat'; text: string }
  | { type: 'webhook'; url: string; text: string };

export interface LiveRule {
  id: string;
  enabled: boolean;
  name: string;
  trigger: RuleTrigger;
  audience: RuleAudience;
  cooldownSec: number;
  userCooldownSec: number;
  blockedWords: string[];
  actions: RuleAction[];
}

/** Triggers that come from chat, where an audience gate and blocked words apply. */
export const isChatTrigger = (type: RuleTriggerType) => type === 'command' || type === 'keyword' || type === 'chat';

export function freshRuleId(existing: LiveRule[]): string {
  const taken = new Set(existing.map((r) => r.id));
  let n = 1;
  while (taken.has(`rule-${n}`)) n += 1;
  return `rule-${n}`;
}

export function blankAction(type: RuleActionType): RuleAction {
  switch (type) {
    case 'alert':
      return { type, text: '', durationMs: 5000 };
    case 'sound':
      return { type, sound: 'airhorn' };
    case 'webhook':
      return { type, url: '', text: '' };
    default:
      return { type, text: '' };
  }
}

export const RULE_PRESETS = ['blank', 'readChat', 'bigTip', 'thankFollowers', 'command'] as const;
export type RulePreset = (typeof RULE_PRESETS)[number];

/**
 * A ready-made rule. The texts are the creator's own words once saved, so they
 * come in the creator's language from the caller.
 */
export function presetRule(
  preset: RulePreset,
  existing: LiveRule[],
  text: { name: string; say?: string; alert?: string; chat?: string },
): LiveRule {
  const base: LiveRule = {
    id: freshRuleId(existing),
    enabled: true,
    name: text.name,
    trigger: { type: 'tip', minAmount: 0 },
    audience: 'everyone',
    cooldownSec: 0,
    userCooldownSec: 0,
    blockedWords: [],
    actions: [],
  };
  switch (preset) {
    case 'readChat':
      // Off by default for anyone the creator does not know: followers only,
      // one line per viewer every 30 seconds.
      return {
        ...base,
        trigger: { type: 'chat' },
        audience: 'followers',
        userCooldownSec: 30,
        actions: [{ type: 'say', text: text.say ?? '{name}: {message}' }],
      };
    case 'bigTip':
      return {
        ...base,
        trigger: { type: 'tip', minAmount: 100_000 },
        actions: [
          { type: 'sound', sound: 'airhorn' },
          { type: 'alert', text: text.alert ?? '{name}: {amount} DHB', durationMs: 6000 },
        ],
      };
    case 'thankFollowers':
      return { ...base, trigger: { type: 'follow' }, cooldownSec: 10, actions: [{ type: 'chat', text: text.chat ?? '{name}' }] };
    case 'command':
      return {
        ...base,
        trigger: { type: 'command', command: '!hello' },
        cooldownSec: 15,
        actions: [{ type: 'chat', text: text.chat ?? '{name}' }],
      };
    default:
      return { ...base, actions: [blankAction('alert')] };
  }
}

/** What the server played or showed for a fired rule, already filled in. */
export interface RuleFired {
  ruleId: string;
  user: { address?: string; username?: string; displayName?: string; avatarImageUrl?: string };
  alerts: Array<{ text: string; durationMs: number }>;
  sounds: string[];
  say: string[];
  test?: boolean;
}

export function parseRuleFired(data: any): RuleFired | null {
  if (!data || typeof data.ruleId !== 'string') return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()) : []);
  const alerts = Array.isArray(data.alerts)
    ? data.alerts
        .filter((a: any) => typeof a?.text === 'string' && a.text.trim())
        .map((a: any) => ({ text: a.text, durationMs: Math.min(20000, Math.max(2000, Number(a.durationMs) || 5000)) }))
    : [];
  return {
    ruleId: data.ruleId,
    user: data.user && typeof data.user === 'object' ? data.user : {},
    alerts,
    sounds: strings(data.sounds).filter((id) => id in RULE_SOUND_FILES),
    say: strings(data.say),
    test: !!data.test,
  };
}
