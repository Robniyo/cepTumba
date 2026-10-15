export const MEETING_TYPES = [
  'executive',
  'general',
  'advisors',
  'committee',
  'agm',
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MINUTE_STATUSES = ['draft', 'circulated', 'approved'] as const;
export type MinuteStatus = (typeof MINUTE_STATUSES)[number];

export const RESOLUTION_STATUSES = ['proposed', 'passed', 'rejected', 'tabled'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const DOC_CATEGORIES = [
  'constitution',
  'handover',
  'policy',
  'report',
  'sermon',
  'form',
  'other',
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
