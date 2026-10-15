export const DEVOTION_STATUSES = ['draft', 'scheduled', 'published'] as const;
export type DevotionStatus = (typeof DEVOTION_STATUSES)[number];

export const REACTION_KINDS = ['amen', 'pray', 'love', 'fire'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];
