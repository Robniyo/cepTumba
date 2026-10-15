import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FUND_IDS, TX_STATUSES, TX_TYPES } from '../finance.types';

export class ListTransactionsDto {
  @IsOptional()
  @IsIn(FUND_IDS)
  fundId?: (typeof FUND_IDS)[number];

  @IsOptional()
  @IsIn(TX_TYPES)
  type?: (typeof TX_TYPES)[number];

  @IsOptional()
  @IsIn(TX_STATUSES)
  status?: (typeof TX_STATUSES)[number];

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
