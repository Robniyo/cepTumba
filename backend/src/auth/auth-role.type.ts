export const APP_ROLES = [
  'president',
  'vp_prayers',
  'vp_social',
  'advisor_prayers',
  'advisor_social',
  'accountant',
  'secretary',
  'member',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ADMIN_ROLES: AppRole[] = ['president'];