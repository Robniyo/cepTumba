import { IsString, MaxLength } from 'class-validator';

export class SetNotesDto {
  @IsString()
  @MaxLength(16000)
  notes!: string;
}
