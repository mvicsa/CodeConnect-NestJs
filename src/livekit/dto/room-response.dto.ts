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

export class RecentPurchaserDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'User avatar URL' })
  avatar: string;

  @ApiProperty({ description: 'Purchase date' })
  purchasedAt: Date;
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

  @ApiProperty({ 
    description: 'Number of completed purchases for this room',
    example: 5,
    required: false
  })
  completedPurchasesCount?: number;

  @ApiProperty({ 
    description: 'Recent purchasers (last 3) for public view',
    type: [RecentPurchaserDto],
    required: false
  })
  recentPurchasers?: RecentPurchaserDto[];
}

export class PurchaserDto {
  @ApiProperty({ description: 'Purchase ID' })
  purchaseId: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'User avatar URL' })
  avatar: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'Amount paid' })
  amountPaid: number;

  @ApiProperty({ description: 'Currency used' })
  currency: string;

  @ApiProperty({ description: 'Purchase date' })
  purchasedAt: Date;

  @ApiProperty({ description: 'Purchase status' })
  status: string;
}

export class PaginationDto {
  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of items' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Has next page' })
  hasNext: boolean;

  @ApiProperty({ description: 'Has previous page' })
  hasPrev: boolean;
}

export class RoomPurchasersResponseDto {
  @ApiProperty({ description: 'Room ID' })
  roomId: string;

  @ApiProperty({ description: 'Room name' })
  roomName: string;

  @ApiProperty({ description: 'Total number of purchasers' })
  totalPurchasers: number;

  @ApiProperty({ description: 'Total revenue from all purchases' })
  totalRevenue: number;

  @ApiProperty({ description: 'List of purchasers for current page', type: [PurchaserDto] })
  purchasers: PurchaserDto[];

  @ApiProperty({ description: 'Pagination information', type: PaginationDto })
  pagination: PaginationDto;
} 