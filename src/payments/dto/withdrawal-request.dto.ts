import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString } from 'class-validator';

export class WithdrawalRequestDto {
  @ApiProperty({ description: 'Amount to withdraw', example: 100 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Currency of the withdrawal', example: 'USD' })
  @IsString()
  currency: string; // Assuming 'USD' for now, but can be dynamic
}
