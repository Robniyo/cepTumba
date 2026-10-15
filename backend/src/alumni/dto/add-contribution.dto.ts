import { IsInt, Min } from 'class-validator';

export class AddContributionDto {
  @IsInt()
  @Min(1)
  amount!: number;
}
