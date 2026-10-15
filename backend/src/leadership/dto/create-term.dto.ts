import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TERM_STATUSES } from '../leadership.types';

export class CreateTermDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  roleTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  holderName!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  memberId?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsIn(TERM_STATUSES)
  status?: (typeof TERM_STATUSES)[number];
}
