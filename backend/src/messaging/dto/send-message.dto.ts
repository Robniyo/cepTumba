import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttachmentDto {
  @IsString()
  url!: string;

  @IsString()
  type!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsInt()
  @Min(1)
  size!: number;
}

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDto)
  attachment?: AttachmentDto;

  @IsOptional()
  @IsString()
  type?: 'text';
}
