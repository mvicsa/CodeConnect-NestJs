import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SessionHistoryQueryDto {
  @ApiProperty({ 
    description: 'Page number (starts from 1)', 
    example: 1, 
    required: false,
    default: 1 
  })
  @IsOptional()
  @Transform(({ value }) => {
    const num = parseInt(value, 10);
    return isNaN(num) ? 1 : num;
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ 
    description: 'Number of items per page', 
    example: 10, 
    required: false,
    default: 10 
  })
  @IsOptional()
  @Transform(({ value }) => {
    const num = parseInt(value, 10);
    return isNaN(num) ? 10 : Math.min(Math.max(num, 1), 100);
  })
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PaginationDto {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of items per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total number of items', example: 150 })
  total: number;

  @ApiProperty({ description: 'Total number of pages', example: 15 })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  hasNext: boolean;

  @ApiProperty({ description: 'Whether there is a previous page', example: false })
  hasPrev: boolean;
}

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

  @ApiProperty({ description: 'Pagination metadata', type: PaginationDto })
  pagination: PaginationDto;
}

