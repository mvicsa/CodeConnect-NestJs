import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class UpdateRoomDto {
  @ApiProperty({ description: 'Room name', example: 'My Updated Coding Room', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Room description', example: 'An updated room for coding together', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Is room private', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiProperty({ description: 'Maximum number of participants', example: 15, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxParticipants?: number;

  @ApiProperty({ description: 'Is room active', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
} 