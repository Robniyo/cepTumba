import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MEETING_TYPES, MINUTE_STATUSES } from '../minutes.types';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateMinuteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(MEETING_TYPES)
  meetingType?: (typeof MEETING_TYPES)[number];

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  chair?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  secretary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  attendees?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  apologies?: string[];

  @IsOptional()
  @IsIn(MINUTE_STATUSES)
  status?: (typeof MINUTE_STATUSES)[number];
}
