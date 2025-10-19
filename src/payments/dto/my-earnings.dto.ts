import { IsOptional, IsNumber, Min, IsDateString, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

export class MyEarningsQueryDto {
  @ApiProperty({ required: false, description: 'Page number for pagination', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Number of items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({ required: false, description: 'Start date for filtering earnings (ISO 8601 string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date for filtering earnings (ISO 8601 string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Currency to filter earnings by' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false, description: 'Search in session titles' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreatorEarningDto {
  @ApiProperty({ description: 'ID of the earning record' })
  _id: string;

  @ApiProperty({ description: 'ID of the room', type: String })
  roomId: string;

  @ApiProperty({ description: 'Title of the session' })
  title: string;

  @ApiProperty({ description: 'Amount paid for the session' })
  amountPaid: number;

  @ApiProperty({ description: 'Currency used for payment' })
  currencyUsed: string;

  @ApiProperty({ description: 'Date of purchase' })
  purchaseDate: Date;

  @ApiProperty({ description: 'Status of the payment', enum: ['pending', 'completed', 'failed', 'refunded'] })
  status: string;
}

export class MyEarningsResponseDto {
  @ApiProperty({ type: [CreatorEarningDto], description: 'List of creator\'s earning records' })
  earnings: CreatorEarningDto[];

  @ApiProperty({ description: 'Total amount earned in USD', type: Number })
  totalEarningsUSD: number;

  @ApiProperty({ description: 'Total number of earning records' })
  totalCount: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Indicates if there is a next page' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Indicates if there is a previous page' })
  hasPreviousPage: boolean;
}
