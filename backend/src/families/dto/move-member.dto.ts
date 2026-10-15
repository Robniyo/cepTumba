import { IsUUID } from 'class-validator';

export class MoveMemberDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  targetFamilyId!: string;
}
