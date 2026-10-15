import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class AddMaterialDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(100)
  type!: string;

  @IsInt()
  @Min(0)
  size!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;
}
