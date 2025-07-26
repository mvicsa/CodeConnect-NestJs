import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class UpdateBlockDto {
  @ApiProperty({ description: 'Optional reason for blocking', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ description: 'Whether the block is active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}