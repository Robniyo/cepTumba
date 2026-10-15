import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { RESOLUTION_STATUSES } from '../minutes.types';

export class CreateResolutionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  movedBy!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  secondedBy!: string;

  @IsIn(RESOLUTION_STATUSES)
  status!: (typeof RESOLUTION_STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  votesFor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  votesAgainst?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  votesAbstain?: number;
}

export class UpdateResolutionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  movedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  secondedBy?: string;

  @IsOptional()
  @IsIn(RESOLUTION_STATUSES)
  status?: (typeof RESOLUTION_STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  votesFor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  votesAgainst?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  votesAbstain?: number;
}
