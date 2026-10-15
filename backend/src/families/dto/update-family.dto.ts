import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const FAMILY_STATUSES = ['active', 'inactive'] as const;

export class UpdateFamilyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  familyName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  @Matches(/^[A-Z0-9-]+$/)
  familyCode?: string;

  @IsOptional()
  @IsIn(FAMILY_STATUSES)
  status?: (typeof FAMILY_STATUSES)[number];
}
