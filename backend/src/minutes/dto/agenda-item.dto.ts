import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AgendaItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(4000)
  notes!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  presenter?: string;
}
