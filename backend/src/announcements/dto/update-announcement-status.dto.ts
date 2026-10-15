import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ANNOUNCEMENT_STATUSES } from '../announcement-status';

export class UpdateAnnouncementStatusDto {
  @IsIn(ANNOUNCEMENT_STATUSES)
  status!: (typeof ANNOUNCEMENT_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}
