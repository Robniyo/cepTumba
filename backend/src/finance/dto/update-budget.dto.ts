import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { FUND_IDS } from '../finance.types';

export class UpdateBudgetDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  period?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsIn(FUND_IDS)
  fundId?: (typeof FUND_IDS)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgeted?: number;
}
