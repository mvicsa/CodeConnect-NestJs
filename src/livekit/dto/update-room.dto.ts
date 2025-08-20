import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsArray,
  IsDateString,
} from 'class-validator';

export class UpdateRoomDto {
  @ApiProperty({
    description: 'Room name',
    example: 'My Updated Coding Room',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Room description',
    example: 'An updated room for coding together',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Is room private',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiProperty({
    description: 'Maximum number of participants',
    example: 15,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxParticipants?: number;

  @ApiProperty({
    description: 'Is room active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Scheduled start time for the meeting (optional)',
    example: '2024-01-15T10:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  scheduledStartTime?: string;

  @ApiProperty({
    description: 'Array of user IDs to invite to the room',
    example: ['userId1', 'userId2'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invitedUsers?: string[];
}
