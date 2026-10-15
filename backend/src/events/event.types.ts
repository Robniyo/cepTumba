export const EVENT_TYPES = [
  'prayer',
  'study',
  'service',
  'social',
  'outreach',
  'meeting',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_METHODS = ['manual', 'qr', 'self'] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];
