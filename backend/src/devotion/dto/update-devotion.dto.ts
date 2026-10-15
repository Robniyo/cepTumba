import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DEVOTION_STATUSES } from '../devotion.types';

export class UpdateDevotionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  verse?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  reflection?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  prayerPoints?: string[];

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsIn(DEVOTION_STATUSES)
  status?: (typeof DEVOTION_STATUSES)[number];
}
