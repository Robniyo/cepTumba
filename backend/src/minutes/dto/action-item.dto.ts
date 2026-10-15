import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateActionItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  task!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  ownerId!: string;

  @IsDateString()
  due!: string;
}
