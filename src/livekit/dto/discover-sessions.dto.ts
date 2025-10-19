import { IsOptional, IsNumber, Min, IsString, IsIn, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

export class DiscoverSessionsQueryDto {
  @ApiProperty({ required: false, description: 'Page number for pagination', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, description: 'Number of items per page', default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({ required: false, description: 'Search text in name and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by session type', enum: ['public', 'private', 'all'], default: 'all' })
  @IsOptional()
  @IsString()
  @IsIn(['public', 'private', 'all'])
  type?: 'public' | 'private' | 'all' = 'all';

  @ApiProperty({ required: false, description: 'Filter by session status', enum: ['active', 'scheduled', 'ended', 'cancelled', 'all'], default: 'all' })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'scheduled', 'ended', 'cancelled', 'all'])
  status?: 'active' | 'scheduled' | 'ended' | 'cancelled' | 'all' = 'all';

  @ApiProperty({ required: false, description: 'Filter by paid sessions only' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isPaid?: boolean;

  @ApiProperty({ required: false, description: 'Minimum price filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @ApiProperty({ required: false, description: 'Maximum price filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @ApiProperty({ required: false, description: 'Filter by currency' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false, description: 'Sessions scheduled after this date (ISO 8601 string)' })
  @IsOptional()
  @IsString()
  scheduledAfter?: string;

  @ApiProperty({ required: false, description: 'Sessions scheduled before this date (ISO 8601 string)' })
  @IsOptional()
  @IsString()
  scheduledBefore?: string;

  @ApiProperty({ required: false, description: 'Sort results by field', enum: ['createdAt', 'name', 'participants', 'price', 'rating'], default: 'createdAt' })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'name', 'participants', 'price', 'rating'])
  sortBy?: 'createdAt' | 'name' | 'participants' | 'price' | 'rating' = 'createdAt';

  @ApiProperty({ required: false, description: 'Sort order', enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}

export class SessionCreatorDto {
  @ApiProperty({ description: 'User ID of the session creator' })
  _id: string;

  @ApiProperty({ description: 'Username of the creator' })
  username: string;

  @ApiProperty({ description: 'First name of the creator' })
  firstName: string;

  @ApiProperty({ description: 'Last name of the creator' })
  lastName: string;

  @ApiProperty({ description: 'Avatar URL of the creator', required: false })
  avatar?: string;
}

export class DiscoverSessionDto {
  @ApiProperty({ description: 'Session ID' })
  _id: string;

  @ApiProperty({ description: 'Session name' })
  name: string;

  @ApiProperty({ description: 'Session description' })
  description: string;

  @ApiProperty({ description: 'Whether the session is private' })
  isPrivate: boolean;

  @ApiProperty({ description: 'Whether the session is paid' })
  isPaid: boolean;

  @ApiProperty({ description: 'Price of the session (if paid)', required: false })
  price?: number;

  @ApiProperty({ description: 'Currency of the session (if paid)', required: false })
  currency?: string;

  @ApiProperty({ description: 'Maximum number of participants', required: false })
  maxParticipants?: number;

  @ApiProperty({ description: 'Current number of active participants' })
  currentParticipants: number;

  @ApiProperty({ description: 'Whether the session is currently active' })
  isActive: boolean;

  @ApiProperty({ description: 'Scheduled start time', required: false })
  scheduledStartTime?: string;

  @ApiProperty({ description: 'Actual start time', required: false })
  actualStartTime?: string;

  @ApiProperty({ description: 'End date if session has ended', required: false })
  endedDate?: string;

  @ApiProperty({ description: 'Session creation date' })
  createdAt: string;

  @ApiProperty({ description: 'Session last update date' })
  updatedAt: string;

  @ApiProperty({ description: 'Creator of the session', type: SessionCreatorDto })
  createdBy: SessionCreatorDto;

  @ApiProperty({ description: 'Users invited to the session', type: [SessionCreatorDto], required: false })
  invitedUsers?: SessionCreatorDto[];

  // إحصائيات إضافية
  @ApiProperty({ description: 'Total participants who joined this session', required: false })
  totalParticipantsJoined?: number;

  @ApiProperty({ description: 'Average rating of the session', required: false })
  averageRating?: number;

  @ApiProperty({ description: 'Number of ratings received', required: false })
  ratingCount?: number;

  @ApiProperty({ description: 'Session tags for categorization', required: false })
  tags?: string[];

  @ApiProperty({ description: 'Session category', required: false })
  category?: string;

  @ApiProperty({ 
    description: 'Number of completed purchases for this session',
    example: 5,
    required: false
  })
  completedPurchasesCount?: number;

  @ApiProperty({ 
    description: 'Recent purchasers (last 3) for public view',
    type: [Object],
    required: false
  })
  recentPurchasers?: Array<{
    userId: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    purchasedAt: Date;
  }>;
}

export class DiscoverSessionsFiltersDto {
  @ApiProperty({ description: 'Available session types' })
  availableTypes: string[];

  @ApiProperty({ description: 'Available session statuses' })
  availableStatuses: string[];

  @ApiProperty({ description: 'Available currencies' })
  availableCurrencies: string[];

  @ApiProperty({ description: 'Total number of paid sessions' })
  totalPaidSessions: number;

  @ApiProperty({ description: 'Total number of free sessions' })
  totalFreeSessions: number;

  @ApiProperty({ description: 'Total number of scheduled sessions' })
  totalScheduledSessions: number;

  @ApiProperty({ description: 'Total number of active sessions' })
  totalActiveSessions: number;

  @ApiProperty({ description: 'Price range for paid sessions' })
  priceRange: {
    min: number;
    max: number;
  };
}

export class DiscoverSessionsPaginationDto {
  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of sessions' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page' })
  hasNext: boolean;

  @ApiProperty({ description: 'Whether there is a previous page' })
  hasPrev: boolean;
}

export class DiscoverSessionsResponseDto {
  @ApiProperty({ type: [DiscoverSessionDto], description: 'List of discoverable sessions' })
  sessions: DiscoverSessionDto[];

  @ApiProperty({ type: DiscoverSessionsPaginationDto, description: 'Pagination information' })
  pagination: DiscoverSessionsPaginationDto;

  @ApiProperty({ type: DiscoverSessionsFiltersDto, description: 'Available filters and statistics' })
  filters: DiscoverSessionsFiltersDto;
}
