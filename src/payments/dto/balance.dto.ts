import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsDate } from 'class-validator';

export class EarningDetailDto {
  @ApiProperty({ description: 'Activity title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Amount earned' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Date of earning' })
  @IsDate()
  date: Date;
}

export class BalanceSummaryDto {
  @ApiProperty({ description: 'Total available balance' })
  @IsNumber()
  availableBalance: number;

  @ApiProperty({ description: 'Total pending earnings' })
  @IsNumber()
  pendingEarnings: number;

  @ApiProperty({ description: 'Total released earnings' })
  @IsNumber()
  releasedEarnings: number;

  @ApiProperty({ description: 'Total refunded amount' })
  @IsNumber()
  refundedAmount: number;

  @ApiProperty({ type: [EarningDetailDto], description: 'Recent earnings' })
  recentEarnings: EarningDetailDto[];
}
