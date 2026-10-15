import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  subject?: string;

  @IsString()
  @Length(1, 2000)
  message!: string;
}
