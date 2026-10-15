import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ANNOUNCEMENT_CATEGORIES } from '../announcement-category';
import { ANNOUNCEMENT_STATUSES } from '../announcement-status';

export class ListAnnouncementsDto {
  @IsOptional()
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category?: (typeof ANNOUNCEMENT_CATEGORIES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_STATUSES)
  status?: (typeof ANNOUNCEMENT_STATUSES)[number];

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeUnpublished?: boolean;
}
