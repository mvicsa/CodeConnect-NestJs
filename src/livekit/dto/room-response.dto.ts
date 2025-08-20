import { ApiProperty } from '@nestjs/swagger';

export class InvitedUserDto {
  @ApiProperty({ description: 'User ID' })
  _id: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  email: string;
}

export class CreatedByDto {
  @ApiProperty({ description: 'User ID' })
  _id: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'Username' })
  username: string;
}

export class RoomResponseDto {
  @ApiProperty({ description: 'Room ID' })
  _id: string;

  @ApiProperty({ description: 'Room name' })
  name: string;

  @ApiProperty({ description: 'Room description' })
  description: string;

  @ApiProperty({ description: 'Room creator', type: CreatedByDto })
  createdBy: CreatedByDto;

  @ApiProperty({ description: 'Is room private' })
  isPrivate: boolean;

  @ApiProperty({ description: 'Maximum number of participants' })
  maxParticipants: number;

  @ApiProperty({ description: 'Is room active' })
  isActive: boolean;

  @ApiProperty({ description: 'Invited users', type: [InvitedUserDto] })
  invitedUsers: InvitedUserDto[];

  @ApiProperty({ 
    description: 'Scheduled start time for the meeting (optional)',
    example: '2024-01-15T10:00:00.000Z',
    required: false
  })
  scheduledStartTime?: Date;

  @ApiProperty({ 
    description: 'Actual time when the session started',
    example: '2024-01-15T09:45:00.000Z',
    required: false
  })
  actualStartTime?: Date;

  @ApiProperty({ description: 'Room creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Room last update date' })
  updatedAt: Date;

  @ApiProperty({ 
    description: 'When the session ended (if ended)',
    example: '2024-01-15T12:00:00.000Z',
    required: false
  })
  endedDate?: Date;

  @ApiProperty({ 
    description: 'Total number of unique participants who joined this session',
    example: 15,
    required: false
  })
  totalParticipantsJoined?: number;

  @ApiProperty({ 
    description: 'Current number of active participants in the session',
    example: 8,
    required: false
  })
  currentActiveParticipants?: number;

  @ApiProperty({ 
    description: 'Peak number of participants during the session',
    example: 12,
    required: false
  })
  peakParticipants?: number;
} 