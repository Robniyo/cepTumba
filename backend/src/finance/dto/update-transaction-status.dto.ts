import { IsIn } from 'class-validator';
import { TX_STATUSES } from '../finance.types';

export class UpdateTransactionStatusDto {
  @IsIn(TX_STATUSES)
  status!: (typeof TX_STATUSES)[number];
}
