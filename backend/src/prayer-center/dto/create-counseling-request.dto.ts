import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCounselingRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  requester?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  summary!: string;

  @IsOptional()
  @IsDateString()
  preferredDate?: string;
}
