import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePrayerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  requester?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
