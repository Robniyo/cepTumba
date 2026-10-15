import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ANNOUNCEMENT_CATEGORIES } from '../announcement-category';

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category?: (typeof ANNOUNCEMENT_CATEGORIES)[number];
}
