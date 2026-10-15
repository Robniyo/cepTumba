import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ANNOUNCEMENT_CATEGORIES } from '../announcement-category';
import { ANNOUNCEMENT_STATUSES } from '../announcement-status';
import { APP_ROLES } from '../../auth/auth-role.type';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsString()
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category?: (typeof ANNOUNCEMENT_CATEGORIES)[number];

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(ANNOUNCEMENT_STATUSES)
  status?: (typeof ANNOUNCEMENT_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'leaders_only', 'role_based'])
  audienceType?: 'all' | 'leaders_only' | 'role_based';

  @IsOptional()
  @IsArray()
  @IsIn(APP_ROLES, { each: true })
  audienceRoles?: string[];
}
