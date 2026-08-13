/**
 * Date helpers.
 *
 * Issues store dates as `DD/MM/YYYY` in frontmatter (v0.3+) but older issues
 * and hand-edited notes may use ISO `YYYY-MM-DD`. Everything here accepts both
 * and normalises to ISO internally, which sorts and compares lexicographically.
 *
 * This module deliberately has no imports so it can be unit-tested standalone.
 */

const ISO_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DISPLAY_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export type DueState = 'none' | 'invalid' | 'overdue' | 'today' | 'future';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Rejects impossible dates such as 31/02/2026, which `new Date` would roll over. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Returns `YYYY-MM-DD`, or `''` when the input is empty or not a real date. */
export function toIsoDate(value: string): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';

  const iso = ISO_PATTERN.exec(trimmed);
  if (iso) {
    const [, year, month, day] = iso;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    return isRealDate(y, m, d) ? `${year}-${pad(m)}-${pad(d)}` : '';
  }

  const display = DISPLAY_PATTERN.exec(trimmed);
  if (display) {
    const [, day, month, year] = display;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    return isRealDate(y, m, d) ? `${year}-${pad(m)}-${pad(d)}` : '';
  }

  return '';
}

/** Returns `DD/MM/YYYY`, or `''` when the input is empty or not a real date. */
export function toDisplayDate(value: string): string {
  const iso = toIsoDate(value);
  if (iso.length === 0) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function isValidDate(value: string): boolean {
  return toIsoDate(value).length > 0;
}

/** Today in the user's local timezone, as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dueState(value: string, today: string = todayIso()): DueState {
  if (typeof value !== 'string' || value.trim().length === 0) return 'none';
  const iso = toIsoDate(value);
  if (iso.length === 0) return 'invalid';
  if (iso === today) return 'today';
  return iso < today ? 'overdue' : 'future';
}

export type DueVariant = DueState | 'done';

/**
 * The variant used to style a due date in the UI.
 *
 * Urgency is suppressed for closed issues: once the work is done its deadline
 * is history, so it renders muted rather than as an amber/red alarm. A
 * malformed value is still reported, closed or not, since it needs fixing.
 */
export function dueVariant(
  value: string,
  closed: boolean,
  today: string = todayIso(),
): DueVariant {
  const state = dueState(value, today);
  if (state === 'none' || state === 'invalid') return state;
  return closed ? 'done' : state;
}

/**
 * Compares two due dates. Issues with no deadline (or an unparseable one)
 * always sort last, whichever direction the caller is sorting in — so the
 * caller must not multiply this result by its sort direction.
 */
export function compareDueDates(a: string, b: string): number {
  const isoA = toIsoDate(a);
  const isoB = toIsoDate(b);
  if (isoA === isoB) return 0;
  if (isoA.length === 0) return 1;
  if (isoB.length === 0) return -1;
  return isoA < isoB ? -1 : 1;
}

/** Compares `created` values, which are always stored as ISO. */
export function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  return a < b ? -1 : 1;
}
