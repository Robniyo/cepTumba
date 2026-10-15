export const FUND_IDS = [
  'welfare',
  'evangelism',
  'social',
  'project',
  'tithe',
  'savings',
] as const;
export type FundId = (typeof FUND_IDS)[number];

export const TX_TYPES = [
  'offering',
  'tithe',
  'contribution',
  'savings_deposit',
  'savings_withdraw',
  'expense',
  'other_income',
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_STATUSES = ['approved', 'pending', 'rejected'] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export const TX_DIRECTIONS = ['in', 'out'] as const;
export type TxDirection = (typeof TX_DIRECTIONS)[number];

export const PAYMENT_METHODS = [
  'cash',
  'mpesa',
  'momo',
  'airtel_money',
  'bank',
  'card',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MOBILE_MONEY_PROVIDERS = ['momo', 'airtel_money'] as const;
export type MobileMoneyProvider = (typeof MOBILE_MONEY_PROVIDERS)[number];

export const MOBILE_MONEY_PAYMENT_STATUSES = [
  'pending',
  'success',
  'failed',
  'expired',
  'cancelled',
] as const;
export type MobileMoneyPaymentStatus =
  (typeof MOBILE_MONEY_PAYMENT_STATUSES)[number];
