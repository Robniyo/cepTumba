import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FOLLOW_UP_STATUSES } from '../prayer.types';

export class UpdatePrayerStatusDto {
  @IsIn(FOLLOW_UP_STATUSES)
  status!: (typeof FOLLOW_UP_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(180)
  assignedTo?: string;
}
