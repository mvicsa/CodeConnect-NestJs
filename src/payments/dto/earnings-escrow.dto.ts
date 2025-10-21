import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsDate, IsEnum, IsPositive, Min } from 'class-validator';

export enum EscrowStatus {
  PENDING = 'pending',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
  WITHDRAWN = 'withdrawn'
}

export class EarningsEscrowDto {
  @ApiProperty({ description: 'Unique identifier of the escrow record' })
  @IsString()
  _id: string;

  @ApiProperty({ description: 'Room name associated with the escrow' })
  @IsString()
  roomName: string;

  @ApiProperty({ description: 'Amount of earnings in escrow' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Currency of the earnings', default: 'USD' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Status of the escrow', enum: EscrowStatus })
  @IsEnum(EscrowStatus)
  status: EscrowStatus;

  @ApiProperty({ description: 'Date when the escrow was created' })
  @IsDate()
  date: Date;

  @ApiProperty({ description: 'Date when the escrow will be released' })
  @IsDate()
  releaseDate: Date;

  @ApiProperty({ description: 'Date when the escrow was actually released', required: false })
  @IsDate()
  releasedAt?: Date;

  @ApiProperty({ description: 'Reason for dispute or refund', required: false })
  @IsString()
  reason?: string;
}

export class EarningsEscrowSummaryDto {
  @ApiProperty({ description: 'Total amount in pending escrow' })
  @IsNumber()
  totalPendingAmount: number;

  @ApiProperty({ description: 'Total amount released' })
  @IsNumber()
  totalReleasedAmount: number;

  @ApiProperty({ description: 'Total amount refunded' })
  @IsNumber()
  totalRefundedAmount: number;

  @ApiProperty({ type: [EarningsEscrowDto], description: 'List of escrow records' })
  escrows: EarningsEscrowDto[];
}

export class WithdrawalRequestDto {
  @ApiProperty({ 
    description: 'Amount to withdraw in USD', 
    example: 100.50,
    minimum: 0.01
  })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;
}
