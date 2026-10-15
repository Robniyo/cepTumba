export const REQUEST_TYPES = [
  'prayer_support',
  'financial_aid',
  'welfare_help',
  'budget_request',
  'event_approval',
  'reimbursement',
  'leader_apology',
  'savings_withdrawal',
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ['pending', 'in_review', 'approved', 'rejected'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
