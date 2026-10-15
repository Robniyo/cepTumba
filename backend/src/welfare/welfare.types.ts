export const CASE_TYPES = [
  'illness',
  'bereavement',
  'financial',
  'academic',
  'spiritual',
  'celebration',
  'other',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const URGENCIES = ['low', 'medium', 'high', 'critical'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const VISIT_STATUSES = ['planned', 'completed', 'cancelled'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
