import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REQUEST_TYPES } from '../request.types';

export class CreateRequestDto {
  @IsIn(REQUEST_TYPES)
  type!: (typeof REQUEST_TYPES)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  requesterName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  requesterRole?: string;
}
