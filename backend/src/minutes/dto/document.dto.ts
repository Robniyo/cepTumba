import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DOC_CATEGORIES } from '../minutes.types';

class VersionInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  version!: string;

  @IsString()
  @MaxLength(1000)
  changeNote!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(0)
  fileSize!: number;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  uploadedBy?: string;
}

export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsIn(DOC_CATEGORIES)
  category!: (typeof DOC_CATEGORIES)[number];

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  ownerRole!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags!: string[];

  @ValidateNested()
  @Type(() => VersionInputDto)
  initialVersion!: VersionInputDto;
}

export class AddDocumentVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  version!: string;

  @IsString()
  @MaxLength(1000)
  changeNote!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(0)
  fileSize!: number;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;
}
