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
  MinDate,
} from 'class-validator';
import { EVENT_TYPES } from '../event.types';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsIn(EVENT_TYPES)
  type!: (typeof EVENT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  location!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime must be HH:mm' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  speaker?: string;

  @IsBoolean()
  recurring!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  notes?: string;
}
