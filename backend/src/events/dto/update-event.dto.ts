import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EVENT_TYPES } from '../event.types';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: (typeof EVENT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  location?: string;

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
  @MaxLength(180)
  speaker?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;
}
