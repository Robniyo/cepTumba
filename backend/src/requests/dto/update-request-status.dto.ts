import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REQUEST_STATUSES } from '../request.types';

export class UpdateRequestStatusDto {
  @IsIn(REQUEST_STATUSES)
  status!: (typeof REQUEST_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;
}
