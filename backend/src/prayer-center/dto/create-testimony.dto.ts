import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTestimonyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  author?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  body!: string;
}
