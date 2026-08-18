/**
 * Chat link detection
 * ===================
 * Finds the URLs inside a message so the bubble can render them as something
 * you can tap. Mobile had no such pass at all: a link arrived as dead text and
 * the only way to follow it was to select and copy it by hand.
 *
 * The web app runs the same matcher (`URL_WITH_BOUNDARY_REGEX` in
 * `src/components/app/TranslatableText.tsx`) — keep the two in step, because a
 * link written on one client is read on the other, and a message that is
 * tappable on the web and dead on the phone reads as a broken app rather than
 * as two implementations.
 *
 * DeHub's own links are not this module's problem: `dehub-links.ts` matches
 * those first and the bubble renders them as a card.
 */

const CC_TLDS = 'ac|ad|ae|af|ag|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bw|by|bz|ca|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|fi|fj|fk|fm|fo|fr|ga|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sk|sl|sm|sn|so|sr|ss|st|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|za|zm|zw';
const GENERIC_TLDS = 'com|org|net|info|biz|xyz|app|dev|ai|io|cc|gg|me|tv|ly|fm|sh|digital|store|online|site|tech|world|club|live|space|art|design|social|link|page|one|pro|media|studio|agency|blog|shop|network|land|zone|fund|games|gaming|vc|nft|crypto|dao|eth|web3|defi|music|video|news|chat|cloud|data|host|email|money|bank|pay|finance|trade|market|exchange|casino|bet|poker|win|lol|wtf|meme|cool|guru|ninja|expert|solutions|services|systems|technology|software|computer|science|education|academy|school|university|institute|training|health|medical|dental|fitness|yoga|beauty|fashion|style|clothing|shoes|jewelry|luxury|estate|property|house|apartments|construction|auto|car|bike|travel|flights|holiday|tours|hotel|restaurant|food|pizza|coffee|bar|pub|wine|beer|recipes|photography|photo|camera|gallery|graphics|ink|tattoo|wedding|events|party|flowers|gifts|toys|baby|kids|family|pets|dog|cat|vet|garden|green|eco|solar|energy|organic|farm|legal|law|attorney|consulting|accountant|tax|insurance|loans|credit|investments|capital|ventures|partners|associates|group|team|community|foundation|charity|church|bible|faith|domains|website|web|blog|forum|wiki|directory|guide|tips|how|reviews|best|top|cheap|discount|sale|deals|coupons|free|plus|vip|gold|black|blue|red|pink|green|orange|theater|movie|film|show|radio|audio|stream|tube|band|rocks|dance|dj|actor|place|city|town|country|earth|world|global|international|company|business|corp|inc|ltd|enterprises|holdings|industries|works|careers|jobs|hire|run|fit|life|love|date|singles|camp|center|care|support|help|repair|direct|express|delivery|supply|tools|parts|equipment|kitchen|house|furniture|lighting|glass|flooring|tiles|build|builders|contractors|plumbing|heating|cleaning|security|cctv|codes|dev|engineer|hacker|geek|tech|digital|cyber|net|systems|app|cloud|host|storage|server|mobile|phone|computer|monitor|watch|today|now|news|report|press|media|social|pics|photos|video|click|download|online|email|chat|games|play|game|poker|bet|casino|win|lol|fail|wtf|meme|cool|fun|sexy|xxx|adult|porn|sucks|gripe|icu|rest|cafe|pub|bar|bio|ceo|voting|democrat|republican|forex|trading|rip|memorial|giving|christmas|theater';
const COMMON_TLDS = `${CC_TLDS}|${GENERIC_TLDS}`;

// A link has to start at a word boundary, otherwise the tail of a longer token
// ("...see attachment.zip") matches on its own.
const URL_BOUNDARY_SRC = `(?:^|\s|[\(\[<"'])`;

// TLD-restricted, so a filename ("clip.mp4", "photo.png") is not mistaken for a
// host. Dots are allowed inside the hostname so subdomains survive.
const TLD_URL_CORE_SRC = `(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%_+~#=]+(?:\.[-a-zA-Z0-9@:%_+~#=]+)*\.(?:${COMMON_TLDS})(?:\.[a-zA-Z]{2,3})?\b(?:[-a-zA-Z0-9()@:%_+.~#?&\/=]*)`;

// A `www.` prefix means a link whatever the TLD is.
const WWW_URL_CORE_SRC = `(?:https?:\/\/)?www\.[-a-zA-Z0-9@:%_+~#=]+(?:\.[-a-zA-Z0-9@:%_+~#=]+)*\.[a-zA-Z]{2,63}\b(?:[-a-zA-Z0-9()@:%_+.~#?&\/=]*)`;

const URL_CORE_SRC = `(?:${WWW_URL_CORE_SRC})|(?:${TLD_URL_CORE_SRC})`;
const URL_WITH_BOUNDARY_SRC = `(?:${URL_BOUNDARY_SRC})(?:${URL_CORE_SRC})`;

const LEADING_BOUNDARY_REGEX = /^[\s(\[<"']+/;

export type ChatTextToken =
  /** Plain text, rendered as-is. */
  | { type: 'text'; value: string }
  /** A link: `value` is what the sender typed, `url` is what to open. */
  | { type: 'link'; value: string; url: string };

/**
 * Split a message into plain-text and link runs.
 *
 * Returns a single text token when there is nothing to link, so a caller can
 * render the result unconditionally without a "does this need linkifying" test.
 */
export function tokenizeChatText(text?: string | null): ChatTextToken[] {
  const source = text ?? '';
  if (!source) return [];

  const tokens: ChatTextToken[] = [];
  const regex = new RegExp(URL_WITH_BOUNDARY_SRC, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: source.slice(lastIndex, match.index) });
    }

    // The match swallowed the character in front of the link — give it back, or
    // the space before a link disappears and words run together.
    const leading = match[0].match(LEADING_BOUNDARY_REGEX)?.[0] ?? '';
    const value = match[0].slice(leading.length);
    if (leading) {
      tokens.push({ type: 'text', value: leading });
    }

    tokens.push({
      type: 'link',
      value,
      url: /^https?:\/\//i.test(value) ? value : `https://${value}`,
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < source.length) {
    tokens.push({ type: 'text', value: source.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: source }];
}
