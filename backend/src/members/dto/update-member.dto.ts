import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const GENDERS = ['male', 'female', 'other'] as const;

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  memberNo?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

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
  @IsBoolean()
  baptized?: boolean;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];
}
