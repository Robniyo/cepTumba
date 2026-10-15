import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export const ASSIGNMENT_MODES = ['unassigned_only', 'reassign_all'] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export class RunAssignmentDto {
  /**
   * - `unassigned_only`: only place members who do not yet belong to a family.
   * - `reassign_all`: clear existing memberships first and place every active member.
   */
  @IsIn(ASSIGNMENT_MODES)
  mode!: AssignmentMode;

  /**
   * If true, the caller is just previewing the result — nothing is persisted.
   * Defaults to false (run + persist).
   */
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}
