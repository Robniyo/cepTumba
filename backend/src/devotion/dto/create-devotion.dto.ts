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

export class CreateDevotionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reference!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  verse!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  reflection!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  prayerPoints!: string[];

  @IsDateString()
  scheduledFor!: string;

  @IsOptional()
  @IsIn(DEVOTION_STATUSES)
  status?: (typeof DEVOTION_STATUSES)[number];
}
