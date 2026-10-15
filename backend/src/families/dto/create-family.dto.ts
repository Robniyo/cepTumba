import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const FAMILY_STATUSES = ['active', 'inactive'] as const;

export class CreateFamilyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  familyName!: string;

  /**
   * Short uppercase code like "FAM-A" or "RUTH". 2-16 chars, letters/numbers/dashes.
   * Optional — when omitted the server derives one from `familyName` and ensures uniqueness.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  @Matches(/^[A-Z0-9-]+$/, {
    message: 'familyCode must be uppercase letters, digits, or dashes only',
  })
  familyCode?: string;

  @IsOptional()
  @IsIn(FAMILY_STATUSES)
  status?: (typeof FAMILY_STATUSES)[number];
}
