import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsOptional, IsString, Min } from 'class-validator';

export class AdminPlatformWithdrawDto {
  @ApiProperty({ description: 'Amount to withdraw (USD)', example: 100.0, minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Reason for the withdrawal', example: 'Monthly withdrawal', required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  reason?: string;
}


