import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { APP_ROLES } from '../auth-role.type';

export class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsIn(APP_ROLES)
  role!: (typeof APP_ROLES)[number];
}
