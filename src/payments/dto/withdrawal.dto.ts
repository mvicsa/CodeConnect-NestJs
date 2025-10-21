import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsDate, IsEnum, IsOptional, IsPositive } from 'class-validator';
import { WithdrawalStatus } from '../schemas/withdrawal.schema';

export class WithdrawalDto {
  @ApiProperty({ description: 'Unique identifier of the withdrawal record' })
  @IsString()
  _id: string;

  @ApiProperty({ description: 'Amount withdrawn' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Currency of the withdrawal', default: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Status of the withdrawal', enum: WithdrawalStatus })
  @IsEnum(WithdrawalStatus)
  status: WithdrawalStatus;

  @ApiProperty({ description: 'Stripe payout ID', required: false })
  @IsOptional()
  @IsString()
  stripePayoutId?: string;

  @ApiProperty({ description: 'Date when the withdrawal was created' })
  @IsDate()
  createdAt: Date;

  @ApiProperty({ description: 'Date when the withdrawal was processed', required: false })
  @IsOptional()
  @IsDate()
  processedAt?: Date;

  @ApiProperty({ description: 'Date when the withdrawal was completed', required: false })
  @IsOptional()
  @IsDate()
  completedAt?: Date;

  @ApiProperty({ description: 'Date when the withdrawal failed', required: false })
  @IsOptional()
  @IsDate()
  failedAt?: Date;

  @ApiProperty({ description: 'Reason for withdrawal failure', required: false })
  @IsOptional()
  @IsString()
  failureReason?: string;

  @ApiProperty({ description: 'Description of the withdrawal', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Last 4 digits of bank account', required: false })
  @IsOptional()
  @IsString()
  bankAccountLast4?: string;

  @ApiProperty({ description: 'Type of bank account', required: false })
  @IsOptional()
  @IsString()
  bankAccountType?: string;

  @ApiProperty({ description: 'Name of the bank', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ description: 'Stripe fees for this withdrawal', required: false })
  @IsOptional()
  @IsNumber()
  stripeFees?: number;

  @ApiProperty({ description: 'Net amount after Stripe fees', required: false })
  @IsOptional()
  @IsNumber()
  netAmount?: number;
}

export class WithdrawalSummaryDto {
  @ApiProperty({ description: 'Total amount withdrawn' })
  @IsNumber()
  totalWithdrawn: number;

  @ApiProperty({ description: 'Total amount pending withdrawal' })
  @IsNumber()
  totalPending: number;

  @ApiProperty({ description: 'Total amount failed withdrawals' })
  @IsNumber()
  totalFailed: number;

  @ApiProperty({ description: 'Total number of withdrawals' })
  @IsNumber()
  totalCount: number;

  @ApiProperty({ description: 'Total Stripe fees paid' })
  @IsNumber()
  totalStripeFees: number;
}

export class WithdrawalRequestDto {
  @ApiProperty({ description: 'Amount to withdraw', example: 100 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Currency of the withdrawal', example: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Description for the withdrawal', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
