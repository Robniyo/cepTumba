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
import { VISIT_STATUSES } from '../welfare.types';

export class UpdateVisitDto {
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  purpose?: string;

  @IsOptional()
  @IsIn(VISIT_STATUSES)
  status?: (typeof VISIT_STATUSES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  report?: string;
}
