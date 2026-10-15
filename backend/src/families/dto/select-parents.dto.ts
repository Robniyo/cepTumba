import { IsOptional, IsUUID } from 'class-validator';

/**
 * Either or both fields can be supplied. To clear a parent, send `null`.
 */
export class SelectParentsDto {
  @IsOptional()
  @IsUUID()
  daddyMemberId?: string | null;

  @IsOptional()
  @IsUUID()
  mummyMemberId?: string | null;
}
