import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rating, RatingDocument } from './schemas/rating.schema';
import { LivekitSession, LivekitSessionDocument } from './session.schema';
import { LivekitRoom, LivekitRoomDocument } from './room.schema';
import { User, UserDocument } from '../users/shemas/user.schema';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingResponseDto, CreatorRatingSummaryDto } from './dto/rating-response.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class RatingService {
  constructor(
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,
    @InjectModel(LivekitSession.name)
    private readonly sessionModel: Model<LivekitSessionDocument>,
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoomDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  async createRating(
    sessionId: string,
    raterId: string,
    createRatingDto: CreateRatingDto,
  ): Promise<RatingResponseDto> {
    // First try to find a session with this ID
    let session = await this.sessionModel.findById(sessionId);
    let roomId: Types.ObjectId;
    
    if (session && session.roomId) {
      // Found a session, use its roomId
      roomId = session.roomId;
      
      // Check if session is still active
      if (session.participants.some(p => p.isActive)) {
        throw new BadRequestException('Cannot rate an active session. Please wait for the session to end.');
      }
      
      // Check if user was a participant in this session
      const wasParticipant = session.participants.some(
        p => p.userId.toString() === raterId && p.leftAt !== undefined
      );
      if (!wasParticipant) {
        throw new ForbiddenException('Only session participants can rate the meeting creator');
      }
    } else {
      // No session found, check if this might be a room ID
      const room = await this.roomModel.findById(sessionId);
      if (!room) {
        throw new NotFoundException('Session or room not found');
      }
      
      roomId = room._id as Types.ObjectId;
      
      // For rooms without sessions, we'll allow rating if the room has ended
      if (room.isActive) {
        throw new BadRequestException('Cannot rate an active room. Please wait for the room to end.');
      }
    }

    // Get room information
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user was a participant in this session (only if session exists)
    if (session) {
      const wasParticipant = session.participants.some(
        p => p.userId.toString() === raterId && p.leftAt !== undefined
      );
      if (!wasParticipant) {
        throw new ForbiddenException('Only session participants can rate the meeting creator');
      }
    }

    // Check if user has already rated this session
    const existingRating = await this.ratingModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
      raterId: new Types.ObjectId(raterId),
    });

    if (existingRating) {
      throw new BadRequestException('You have already rated this session');
    }

    // Create the rating
    const rating = new this.ratingModel({
      sessionId: new Types.ObjectId(sessionId),
      roomId: roomId,
      creatorId: room.createdBy,
      raterId: new Types.ObjectId(raterId),
      ...createRatingDto,
    });

    const savedRating = await rating.save();

    // Send notification to the creator
    try {
      await this.notificationService.create({
        toUserId: room.createdBy.toString(),
        fromUserId: raterId,
        content: `rating your session "${room.name}"`,
        type: 'RATING_RECEIVED' as any, // Using the new notification type from your existing system
        data: {
          ratingId: (savedRating._id as Types.ObjectId).toString(),
          sessionId,
          roomId: roomId.toString(),
          rating: createRatingDto.overallRating,
          comment: createRatingDto.comment,
          raterId,
        },
      });
    } catch (notificationError) {
      console.error('Failed to send rating notification:', notificationError);
      // Don't fail the rating creation if notification fails
    }

    // Populate usernames and room info for response
    const populatedRating = await this.ratingModel
      .findById(savedRating._id)
      .populate('raterId', 'username firstName lastName')
      .populate('creatorId', 'username firstName lastName')
      .populate('roomId', 'name description');

    return this.mapToRatingResponse(populatedRating);
  }

  async getSessionRatings(sessionId: string): Promise<RatingResponseDto[]> {
    const ratings = await this.ratingModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .populate('raterId', 'username firstName lastName')
      .populate('creatorId', 'username firstName lastName')
      .populate('roomId', 'name description');

    return ratings.map(rating => this.mapToRatingResponse(rating));
  }

  async getCreatorRatings(creatorId: string): Promise<RatingResponseDto[]> {
    const ratings = await this.ratingModel
      .find({ creatorId: new Types.ObjectId(creatorId) })
      .populate('raterId', 'username firstName lastName')
      .populate('creatorId', 'username firstName lastName')
      .populate('roomId', 'name description')
      .sort({ createdAt: -1 });

    return ratings.map(rating => this.mapToRatingResponse(rating));
  }

  async getCreatorRatingSummary(creatorId: string): Promise<CreatorRatingSummaryDto> {
    const ratings = await this.ratingModel.find({
      creatorId: new Types.ObjectId(creatorId),
    });

    if (ratings.length === 0) {
      throw new NotFoundException('No ratings found for this creator');
    }

    const creator = await this.userModel.findById(creatorId).select('username');
    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    // Calculate averages
    const totalRatings = ratings.length;
    const averageOverallRating = this.calculateAverage(ratings.map(r => r.overallRating));
    const averageTechnicalKnowledge = this.calculateAverage(ratings.map(r => r.technicalKnowledge));
    const averageCommunication = this.calculateAverage(ratings.map(r => r.communication));
    const averageOrganization = this.calculateAverage(ratings.map(r => r.organization));
    const averageHelpfulness = this.calculateAverage(ratings.map(r => r.helpfulness));

    // Calculate rating distribution
    const ratingDistribution = {
      '1': ratings.filter(r => r.overallRating === 1).length,
      '2': ratings.filter(r => r.overallRating === 2).length,
      '3': ratings.filter(r => r.overallRating === 3).length,
      '4': ratings.filter(r => r.overallRating === 4).length,
      '5': ratings.filter(r => r.overallRating === 5).length,
    };

    return {
      creatorId,
      creatorUsername: creator.username,
      totalRatings,
      averageOverallRating,
      averageTechnicalKnowledge,
      averageCommunication,
      averageOrganization,
      averageHelpfulness,
      ratingDistribution,
    };
  }

  async updateRating(
    ratingId: string,
    raterId: string,
    updateData: Partial<CreateRatingDto>,
  ): Promise<RatingResponseDto> {
    const rating = await this.ratingModel.findById(ratingId);
    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    // Check if user owns this rating
    if (rating.raterId.toString() !== raterId) {
      throw new ForbiddenException('You can only update your own ratings');
    }

    // Update the rating
    Object.assign(rating, updateData);
    const updatedRating = await rating.save();

    // Populate usernames and room info for response
    const populatedRating = await this.ratingModel
      .findById(updatedRating._id)
      .populate('raterId', 'username firstName lastName')
      .populate('creatorId', 'username firstName lastName')
      .populate('roomId', 'name description');

    return this.mapToRatingResponse(populatedRating);
  }

  async deleteRating(ratingId: string, raterId: string): Promise<void> {
    const rating = await this.ratingModel.findById(ratingId);
    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    // Check if user owns this rating
    if (rating.raterId.toString() !== raterId) {
      throw new ForbiddenException('You can only delete your own ratings');
    }

    await this.ratingModel.findByIdAndDelete(ratingId);
  }

  async getTopRatedCreators(limit: number = 10): Promise<CreatorRatingSummaryDto[]> {
    const pipeline = [
      {
        $group: {
          _id: '$creatorId',
          totalRatings: { $sum: 1 },
          averageOverallRating: { $avg: '$overallRating' },
          averageTechnicalKnowledge: { $avg: '$technicalKnowledge' },
          averageCommunication: { $avg: '$communication' },
          averageOrganization: { $avg: '$organization' },
          averageHelpfulness: { $avg: '$helpfulness' },
        },
      },
      {
        $match: {
          totalRatings: { $gte: 3 }, // Only include creators with at least 3 ratings
        },
      },
      {
        $sort: { averageOverallRating: -1 as const, totalRatings: -1 as const },
      },
      {
        $limit: limit,
      },
    ];

    const results = await this.ratingModel.aggregate(pipeline);

    // Populate creator information
    const creatorIds = results.map(r => r._id);
    const creators = await this.userModel.find({ _id: { $in: creatorIds } }).select('username');

    return results.map(result => {
      const creator = creators.find(c => (c._id as any).toString() === result._id.toString());
      return {
        creatorId: result._id.toString(),
        creatorUsername: creator?.username || 'Unknown',
        totalRatings: result.totalRatings,
        averageOverallRating: Math.round(result.averageOverallRating * 100) / 100,
        averageTechnicalKnowledge: Math.round(result.averageTechnicalKnowledge * 100) / 100,
        averageCommunication: Math.round(result.averageCommunication * 100) / 100,
        averageOrganization: Math.round(result.averageOrganization * 100) / 100,
        averageHelpfulness: Math.round(result.averageHelpfulness * 100) / 100,
        ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, // Simplified for top rated
      };
    });
  }

  async getAllRatings(
    page: number = 1, 
    limit: number = 10, 
    filters?: { search?: string; rating?: string; sortBy?: string }
  ): Promise<{
    ratings: RatingResponseDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    console.log('Getting ratings with filters:', filters);
    
    // Try simple approach first to see if there are any ratings at all
    const simpleCount = await this.ratingModel.countDocuments();
    console.log('Simple count of all ratings:', simpleCount);
    
    if (simpleCount === 0) {
      console.log('No ratings found in database');
      return {
        ratings: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // Build query object
    const query: any = {};
    
    if (filters?.rating && filters.rating !== 'all') {
      query.overallRating = parseInt(filters.rating);
    }
    
    // Build sort object
    let sort: any = { createdAt: -1 }; // default to newest
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'newest':
          sort = { createdAt: -1 };
          break;
        case 'oldest':
          sort = { createdAt: 1 };
          break;
        case 'highest':
          sort = { overallRating: -1, createdAt: -1 };
          break;
        case 'lowest':
          sort = { overallRating: 1, createdAt: -1 };
          break;
      }
    }

    console.log('Using simple approach with query:', query);

    // If search is provided, use a more efficient approach
    if (filters?.search) {
      console.log('Search provided, using efficient search...');
      
      // First, try to find ratings by comment (direct field search)
      const commentQuery = { ...query, comment: { $regex: filters.search, $options: 'i' } };
      const commentRatings = await this.ratingModel
        .find(commentQuery)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort);

      // Get room IDs that match the search
      const roomQuery = { 
        $or: [
          { name: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } }
        ]
      };
      const matchingRooms = await this.roomModel.find(roomQuery).select('_id');
      const matchingRoomIds = matchingRooms.map(room => room._id);

      // Get user IDs that match the search
      const userQuery = {
        $or: [
          { username: { $regex: filters.search, $options: 'i' } },
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } }
        ]
      };
      const matchingUsers = await this.userModel.find(userQuery).select('_id');
      const matchingUserIds = matchingUsers.map(user => user._id);

      // Build search query for ratings
      const searchQuery = {
        ...query,
        $or: [
          { comment: { $regex: filters.search, $options: 'i' } },
          { roomId: { $in: matchingRoomIds } },
          { raterId: { $in: matchingUserIds } },
          { creatorId: { $in: matchingUserIds } }
        ]
      };

      // Get total count for search
      const total = await this.ratingModel.countDocuments(searchQuery);
      console.log(`Search "${filters.search}" found ${total} ratings`);

      // Apply pagination
      const skip = (page - 1) * limit;
      const ratings = await this.ratingModel
        .find(searchQuery)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        ratings: ratings.map(rating => this.mapToRatingResponse(rating)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    } else {
      // No search, use normal pagination
      const skip = (page - 1) * limit;
      
      // Get total count
      const total = await this.ratingModel.countDocuments(query);
      console.log('Total count with filters:', total);
      
      // Get ratings with populate
      const ratings = await this.ratingModel
        .find(query)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort)
        .skip(skip)
        .limit(limit);
      
      console.log('Found ratings:', ratings.length);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        ratings: ratings.map(rating => this.mapToRatingResponse(rating)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    }
  }

  async getRatingById(ratingId: string): Promise<RatingResponseDto> {
    const rating = await this.ratingModel
      .findById(ratingId)
      .populate('raterId', 'username firstName lastName')
      .populate('creatorId', 'username firstName lastName')
      .populate('roomId', 'name description');

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    return this.mapToRatingResponse(rating);
  }

  async getUserSubmittedRatings(
    userId: string, 
    page: number = 1, 
    limit: number = 10,
    filters?: { search?: string; rating?: string; sortBy?: string }
  ): Promise<{
    ratings: RatingResponseDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Build query object
    const query: any = { raterId: new Types.ObjectId(userId) };
    
    if (filters?.rating && filters.rating !== 'all') {
      query.overallRating = parseInt(filters.rating);
    }
    
    // Build sort object
    let sort: any = { createdAt: -1 }; // default to newest
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'newest':
          sort = { createdAt: -1 };
          break;
        case 'oldest':
          sort = { createdAt: 1 };
          break;
        case 'highest':
          sort = { overallRating: -1, createdAt: -1 };
          break;
        case 'lowest':
          sort = { overallRating: 1, createdAt: -1 };
          break;
      }
    }

    // If search is provided, use a more efficient approach
    if (filters?.search) {
      // Get room IDs that match the search
      const roomQuery = { 
        $or: [
          { name: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } }
        ]
      };
      const matchingRooms = await this.roomModel.find(roomQuery).select('_id');
      const matchingRoomIds = matchingRooms.map(room => room._id);

      // Get user IDs that match the search
      const userQuery = {
        $or: [
          { username: { $regex: filters.search, $options: 'i' } },
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } }
        ]
      };
      const matchingUsers = await this.userModel.find(userQuery).select('_id');
      const matchingUserIds = matchingUsers.map(user => user._id);

      // Build search query for ratings
      const searchQuery = {
        ...query,
        $or: [
          { comment: { $regex: filters.search, $options: 'i' } },
          { roomId: { $in: matchingRoomIds } },
          { creatorId: { $in: matchingUserIds } }
        ]
      };

      // Get total count for search
      const total = await this.ratingModel.countDocuments(searchQuery);

      // Apply pagination
      const skip = (page - 1) * limit;
      const ratings = await this.ratingModel
        .find(searchQuery)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        ratings: ratings.map(rating => this.mapToRatingResponse(rating)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    } else {
      // No search, use normal pagination
      const skip = (page - 1) * limit;
      
      // Get total count
      const total = await this.ratingModel.countDocuments(query);
      
      // Get ratings with populate
      const ratings = await this.ratingModel
        .find(query)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        ratings: ratings.map(rating => this.mapToRatingResponse(rating)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    }
  }

  async getUserReceivedRatings(
    userId: string, 
    page: number = 1, 
    limit: number = 10,
    filters?: { search?: string; rating?: string; sortBy?: string }
  ): Promise<{
    ratings: RatingResponseDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Build query object
    const query: any = { creatorId: new Types.ObjectId(userId) };
    
    if (filters?.rating && filters.rating !== 'all') {
      query.overallRating = parseInt(filters.rating);
    }
    
    // Build sort object
    let sort: any = { createdAt: -1 }; // default to newest
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'newest':
          sort = { createdAt: -1 };
          break;
        case 'oldest':
          sort = { createdAt: 1 };
          break;
        case 'highest':
          sort = { overallRating: -1, createdAt: -1 };
          break;
        case 'lowest':
          sort = { overallRating: 1, createdAt: -1 };
          break;
      }
    }

    // If search is provided, use a more efficient approach
    if (filters?.search) {
      // Get room IDs that match the search
      const roomQuery = { 
        $or: [
          { name: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } }
        ]
      };
      const matchingRooms = await this.roomModel.find(roomQuery).select('_id');
      const matchingRoomIds = matchingRooms.map(room => room._id);

      // Get user IDs that match the search
      const userQuery = {
        $or: [
          { username: { $regex: filters.search, $options: 'i' } },
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } }
        ]
      };
      const matchingUsers = await this.userModel.find(userQuery).select('_id');
      const matchingUserIds = matchingUsers.map(user => user._id);

      // Build search query for ratings
      const searchQuery = {
        ...query,
        $or: [
          { comment: { $regex: filters.search, $options: 'i' } },
          { roomId: { $in: matchingRoomIds } },
          { raterId: { $in: matchingUserIds } }
        ]
      };

      // Get total count for search
      const total = await this.ratingModel.countDocuments(searchQuery);

      // Apply pagination
      const skip = (page - 1) * limit;
      const ratings = await this.ratingModel
        .find(searchQuery)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        ratings: ratings.map(rating => this.mapToRatingResponse(rating)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    } else {
      // No search, use normal pagination
      const skip = (page - 1) * limit;
      
      // Get total count
      const total = await this.ratingModel.countDocuments(query);
      
      // Get ratings with populate
      const ratings = await this.ratingModel
        .find(query)
        .populate('raterId', 'username firstName lastName')
        .populate('creatorId', 'username firstName lastName')
        .populate('roomId', 'name description')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        ratings: ratings.map(rating => this.mapToRatingResponse(rating)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    }
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / values.length) * 100) / 100;
  }

  private mapToRatingResponse(rating: any): RatingResponseDto {
    return {
      _id: rating._id.toString(),
      sessionId: rating.sessionId.toString(),
      roomId: rating.roomId.toString(),
      creatorId: rating.creatorId.toString(),
      raterId: rating.raterId.toString(),
      overallRating: rating.overallRating,
      technicalKnowledge: rating.technicalKnowledge,
      communication: rating.communication,
      organization: rating.organization,
      helpfulness: rating.helpfulness,
      comment: rating.comment,
      isAnonymous: rating.isAnonymous,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
      raterUsername: rating.raterId?.username,
      creatorUsername: rating.creatorId?.username,
      raterFirstName: rating.raterId?.firstName,
      raterLastName: rating.raterId?.lastName,
      creatorFirstName: rating.creatorId?.firstName,
      creatorLastName: rating.creatorId?.lastName,
      roomName: rating.roomId?.name,
      roomDescription: rating.roomId?.description,
    };
  }
}
