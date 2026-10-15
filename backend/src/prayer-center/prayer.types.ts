export const FOLLOW_UP_STATUSES = ['new', 'assigned', 'in_progress', 'closed'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
