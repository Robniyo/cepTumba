import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class InitiateSavingsMobileMoneyDto {
  @IsInt()
  @Min(100)
  amount!: number;

  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
