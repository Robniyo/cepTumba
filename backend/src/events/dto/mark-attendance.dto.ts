import { IsDateString, IsIn, IsString } from 'class-validator';
import { ATTENDANCE_METHODS, ATTENDANCE_STATUSES } from '../event.types';

export class MarkAttendanceDto {
  @IsDateString()
  date!: string;

  @IsString()
  memberId!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: (typeof ATTENDANCE_STATUSES)[number];

  @IsIn(ATTENDANCE_METHODS)
  method!: (typeof ATTENDANCE_METHODS)[number];
}
