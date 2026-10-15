import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CASE_STATUSES, CASE_TYPES, URGENCIES } from '../welfare.types';

export class CreateCaseDto {
  @IsString()
  memberId!: string;

  @IsIn(CASE_TYPES)
  type!: (typeof CASE_TYPES)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description!: string;

  @IsIn(URGENCIES)
  urgency!: (typeof URGENCIES)[number];

  @IsOptional()
  @IsIn(CASE_STATUSES)
  status?: (typeof CASE_STATUSES)[number];
}
