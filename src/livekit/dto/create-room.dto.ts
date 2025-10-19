import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
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

export class CreateRoomDto {
  @ApiProperty({ description: 'Room name', example: 'My Coding Room' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Room description',
    example: 'A room for coding together',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

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
    example: 10,
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
}
