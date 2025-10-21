import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsDate, IsArray } from 'class-validator';

export class DashboardStatsDto {
  @ApiProperty({ description: 'Total earnings from all sessions' })
  @IsNumber()
  totalEarnings: number;

  @ApiProperty({ description: 'Total amount spent on sessions' })
  @IsNumber()
  totalSpent: number;

  @ApiProperty({ description: 'Available balance for withdrawal' })
  @IsNumber()
  availableBalance: number;

  @ApiProperty({ description: 'Pending earnings in escrow' })
  @IsNumber()
  pendingEarnings: number;

  @ApiProperty({ description: 'Total number of sessions created' })
  @IsNumber()
  totalSessionsCreated: number;

  @ApiProperty({ description: 'Total number of sessions purchased' })
  @IsNumber()
  totalSessionsPurchased: number;

  @ApiProperty({ description: 'Total number of participants in created sessions' })
  @IsNumber()
  totalParticipants: number;
}

export class RecentActivityDto {
  @ApiProperty({ description: 'Activity type', enum: ['earning', 'purchase', 'withdrawal', 'refund'] })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Activity description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Amount involved in the activity' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Currency of the amount' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Date of the activity' })
  @IsDate()
  date: Date;

  @ApiProperty({ description: 'Room ID if applicable' })
  @IsString()
  roomId?: string;

  @ApiProperty({ description: 'Activity title' })
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Status of the activity' })
  @IsString()
  status: string;
}

export class DashboardResponseDto {
  @ApiProperty({ description: 'Dashboard statistics', type: DashboardStatsDto })
  stats: DashboardStatsDto;

  @ApiProperty({ type: [RecentActivityDto], description: 'Recent activities' })
  @IsArray()
  recentActivities: RecentActivityDto[];

  @ApiProperty({ description: 'Monthly earnings chart data' })
  @IsArray()
  monthlyEarnings: Array<{
    month: string;
    earnings: number;
    purchases: number;
  }>;
}

export class QuickStatsDto {
  @ApiProperty({ description: 'This month earnings' })
  @IsNumber()
  thisMonthEarnings: number;

  @ApiProperty({ description: 'This month spending' })
  @IsNumber()
  thisMonthSpending: number;

  @ApiProperty({ description: 'Available for withdrawal' })
  @IsNumber()
  availableForWithdrawal: number;

  @ApiProperty({ description: 'Pending in escrow' })
  @IsNumber()
  pendingInEscrow: number;

  @ApiProperty({ description: 'Total paid sessions created' })
  @IsNumber()
  totalPaidSessions: number;

  @ApiProperty({ description: 'Total sessions purchased' })
  @IsNumber()
  totalSessionsPurchased: number;

  @ApiProperty({ description: 'Total participants in created sessions' })
  @IsNumber()
  totalParticipants: number;

  @ApiProperty({ description: 'Currency used' })
  @IsString()
  currency: string;
}

