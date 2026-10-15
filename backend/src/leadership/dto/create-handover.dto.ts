import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateHandoverDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fromLeader!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  toLeader!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  summary!: string;
}
