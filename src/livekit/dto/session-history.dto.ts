import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsString, IsIn } from 'class-validator';
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

  @ApiProperty({ 
    description: 'Filter by session status', 
    enum: ['active', 'ended', 'cancelled', 'all'], 
    example: 'all',
    required: false,
    default: 'all' 
  })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'ended', 'cancelled', 'all'])
  status?: 'active' | 'ended' | 'cancelled' | 'all' = 'all';

  @ApiProperty({ 
    description: 'Filter by room type', 
    enum: ['public', 'private', 'all'], 
    example: 'all',
    required: false,
    default: 'all' 
  })
  @IsOptional()
  @IsString()
  @IsIn(['public', 'private', 'all'])
  type?: 'public' | 'private' | 'all' = 'all';

  @ApiProperty({ 
    description: 'Filter by payment status', 
    enum: ['paid', 'free', 'all'], 
    example: 'all',
    required: false,
    default: 'all' 
  })
  @IsOptional()
  @IsString()
  @IsIn(['paid', 'free', 'all'])
  paymentStatus?: 'paid' | 'free' | 'all' = 'all';

  @ApiProperty({ 
    description: 'Search in room name and description', 
    example: 'coding session',
    required: false 
  })
  @IsOptional()
  @IsString()
  search?: string;
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

  @ApiProperty({ description: 'Room status (Active/Ended/Cancelled/Error)' })
  status: string;

  @ApiProperty({ description: 'Is room paid', required: false })
  isPaid?: boolean;

  @ApiProperty({ description: 'Room price', required: false })
  price?: number;

  @ApiProperty({ description: 'Room currency', required: false })
  currency?: string;

  @ApiProperty({ description: 'Room cancellation date', required: false })
  cancelledAt?: Date | null;

  @ApiProperty({ description: 'Room cancellation reason', required: false })
  cancellationReason?: string | null;

  @ApiProperty({ description: 'Additional note (optional)' })
  note?: string;

  @ApiProperty({ description: 'Average rating of the session', required: false })
  averageRating?: number;

  @ApiProperty({ description: 'Total number of ratings for this session', required: false })
  ratingCount?: number;

  @ApiProperty({ description: 'Current user rating for this session', required: false })
  userRating?: number;

  @ApiProperty({ description: 'Whether current user has rated this session', required: false })
  isUserRated?: boolean;

  @ApiProperty({ description: 'Error message if processing failed (optional)' })
  error?: string;
}

export class SessionHistoryFiltersDto {
  @ApiProperty({ description: 'Available status filters', example: ['active', 'ended', 'cancelled', 'all'] })
  availableStatuses: string[];

  @ApiProperty({ description: 'Available type filters', example: ['public', 'private', 'all'] })
  availableTypes: string[];

  @ApiProperty({ description: 'Available payment status filters', example: ['paid', 'free', 'all'] })
  availablePaymentStatuses: string[];

  @ApiProperty({ description: 'Total active sessions' })
  totalActiveSessions: number;

  @ApiProperty({ description: 'Total ended sessions' })
  totalEndedSessions: number;

  @ApiProperty({ description: 'Total cancelled sessions' })
  totalCancelledSessions: number;

  @ApiProperty({ description: 'Total public sessions' })
  totalPublicSessions: number;

  @ApiProperty({ description: 'Total private sessions' })
  totalPrivateSessions: number;

  @ApiProperty({ description: 'Total paid sessions' })
  totalPaidSessions: number;

  @ApiProperty({ description: 'Total free sessions' })
  totalFreeSessions: number;
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

  @ApiProperty({ description: 'Number of cancelled rooms' })
  cancelledRooms: number;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Pagination metadata', type: PaginationDto })
  pagination: PaginationDto;

  @ApiProperty({ description: 'Available filters', type: SessionHistoryFiltersDto })
  filters: SessionHistoryFiltersDto;
}

