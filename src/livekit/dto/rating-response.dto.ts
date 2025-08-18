import { ApiProperty } from '@nestjs/swagger';

export class RatingResponseDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  roomId: string;

  @ApiProperty()
  creatorId: string;

  @ApiProperty()
  raterId: string;

  @ApiProperty()
  overallRating: number;

  @ApiProperty()
  technicalKnowledge: number;

  @ApiProperty()
  communication: number;

  @ApiProperty()
  organization: number;

  @ApiProperty()
  helpfulness: number;

  @ApiProperty({ required: false })
  comment?: string;

  @ApiProperty()
  isAnonymous: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  raterUsername?: string;

  @ApiProperty({ required: false })
  creatorUsername?: string;

  @ApiProperty({ required: false })
  raterFirstName?: string;

  @ApiProperty({ required: false })
  raterLastName?: string;

  @ApiProperty({ required: false })
  creatorFirstName?: string;

  @ApiProperty({ required: false })
  creatorLastName?: string;

  @ApiProperty({ required: false, description: 'Name of the session/room that was rated' })
  roomName?: string;

  @ApiProperty({ required: false, description: 'Description of the session/room that was rated' })
  roomDescription?: string;
}

export class CreatorRatingSummaryDto {
  @ApiProperty()
  creatorId: string;

  @ApiProperty()
  creatorUsername: string;

  @ApiProperty()
  totalRatings: number;

  @ApiProperty()
  averageOverallRating: number;

  @ApiProperty()
  averageTechnicalKnowledge: number;

  @ApiProperty()
  averageCommunication: number;

  @ApiProperty()
  averageOrganization: number;

  @ApiProperty()
  averageHelpfulness: number;

  @ApiProperty()
  ratingDistribution: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
}

export class RatingFilterDto {
  @ApiProperty({ required: false, description: 'Search in room names, comments, or usernames' })
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by specific rating (1-5 or "all")' })
  rating?: string;

  @ApiProperty({ required: false, description: 'Sort by: newest, oldest, highest, lowest' })
  sortBy?: string;
}
