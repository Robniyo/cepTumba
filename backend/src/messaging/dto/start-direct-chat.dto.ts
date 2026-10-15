import { IsUUID } from 'class-validator';

export class StartDirectChatDto {
  @IsUUID()
  userId!: string;
}
