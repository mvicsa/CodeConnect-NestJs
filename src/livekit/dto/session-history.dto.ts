import { ApiProperty } from '@nestjs/swagger';

export class SessionHistoryItemDto {
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ApiProperty({ description: 'Room name' })
  roomName: string;

  @ApiProperty({ description: 'Room description' })
  roomDescription: string;

  @ApiProperty({ description: 'Is room private' })
  isPrivate: boolean;

  @ApiProperty({ description: 'Is room currently active' })
  isActive: boolean;

  @ApiProperty({ description: 'Room creator information' })
  createdBy: any;

  @ApiProperty({ description: 'Room creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Room end date (null if still active)' })
  endedAt: Date | null;

  @ApiProperty({ description: 'Total room duration in milliseconds (null if still active)' })
  duration: number | null;

  @ApiProperty({ description: 'Total time user spent in this room in milliseconds' })
  totalTimeSpent: number;

  @ApiProperty({ description: 'Number of times user joined this room' })
  joinCount: number;

  @ApiProperty({ description: 'Number of currently active participations' })
  activeParticipations: number;

  @ApiProperty({ description: 'Last time user joined this room' })
  lastJoined: Date | null;

  @ApiProperty({ description: 'Room status (Active/Ended/Error)' })
  status: string;

  @ApiProperty({ description: 'Additional note (optional)' })
  note?: string;

  @ApiProperty({ description: 'Error message if processing failed (optional)' })
  error?: string;
}

export class SessionHistoryResponseDto {
  @ApiProperty({ description: 'Array of session history items', type: [SessionHistoryItemDto] })
  mySessionHistory: SessionHistoryItemDto[];

  @ApiProperty({ description: 'Total number of rooms' })
  totalRooms: number;

  @ApiProperty({ description: 'Number of active rooms' })
  activeRooms: number;

  @ApiProperty({ description: 'Number of ended rooms' })
  endedRooms: number;

  @ApiProperty({ description: 'Response message' })
  message: string;
}

