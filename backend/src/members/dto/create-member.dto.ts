import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const MEMBER_STATUSES = ['active', 'inactive', 'graduated', 'suspended'] as const;
const GENDERS = ['male', 'female', 'other'] as const;

export class CreateMemberDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  memberNo?: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  yearOfStudy?: string;

  @IsOptional()
  @IsString()
  fellowship?: string;

  @IsOptional()
  @IsIn(MEMBER_STATUSES)
  status?: (typeof MEMBER_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  joinedAt?: string;

  @IsOptional()
  @IsBoolean()
  baptized?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  avatarHue?: number;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];
}
