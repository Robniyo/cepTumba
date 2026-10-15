import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  FUND_IDS,
  PAYMENT_METHODS,
  TX_DIRECTIONS,
  TX_STATUSES,
  TX_TYPES,
} from '../finance.types';

export class CreateTransactionDto {
  @IsDateString()
  date!: string;

  @IsIn(TX_TYPES)
  type!: (typeof TX_TYPES)[number];

  @IsIn(FUND_IDS)
  fundId!: (typeof FUND_IDS)[number];

  @IsInt()
  @Min(1)
  amount!: number;

  @IsIn(TX_DIRECTIONS)
  direction!: (typeof TX_DIRECTIONS)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsIn(TX_STATUSES)
  status?: (typeof TX_STATUSES)[number];
}
