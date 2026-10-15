/**
 * Date-only helpers.
 *
 * Avoid `new Date(isoString).toISOString().slice(0, 10)` for date-only values;
 * it shifts the calendar date by the local UTC offset.
 *
 * Use {@link formatLocalISODate} to format a JS Date as YYYY-MM-DD using its
 * LOCAL components. Use {@link parseDateOnly} to safely turn a YYYY-MM-DD
 * string into a Date at LOCAL midnight (so display formatters don't shift it).
 */
export const formatLocalISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Format a Date for datetime-local inputs (YYYY-MM-DDTHH:mm) using local time. */
export const formatLocalDateTimeInput = (d: Date): string => {
  const date = formatLocalISODate(d);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${date}T${hours}:${minutes}`;
};

/** Today's date as 'YYYY-MM-DD' in the user's local timezone. */
export const todayLocalISODate = (): string => formatLocalISODate(new Date());

/**
 * Parses a value that represents a calendar date (no real time meaning).
 * - "YYYY-MM-DD" -> Date at local midnight (no TZ shift on render)
 * - ISO timestamp string -> Date as parsed (kept for backwards compatibility)
 * - Date -> returned as-is
 */
export const parseDateOnly = (value: string | Date): Date => {
  if (value instanceof Date) return value;
  // Pure date 'YYYY-MM-DD' -> construct in local TZ
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  // ISO timestamp with time portion -> use as-is. If the time part is exactly
  // 'T00:00:00.000Z' (a likely DATE column round-trip), still treat as date.
  const tsMatch = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(value);
  if (tsMatch) {
    const [y, m, d] = tsMatch[1].split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
};

/** Formats a date-only value for display using the user's locale. */
export const formatDateOnlyForDisplay = (
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" },
): string => {
  if (value === null || value === undefined || value === "") return "";
  try {
    return parseDateOnly(value).toLocaleDateString(undefined, options);
  } catch {
    return typeof value === "string" ? value : "";
  }
};
