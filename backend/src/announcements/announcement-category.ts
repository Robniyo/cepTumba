export const ANNOUNCEMENT_CATEGORIES = [
  'urgent',
  'spiritual',
  'finance',
  'social',
  'academic',
  'general',
] as const;

export type AnnouncementCategory =
  (typeof ANNOUNCEMENT_CATEGORIES)[number];
