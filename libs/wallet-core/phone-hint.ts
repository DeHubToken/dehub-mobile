/**
 * Phone → Web3Auth `login_hint` for the legacy SMS migration.
 * ==========================================================
 * Web3Auth's sms_passwordless connection REQUIRES a login_hint (it does not
 * collect the number itself — omitting it fails with "Invalid params. Missing
 * login_hint for web3auth passwordless login"), and it identifies the user by
 * that hint. Old DeHub accounts store the resulting verifier id as
 * `+34-659265340` — country code, hyphen, subscriber number.
 *
 * That shape is load-bearing. A hint that differs from the one the account was
 * created with is not an error: it authenticates fine and derives a DIFFERENT
 * key, i.e. a different wallet and a brand-new empty account — the exact
 * failure this migration exists to undo. So this normaliser only ever returns
 * a value it is certain about, and returns null (→ "tell the user to separate
 * the country code") rather than guessing.
 */

/**
 * ITU-T E.164 assigned country calling codes, longest-prefix ordered by the
 * lookup below. Only used when the input has no separator to split on.
 * Codes that are prefixes of others (1, 7) are correct as-is: +1 covers the
 * whole NANP, +7 covers Russia and Kazakhstan.
 */
const CALLING_CODES = new Set([
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45',
  '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63',
  '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227',
  '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240',
  '241', '242', '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254',
  '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268',
  '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356',
  '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
  '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502',
  '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595',
  '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679',
  '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
  '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966',
  '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994',
  '995', '996', '998',
]);

/**
 * Turn what a person types into Web3Auth's `+<cc>-<number>` hint.
 * Returns null when the country code cannot be identified with certainty.
 */
export function normalisePhoneHint(raw: string): string | null {
  if (!raw) return null;
  // `00` is the international prefix in most of the world; `+` is what E.164 uses.
  const trimmed = raw.trim().replace(/^00/, '+');
  if (!trimmed.startsWith('+')) return null;

  // Already separated — the user told us where the country code ends, so trust
  // it rather than second-guessing against the table.
  const separated = trimmed.match(/^\+(\d{1,4})[\s.\-/]+([\d\s.\-/]{4,})$/);
  if (separated) {
    const subscriber = separated[2].replace(/\D/g, '');
    if (subscriber.length < 4 || subscriber.length > 14) return null;
    return `+${separated[1]}-${subscriber}`;
  }

  // One unbroken run of digits — split on the longest assigned calling code.
  const joined = trimmed.slice(1).replace(/\D/g, '');
  if (joined.length < 7 || joined.length > 15) return null;
  for (const len of [3, 2, 1]) {
    const code = joined.slice(0, len);
    const subscriber = joined.slice(len);
    if (CALLING_CODES.has(code) && subscriber.length >= 4) {
      return `+${code}-${subscriber}`;
    }
  }
  return null;
}
