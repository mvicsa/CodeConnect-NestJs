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
  ValidateIf, // Added ValidateIf
  IsIn, // Added IsIn
  IsEmail,
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
  maxParticipants?: number | null; // Changed to allow null

  @ApiProperty({
    description: 'Is room paid',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiProperty({
    description: 'Price of the room if it is paid',
    example: 9.99,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01) // Minimum price if paid
  @ValidateIf((o) => o.isPaid === true) // Price is required if isPaid is true
  price?: number;

  @ApiProperty({
    description: 'Currency used for payment',
    example: 'USD',
    required: false,
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Is room active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Scheduled start time for the meeting (required if isPaid is true)',
    example: '2024-01-15T10:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  @ValidateIf((o) => o.isPaid === true) // Required if isPaid is true
  scheduledStartTime?: string;

  @ApiProperty({
    description: 'Array of user emails to invite to the room',
    example: ['user1@example.com', 'user2@example.com'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true }) // Ensure each element is a string
  @IsEmail({}, { each: true }) // Ensure each element is a valid email
  @IsOptional()
  invitedUsers?: string[];

  @ApiProperty({
    description: 'Cancel the room (will refund all participants)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  cancel?: boolean;

  @ApiProperty({
    description: 'Reason for cancelling the room',
    example: 'Session no longer needed',
    required: false,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.cancel === true) // Required if cancel is true
  cancellationReason?: string;
}
