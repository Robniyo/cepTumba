export const TERM_STATUSES = ['upcoming', 'active', 'completed'] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];
