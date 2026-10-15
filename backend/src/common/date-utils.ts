/**
 * Date-only helpers.
 *
 * PostgreSQL DATE columns are timezone-less. node-postgres returns them as a
 * JS Date at LOCAL midnight in the server's timezone. Calling
 * `.toISOString().slice(0, 10)` on that Date is a classic bug: it shifts the
 * calendar date by the server's UTC offset (e.g. 2026-04-29 may become
 * 2026-04-28 when the server is east of UTC).
 *
 * Use {@link toDateOnlyString} to safely format any DATE value (string or Date)
 * back to a YYYY-MM-DD string without timezone shifting.
 */
export const toDateOnlyString = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    // Already a 'YYYY-MM-DD' or ISO timestamp; take the date portion as-is.
    return value.slice(0, 10);
  }
  // Date instance: extract local Y-M-D so the calendar date is preserved.
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Parse a date-only value into a Date at local midnight to avoid TZ shifts.
 * - "YYYY-MM-DD" -> Date at local midnight
 * - "YYYY-MM-DDT00:00:00Z" -> Date at local midnight
 * - Other strings -> Date as parsed
 */
export const parseDateOnly = (value: string | Date): Date => {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const tsMatch = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(value);
  if (tsMatch) {
    const [y, m, d] = tsMatch[1].split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
};

/** Today's date as 'YYYY-MM-DD' in the server's local timezone. */
export const todayDateOnlyString = (): string => {
  const now = new Date();
  return toDateOnlyString(now) as string;
};
