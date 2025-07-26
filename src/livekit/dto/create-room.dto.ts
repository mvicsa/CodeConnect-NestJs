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
  @Max(50)
  maxParticipants?: number;

  @ApiProperty({
    description: 'Array of user IDs to invite to the room',
    example: ['userId1', 'userId2'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true }) // Ensure each element is a string
  invitedUsers?: string[];
}
