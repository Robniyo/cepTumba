import { IsIn } from 'class-validator';
import { TERM_STATUSES } from '../leadership.types';

export class UpdateTermStatusDto {
  @IsIn(TERM_STATUSES)
  status!: (typeof TERM_STATUSES)[number];
}
