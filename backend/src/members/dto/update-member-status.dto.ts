import { IsIn } from 'class-validator';

const MEMBER_STATUSES = ['active', 'inactive', 'graduated', 'suspended'] as const;

export class UpdateMemberStatusDto {
  @IsIn(MEMBER_STATUSES)
  status!: (typeof MEMBER_STATUSES)[number];
}
