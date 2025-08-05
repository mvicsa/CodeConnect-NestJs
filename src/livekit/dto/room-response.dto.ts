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

  @ApiProperty({ description: 'Room creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Room last update date' })
  updatedAt: Date;
} 