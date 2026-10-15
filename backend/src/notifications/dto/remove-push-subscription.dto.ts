import { IsUrl } from 'class-validator';

export class RemovePushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;
}
