import { IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { FUND_IDS } from '../finance.types';

export class CreateBudgetDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  period!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsIn(FUND_IDS)
  fundId!: (typeof FUND_IDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  category!: string;

  @IsInt()
  @Min(0)
  budgeted!: number;
}
