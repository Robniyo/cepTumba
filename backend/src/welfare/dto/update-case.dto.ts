import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CASE_STATUSES, CASE_TYPES, URGENCIES } from '../welfare.types';

export class UpdateCaseDto {
  @IsOptional()
  @IsIn(CASE_TYPES)
  type?: (typeof CASE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(URGENCIES)
  urgency?: (typeof URGENCIES)[number];

  @IsOptional()
  @IsIn(CASE_STATUSES)
  status?: (typeof CASE_STATUSES)[number];
}
