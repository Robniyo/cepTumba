import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSavingsWithdrawalRequestDto {
  @IsUUID()
  memberId!: string;

  @IsInt()
  @Min(1)
  amount!: number; // Amount in RWF

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string; // Why they need the withdrawal

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalDetails?: string;
}
