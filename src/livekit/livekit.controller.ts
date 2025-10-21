import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema as MongooseSchema, Types } from 'mongoose';
import { LivekitSession, LivekitSessionDocument } from './session.schema';
import { LivekitRoom, LivekitRoomDocument } from './room.schema';
import { User, UserDocument } from '../users/shemas/user.schema';
import { Rating, RatingDocument } from './schemas/rating.schema';
import { MeetingPurchase, MeetingPurchaseDocument } from './schemas/meeting-purchase.schema';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { LivekitService } from './livekit.service';
import { RatingService } from './rating.service';
import { NotificationService } from '../notification/notification.service';

import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomResponseDto, RoomPurchasersResponseDto } from './dto/room-response.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { SessionHistoryResponseDto, SessionHistoryQueryDto, SessionHistoryFiltersDto } from './dto/session-history.dto';
import { DiscoverSessionsQueryDto, DiscoverSessionsResponseDto } from './dto/discover-sessions.dto';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RatingResponseDto } from './dto/rating-response.dto';

@ApiTags('LiveKit')
@Controller('livekit')
export class LivekitController {
  constructor(
    @InjectModel(LivekitSession.name)
    private readonly sessionModel: Model<LivekitSessionDocument>,
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoomDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,
    @InjectModel(MeetingPurchase.name)
    private readonly meetingPurchaseModel: Model<MeetingPurchaseDocument>,
    private readonly livekitService: LivekitService,
    private readonly ratingService: RatingService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Discover and filter sessions',
    description: 'Get a paginated list of sessions with advanced filtering, sorting, and search capabilities.',
  })
  @ApiQuery({ type: DiscoverSessionsQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Sessions discovered successfully',
    type: DiscoverSessionsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid query parameters' })
  @UseGuards(JwtAuthGuard)
  @Get('sessions/discover')
  async discoverSessions(
    @Query() query: DiscoverSessionsQueryDto,
    @Req() req,
  ): Promise<DiscoverSessionsResponseDto> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User ID not found in JWT payload',
        HttpStatus.UNAUTHORIZED,
      );
    }
    try {
      return await this.livekitService.discoverSessions(query, userId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to discover sessions: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getLiveKitClient(): RoomServiceClient | null {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    
    console.log('LiveKit config check:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      hasUrl: !!livekitUrl,
      url: livekitUrl,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiSecretLength: apiSecret ? apiSecret.length : 0
    });
    
    if (!apiKey || !apiSecret || !livekitUrl) {
      console.warn('LiveKit configuration missing - falling back to session data');
      console.warn('Missing environment variables:', {
        LIVEKIT_API_KEY: !apiKey ? 'MISSING' : 'PRESENT',
        LIVEKIT_API_SECRET: !apiSecret ? 'MISSING' : 'PRESENT',
        LIVEKIT_URL: !livekitUrl ? 'MISSING' : 'PRESENT'
      });
      return null;
    }
    
    try {
      const client = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
      console.log('LiveKit client created successfully');
      return client;
    } catch (error) {
      console.error('Failed to create LiveKit client:', error);
      return null;
    }
  }

  private async ensureRoomExists(livekitClient: RoomServiceClient, roomName: string, roomDisplayName: string): Promise<void> {
    try {
      // Try to list participants - if room doesn't exist, this will throw 404
      await livekitClient.listParticipants(roomName);
    } catch (error: any) {
      if (error.status === 404) {
        // Room doesn't exist, create it
        try {
          await livekitClient.createRoom({
            name: roomName,
            metadata: JSON.stringify({
              displayName: roomDisplayName,
              createdAt: new Date().toISOString()
            })
          });
        } catch (createError: any) {
          throw createError;
        }
      } else {
        throw error;
      }
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Get LiveKit access token for a room using secret ID (JWT required)',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiQuery({ name: 'secretId', required: true, description: 'Room secret ID' })
  @ApiResponse({
    status: 200,
    description: 'LiveKit access token',
    type: Object,
    examples: {
      default: {
        summary: 'Example response',
        value: { token: '...' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Room not found or inactive' })
  @ApiBadRequestResponse({ description: 'Missing or invalid secretId.' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @UseGuards(JwtAuthGuard)
  @Get('token')
  async getToken(
    @Req() req,
    @Query('secretId') secretId: string,
  ): Promise<{ token: string }> {
    if (!secretId || typeof secretId !== 'string') {
      throw new Error('Missing or invalid secretId.');
    }
    try {
      // req.user comes from JwtStrategy: { sub, email, role }
      const userId = req.user?.sub;
      if (!userId) {
        throw new HttpException(
          "User ID not found in JWT payload",
          HttpStatus.UNAUTHORIZED,
        );
      }
      const user = await this.userModel
        .findById(userId)
        .select('username firstName lastName email avatar');
      if (!user) {
        throw new HttpException("User not found", HttpStatus.UNAUTHORIZED);
      }
      // Find room by secret ID
      if (!secretId) {
        throw new HttpException("secretId is required", HttpStatus.BAD_REQUEST);
      }
      let roomDocument;
      try {
        roomDocument =
          await this.livekitService.findRoomBySecretIdInternal(secretId, userId);
      } catch (err) {
        if (err instanceof HttpException) throw err;
        throw new HttpException(
          "Room not found or inactive",
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if user is creator or invited
      const isCreator = roomDocument.createdBy._id.toString() === userId.toString();
      
      console.log('🔍 Creator check:', {
        roomId: roomDocument._id,
        isPrivate: roomDocument.isPrivate,
        creatorId: roomDocument.createdBy._id.toString(),
        userId: userId.toString(),
        isCreator: isCreator,
        invitedUsers: roomDocument.invitedUsers.map(id => id.toString())
      });
      
      if (
        roomDocument.isPrivate &&
        !isCreator &&
        !roomDocument.invitedUsers.some(
          (invitedUserId: Types.ObjectId) => invitedUserId.toString() === userId, // Corrected: comparing ObjectId directly
        )
      ) {
        console.log('❌ Access denied - not creator and not invited');
        throw new HttpException(
          "You are not invited to this room",
          HttpStatus.FORBIDDEN,
        );
      }
      
      console.log('✅ Access granted - creator or invited');

      // Check participant limit
      console.log(`[getToken] User ${userId} (creator: ${isCreator}) attempting to join room ${roomDocument._id}. Max participants: ${roomDocument.maxParticipants}`);

      if (!isCreator && roomDocument.maxParticipants > 0) {
        const livekitClient = this.getLiveKitClient();
        if (livekitClient) {
          try {
            const livekitRoomName = roomDocument.secretId; // Use secretId for LiveKit room identifier
            const participants = await livekitClient.listParticipants(livekitRoomName);
            const currentParticipants = participants?.length || 0;
            console.log(`[getToken] LiveKit real-time participants for room ${livekitRoomName}: ${currentParticipants}`);

            if (currentParticipants >= roomDocument.maxParticipants) {
              console.warn(`[getToken] Room ${roomDocument._id} is full (LiveKit: ${currentParticipants}/${roomDocument.maxParticipants}). Denying access to non-creator.`);
              throw new HttpException(
                "Room has reached its maximum participant limit.",
                HttpStatus.FORBIDDEN,
              );
            }
            console.log(`[getToken] Room ${roomDocument._id} has space (LiveKit: ${currentParticipants}/${roomDocument.maxParticipants}). Allowing access.`);
          } catch (livekitError) {
            console.warn('[getToken] Could not fetch real-time participant count from LiveKit, falling back to database session data:', livekitError);
            const session = await this.sessionModel.findOne({ roomId: roomDocument._id });
            const currentParticipants = session ? session.participants.filter(p => p.isActive).length : 0;
            console.log(`[getToken] Database session active participants for room ${roomDocument._id}: ${currentParticipants}`);

            if (currentParticipants >= roomDocument.maxParticipants) {
              console.warn(`[getToken] Room ${roomDocument._id} is full (DB: ${currentParticipants}/${roomDocument.maxParticipants}). Denying access to non-creator.`);
              throw new HttpException(
                "Room has reached its maximum participant limit.",
                HttpStatus.FORBIDDEN,
              );
            }
            console.log(`[getToken] Room ${roomDocument._id} has space (DB: ${currentParticipants}/${roomDocument.maxParticipants}). Allowing access.`);
          }
        } else {
          // LiveKit client not configured, rely solely on database session data
          console.warn('[getToken] LiveKit client not configured, relying solely on database session data for participant limit check.');
          const session = await this.sessionModel.findOne({ roomId: roomDocument._id });
          const currentParticipants = session ? session.participants.filter(p => p.isActive).length : 0;
          console.log(`[getToken] Database session active participants for room ${roomDocument._id}: ${currentParticipants}`);

          if (currentParticipants >= roomDocument.maxParticipants) {
            console.warn(`[getToken] Room ${roomDocument._id} is full (DB: ${currentParticipants}/${roomDocument.maxParticipants}, LiveKit not configured). Denying access to non-creator.`);
            throw new HttpException(
              "Room has reached its maximum participant limit.",
              HttpStatus.FORBIDDEN,
            );
          }
          console.log(`[getToken] Room ${roomDocument._id} has space (DB: ${currentParticipants}/${roomDocument.maxParticipants}, LiveKit not configured). Allowing access.`);
        }
      }

      // Check if room is scheduled and not yet accessible
      if (roomDocument.scheduledStartTime) {
        const now = new Date();
        if (now < roomDocument.scheduledStartTime) {
          const timeUntilStart = roomDocument.scheduledStartTime.getTime() - now.getTime();
          const days = Math.floor(timeUntilStart / (1000 * 60 * 60 * 24));
          const hours = Math.floor((timeUntilStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.ceil((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
          
          let timeMessage: string;
          if (days > 0) {
            timeMessage = `${days} day(s), ${hours} hour(s), ${minutes} minute(s)`;
          } else if (hours > 0) {
            timeMessage = `${hours} hour(s), ${minutes} minute(s)`;
          } else {
            timeMessage = `${minutes} minute(s)`;
          }
          
          throw new HttpException(
            `This session is scheduled to start in ${timeMessage}. Please wait until ${roomDocument.scheduledStartTime.toLocaleString()} to join.`,
            HttpStatus.FORBIDDEN
          );
        }
      }

      const roomName = roomDocument.name;
      // Use secretId for private rooms, MongoDB ID for public rooms
      const livekitRoomName = roomDocument.secretId; // Use secretId for LiveKit room identifier
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        throw new HttpException(
          "LiveKit API key/secret not set in environment variables",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Ensure room exists on LiveKit server
      const livekitClient = this.getLiveKitClient();
      if (livekitClient) {
        await this.ensureRoomExists(livekitClient, livekitRoomName, roomName);
      }

      // Store or update session in DB
      let session = await this.sessionModel.findOne({ room: livekitRoomName });
      if (!session) {
        session = new this.sessionModel({
          room: livekitRoomName,
          roomId: roomDocument?._id,
          participants: [],
        });
      }
      
      // Check if this is the first participant joining (session just started)
      const isFirstParticipant = session.participants.length === 0;
      
      // Check if user is already in this session
      const existingParticipant = session.participants.find(
        (p) => p.userId.toString() === userId.toString(),
      );
      
      if (!existingParticipant) {
        // New participant - add them
        session.participants.push({
          userId: new Types.ObjectId(userId),
          username: user.username,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          avatar: user.avatar || '',
          joinedAt: new Date(),
          isActive: true,
        });
        
        // If this is the first participant, set the actual start time for the room
        if (isFirstParticipant) {
          await this.roomModel.findByIdAndUpdate(roomDocument._id, {
            actualStartTime: new Date()
          });
        }
      } else if (!existingParticipant.isActive) {
        // Participant rejoining - update their status
        existingParticipant.isActive = true;
        existingParticipant.joinedAt = new Date(); // Update join time
        existingParticipant.leftAt = undefined; // Clear previous leave time
      }
      await session.save();
      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId.toString(),
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username, // Use full name if available
        metadata: JSON.stringify({
          username: user.username,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          avatar: user.avatar || '',
          displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
        })
      });
      at.addGrant({
        roomJoin: true,
        room: livekitRoomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      let token: string;
      try {
        token = await at.toJwt();
      } catch (err) {
        throw new HttpException(
          "Failed to generate LiveKit token",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (typeof token !== 'string') {
        throw new HttpException(
          "Failed to generate LiveKit token",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return { token };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get LiveKit access token for any room by room ID',
    description:
      'Get access token for any room (public or private). For private rooms, user must be invited.',
  })
  @ApiQuery({ name: 'roomId', required: true, description: 'Room MongoDB ID' })
  @ApiResponse({
    status: 200,
    description: 'LiveKit access token',
    type: Object,
    examples: {
      default: {
        summary: 'Example response',
        value: { token: '...' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Room not found or inactive' })
  @ApiBadRequestResponse({ description: 'Missing or invalid roomId.' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @UseGuards(JwtAuthGuard)
  @Get('token/room')
  async getRoomToken(
    @Req() req,
    @Query('roomId') roomId: string,
  ): Promise<{ token: string }> {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Missing or invalid roomId.');
    }
    try {
      // req.user comes from JwtStrategy: { sub, email, role }
      const userId = req.user?.sub;
      if (!userId) {
        throw new HttpException(
          'User ID not found in JWT payload',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const user = await this.userModel
        .findById(userId)
        .select('username firstName lastName email avatar');
      if (!user) {
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      
      // Find room by ID
      let roomDocument;
      try {
        roomDocument = await this.roomModel.findById(roomId)
          .populate('createdBy', 'username firstName lastName email avatar');
      } catch (err) {
        throw new HttpException(
          'Room not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (!roomDocument) {
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

      if (!roomDocument.isActive) {
        throw new HttpException('Room is not active', HttpStatus.NOT_FOUND);
      }

      // Check if user is creator or invited for private rooms
      const isCreator = roomDocument.createdBy._id.toString() === userId.toString();
      
      if (roomDocument.isPrivate) {
        const isInvited = roomDocument.invitedUsers.some(
          (id) => id.toString() === userId
        );
        if (!isCreator && !isInvited) {
          throw new HttpException(
            'You are not invited to this private room',
            HttpStatus.FORBIDDEN,
          );
        }
      }

      // Check participant limit
      console.log(`[getRoomToken] User ${userId} (creator: ${isCreator}) attempting to join room ${roomDocument._id}. Max participants: ${roomDocument.maxParticipants}`);

      if (!isCreator && roomDocument.maxParticipants > 0) {
        const livekitClient = this.getLiveKitClient();
        if (livekitClient) {
          try {
            const livekitRoomName = roomDocument.isPrivate 
              ? roomDocument.secretId 
              : roomDocument._id.toString();
            const participants = await livekitClient.listParticipants(livekitRoomName);
            const currentParticipants = participants?.length || 0;
            console.log(`[getRoomToken] LiveKit real-time participants for room ${livekitRoomName}: ${currentParticipants}`);

            if (currentParticipants >= roomDocument.maxParticipants) {
              console.warn(`[getRoomToken] Room ${roomDocument._id} is full (LiveKit: ${currentParticipants}/${roomDocument.maxParticipants}). Denying access to non-creator.`);
              throw new HttpException(
                "Room has reached its maximum participant limit.",
                HttpStatus.FORBIDDEN,
              );
            }
            console.log(`[getRoomToken] Room ${roomDocument._id} has space (LiveKit: ${currentParticipants}/${roomDocument.maxParticipants}). Allowing access.`);
          } catch (livekitError) {
            console.warn('[getRoomToken] Could not fetch real-time participant count from LiveKit, falling back to database session data:', livekitError);
            const session = await this.sessionModel.findOne({ roomId: roomDocument._id });
            const currentParticipants = session ? session.participants.filter(p => p.isActive).length : 0;
            console.log(`[getRoomToken] Database session active participants for room ${roomDocument._id}: ${currentParticipants}`);

            if (currentParticipants >= roomDocument.maxParticipants) {
              console.warn(`[getRoomToken] Room ${roomDocument._id} is full (DB: ${currentParticipants}/${roomDocument.maxParticipants}). Denying access to non-creator.`);
              throw new HttpException(
                "Room has reached its maximum participant limit.",
                HttpStatus.FORBIDDEN,
              );
            }
            console.log(`[getRoomToken] Room ${roomDocument._id} has space (DB: ${currentParticipants}/${roomDocument.maxParticipants}). Allowing access.`);
          }
        } else {
          // LiveKit client not configured, rely solely on database session data
          console.warn('[getRoomToken] LiveKit client not configured, relying solely on database session data for participant limit check.');
          const session = await this.sessionModel.findOne({ roomId: roomDocument._id });
          const currentParticipants = session ? session.participants.filter(p => p.isActive).length : 0;
          console.log(`[getRoomToken] Database session active participants for room ${roomDocument._id}: ${currentParticipants}`);

          if (currentParticipants >= roomDocument.maxParticipants) {
            console.warn(`[getRoomToken] Room ${roomDocument._id} is full (DB: ${currentParticipants}/${roomDocument.maxParticipants}, LiveKit not configured). Denying access to non-creator.`);
            throw new HttpException(
              "Room has reached its maximum participant limit.",
              HttpStatus.FORBIDDEN,
            );
          }
          console.log(`[getRoomToken] Room ${roomDocument._id} has space (DB: ${currentParticipants}/${roomDocument.maxParticipants}, LiveKit not configured). Allowing access.`);
        }
      }

      // Check if room is scheduled and not yet accessible
      if (roomDocument.scheduledStartTime) {
        const now = new Date();
        if (now < roomDocument.scheduledStartTime) {
          const timeUntilStart = roomDocument.scheduledStartTime.getTime() - now.getTime();
          const days = Math.floor(timeUntilStart / (1000 * 60 * 60 * 24));
          const hours = Math.floor((timeUntilStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.ceil((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
          
          let timeMessage: string;
          if (days > 0) {
            timeMessage = `${days} day(s), ${hours} hour(s), ${minutes} minute(s)`;
          } else if (hours > 0) {
            timeMessage = `${hours} hour(s), ${minutes} minute(s)`;
          } else {
            timeMessage = `${minutes} minute(s)`;
          }
          
          throw new HttpException(
            `This session is scheduled to start in ${timeMessage}. Please wait until ${roomDocument.scheduledStartTime.toLocaleString()} to join.`,
            HttpStatus.FORBIDDEN
          );
        }
      }

      const roomName = roomDocument.name;
      // Use secretId for private rooms, MongoDB ID for public rooms
      const livekitRoomName = roomDocument.isPrivate 
        ? roomDocument.secretId 
        : roomDocument._id.toString();
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        throw new HttpException(
          'LiveKit API key/secret not set in environment variables',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Ensure room exists on LiveKit server
      const livekitClient = this.getLiveKitClient();
      if (livekitClient) {
        await this.ensureRoomExists(livekitClient, livekitRoomName, roomName);
      }
      
      // Store or update session in DB
      let session = await this.sessionModel.findOne({ room: livekitRoomName });
      if (!session) {
        session = new this.sessionModel({
          room: livekitRoomName,
          roomId: roomDocument?._id,
          participants: [],
        });
      }
      
      // Check if this is the first participant joining (session just started)
      const isFirstParticipant = session.participants.length === 0;
      
      // Check if user is already in this session
      const existingParticipant = session.participants.find(
        (p) => p.userId.toString() === userId.toString(),
      );
      
      if (!existingParticipant) {
        // New participant - add them
        session.participants.push({
          userId: new Types.ObjectId(userId),
          username: user.username,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          avatar: user.avatar || '',
          joinedAt: new Date(),
          isActive: true,
        });
        
        // If this is the first participant, set the actual start time for the room
        if (isFirstParticipant) {
          await this.roomModel.findByIdAndUpdate(roomDocument._id, {
            actualStartTime: new Date()
          });
        }
      } else if (!existingParticipant.isActive) {
        // Participant rejoining - update their status
        existingParticipant.isActive = true;
        existingParticipant.joinedAt = new Date(); // Update join time
        existingParticipant.leftAt = undefined; // Clear previous leave time
        

      }
      await session.save();
      
      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId.toString(),
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username, // Use full name if available
        metadata: JSON.stringify({
          username: user.username,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          avatar: user.avatar || '',
          displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
        })
      });
      at.addGrant({
        roomJoin: true,
        room: livekitRoomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        // إعدادات محسنة للـ screen sharing بجودة FHD
        // Note: Video quality settings are handled on the client side
      });
      
      let token: string;
      try {
        token = await at.toJwt();
      } catch (err) {
        throw new HttpException(
          'Failed to generate LiveKit token',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (typeof token !== 'string') {
        throw new HttpException(
          'Failed to generate LiveKit token',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return { token };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error.message || 'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new room',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiBody({ type: CreateRoomDto })
  @ApiResponse({
    status: 201,
    description: 'Room created successfully',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Post('rooms')
  async createRoom(@Body() createRoomDto: CreateRoomDto, @Req() req) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new HttpException(
          'User ID not found in JWT payload',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return await this.livekitService.createRoom(createRoomDto, userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to create room: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all rooms',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all rooms',
    type: [RoomResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms')
  async getAllRooms() {
    return await this.livekitService.findAllRooms();
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get public rooms',
    description:
      'Get a list of all active public rooms that can be joined without invitation.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of public rooms',
    type: [RoomResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/public')
  async getPublicRooms(@Req() req) {
    try {
      // Add request tracking to identify the source
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const timestamp = new Date().toISOString();
      
      // Only log every 10th request to reduce spam
      if (Math.random() < 0.1) {
        console.log(`[${timestamp}] Public rooms requested by: ${userAgent.substring(0, 100)}`);
      }
      
      const rooms = await this.livekitService.findPublicRooms();
      return rooms;
    } catch (error) {
      throw new HttpException(
        `Failed to get public rooms: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my session history',
    description: 'Get information about all sessions you have participated in (both created and joined). Includes room name, description, and participation details.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (starts from 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items per page', example: 10 })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by session status', enum: ['active', 'ended', 'cancelled', 'all'], example: 'all' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by room type', enum: ['public', 'private', 'all'], example: 'all' })
  @ApiQuery({ name: 'paymentStatus', required: false, description: 'Filter by payment status', enum: ['paid', 'free', 'all'], example: 'all' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in room name and description', example: 'coding session' })
  @ApiResponse({ status: 200, description: 'My session history', type: SessionHistoryResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/my-session-history')
  async getMySessionHistory(
    @Req() req,
    @Query() query: SessionHistoryQueryDto
  ) {
    try {
      // Validate and sanitize query parameters
      const page = Math.max(1, parseInt(query.page?.toString() || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit?.toString() || '10', 10)));
      const status = query.status || 'all';
      const type = query.type || 'all';
      const paymentStatus = query.paymentStatus || 'all';
      const search = query.search?.trim();
      
      const userId = req.user?.sub;
      if (!userId) {
        throw new UnauthorizedException('User ID not found in JWT payload');
      }

      // Build room query with filters
      const roomQuery: any = {
        $or: [
          // Rooms where user participated
          { _id: { $in: await this.getUserParticipatedRoomIds(userId) } },
          // Rooms purchased by user (including cancelled ones)
          { _id: { $in: await this.getUserPurchasedRoomIds(userId) } },
          // Rooms created by user (only for cancelled/ended sessions)
          { 
            createdBy: new Types.ObjectId(userId),
            $or: [
              { cancelledAt: { $exists: true } }, // Cancelled rooms
              { endedDate: { $exists: true } }   // Ended rooms
            ]
          }
        ]
      };

      // Apply status filter
      if (status === 'active') {
        roomQuery.isActive = true;
        roomQuery.cancelledAt = { $exists: false };
      } else if (status === 'ended') {
        roomQuery.endedDate = { $exists: true };
        roomQuery.cancelledAt = { $exists: false };
      } else if (status === 'cancelled') {
        roomQuery.cancelledAt = { $exists: true };
      } else if (status === 'all') {
        // For 'all' status, don't filter by cancelledAt - show all rooms
        // No additional filter needed
      }

      // Apply type filter
      if (type === 'public') {
        roomQuery.isPrivate = false;
      } else if (type === 'private') {
        roomQuery.isPrivate = true;
      }

      // Apply payment status filter
      if (paymentStatus === 'paid') {
        roomQuery.isPaid = true;
      } else if (paymentStatus === 'free') {
        roomQuery.$or = [
          { isPaid: false },
          { isPaid: { $exists: false } }
        ];
      }

      // Get all rooms matching the filters
      let allRooms = await this.roomModel.find(roomQuery)
        .populate('createdBy', 'username firstName lastName email avatar')
        .select('name description isPrivate isActive isPaid price currency createdBy createdAt updatedAt endedDate cancelledAt cancellationReason')
        .sort({ updatedAt: -1 })
        .lean();

      // Apply search filter if provided
      if (search && search.length > 0) {
        const searchRegex = new RegExp(search, 'i'); // Case-insensitive search
        allRooms = allRooms.filter(room => 
          searchRegex.test(room.name) || 
          searchRegex.test(room.description)
        );
      }

      if (allRooms.length === 0) {
        return {
          mySessionHistory: [],
          totalRooms: 0,
          activeRooms: 0,
          endedRooms: 0,
          cancelledRooms: 0,
          message: 'No session history found',
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          },
          filters: await this.calculateSessionHistoryFilters(userId)
        };
      }

      // Get user participation data for all rooms
      const mySessions = await this.sessionModel.find({
        'participants.userId': new Types.ObjectId(userId)
      });

      // Get user purchases for all rooms
      const myPurchases = await this.meetingPurchaseModel.find({
        userId: new Types.ObjectId(userId),
        status: 'completed'
      });

      // Map rooms to session history format with participation details
      const sessionHistory = await Promise.all(allRooms.map(async (room) => {
        try {
          // Get user's participation details from this room
          const roomSessions = mySessions.filter(session => 
            session.roomId && session.roomId.toString() === room._id.toString()
          );

          const userParticipations = roomSessions.flatMap(session => 
            session.participants.filter(p => p.userId.toString() === userId)
          );

          // Get user's purchase for this room
          const userPurchase = myPurchases.find(purchase => 
            purchase.roomId && purchase.roomId.toString() === room._id.toString()
          );

          // Calculate total time spent in this room
          const totalTimeSpent = userParticipations.reduce((total, participation) => {
            try {
              const joinedAt = participation.joinedAt;
              let leftAt: Date;
              
              if (participation.isActive && room.isActive) {
                leftAt = new Date(); // Still in session
              } else if (participation.leftAt) {
                leftAt = participation.leftAt; // Participant left
              } else if (room.endedDate) {
                leftAt = room.endedDate; // Room ended
              } else if (room.cancelledAt) {
                leftAt = room.cancelledAt; // Room cancelled
              } else {
                leftAt = room.updatedAt || new Date(); // Fallback
              }
              
              const timeSpent = leftAt.getTime() - joinedAt.getTime();
              return total + Math.max(0, timeSpent); // Ensure non-negative
            } catch (timeError) {
              return total;
            }
          }, 0);

          // Determine room status
          let roomStatus = 'Active';
          if (room.cancelledAt) {
            roomStatus = 'Cancelled';
          } else if (room.endedDate) {
            roomStatus = 'Ended';
          } else if (!room.isActive) {
            roomStatus = 'Inactive';
          }

          // Get rating data for this room
          const ratingData = await this.getRoomRatingData(room._id.toString(), userId);

          return {
            roomId: room._id,
            roomName: room.name,
            roomDescription: room.description,
            isPrivate: room.isPrivate,
            isActive: room.isActive,
            isPaid: room.isPaid || false,
            price: room.price || 0,
            currency: room.currency || 'USD',
            createdBy: room.createdBy,
            createdAt: room.createdAt || new Date(),
            endedAt: room.endedDate || null,
            cancelledAt: room.cancelledAt || null,
            cancellationReason: room.cancellationReason || null,
            duration: room.endedDate ? 
              (room.endedDate.getTime() - (room.createdAt || new Date()).getTime()) : 
              (room.cancelledAt ? 
                (room.cancelledAt.getTime() - (room.createdAt || new Date()).getTime()) : 
                null),
            totalTimeSpent: totalTimeSpent,
            joinCount: userParticipations.length,
            activeParticipations: userParticipations.filter(p => p.isActive).length,
            lastJoined: userParticipations.length > 0 ? 
              new Date(Math.max(...userParticipations.map(p => p.joinedAt.getTime()))) : 
              null,
            status: roomStatus,
            note: this.getSessionHistoryNote(userParticipations.length, userPurchase, room.createdBy.toString() === userId),
            averageRating: ratingData.averageRating,
            ratingCount: ratingData.ratingCount,
            userRating: ratingData.userRating,
            isUserRated: ratingData.isUserRated
          };
        } catch (roomError) {
          console.error(`Error processing room ${room._id}:`, roomError);
          return {
            roomId: room._id,
            roomName: room.name || 'Unknown',
            roomDescription: room.description || 'No description available',
            isPrivate: room.isPrivate || false,
            isActive: room.isActive || false,
            isPaid: room.isPaid || false,
            price: room.price || 0,
            currency: room.currency || 'USD',
            createdBy: room.createdBy || { username: 'Unknown', email: 'Unknown' },
            createdAt: room.createdAt || new Date(),
            endedAt: null,
            cancelledAt: null,
            cancellationReason: null,
            duration: null,
            totalTimeSpent: 0,
            joinCount: 0,
            activeParticipations: 0,
            lastJoined: null,
            status: 'Error',
            error: 'Failed to process room data',
            averageRating: undefined,
            ratingCount: 0,
            userRating: undefined,
            isUserRated: false
          };
        }
      }));

      // Apply pagination
      const total = sessionHistory.length;
      const totalPages = Math.ceil(total / limit);
      const skip = (page - 1) * limit;
      const paginatedHistory = sessionHistory.slice(skip, skip + limit);

      // Calculate statistics
      const activeRooms = sessionHistory.filter(room => room.status === 'Active').length;
      const endedRooms = sessionHistory.filter(room => room.status === 'Ended').length;
      const cancelledRooms = sessionHistory.filter(room => room.status === 'Cancelled').length;

      return {
        mySessionHistory: paginatedHistory,
        totalRooms: total,
        activeRooms,
        endedRooms,
        cancelledRooms,
        message: 'Your session history retrieved successfully',
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: await this.calculateSessionHistoryFilters(userId)
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get session history: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get room by ID',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({ status: 200, description: 'Room details', type: RoomResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:id')
  async getRoomById(@Param('id') id: string) {
    return await this.livekitService.findRoomById(id);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get room purchasers (creator only)',
    description: 'Get detailed list of all purchasers for a room with pagination. Only the room creator can access this information.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of purchasers per page (default: 10, max: 100)', type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Room purchasers retrieved successfully', type: RoomPurchasersResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only room creator can view purchasers' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:id/purchasers')
  async getRoomPurchasers(
    @Param('id') id: string, 
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in JWT payload');
    }
    return await this.livekitService.getRoomPurchasers(id, userId, page, limit);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update room',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiBody({ type: UpdateRoomDto })
  @ApiResponse({
    status: 200,
    description: 'Room updated successfully',
    type: RoomResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only room creator can update',
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Put('rooms/:id')
  async updateRoom(
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
    @Req() req,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in JWT payload');
    }
    const result = await this.livekitService.updateRoom(id, updateRoomDto, userId);

    // إذا كان النتيجة رسالة نجاح (يعني تم الإلغاء)، أرجعها كما هي
    if (typeof result === 'object' && 'message' in result) {
      return result;
    }

    // غير ذلك، أرجع الغرفة المحدثة
    return result;
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel room',
    description: 'Cancel a room and refund all participants if applicable. Only the room creator can cancel.',
  })
  @ApiResponse({
    status: 200,
    description: 'Room cancelled successfully',
    type: Object,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only room creator can cancel',
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Cannot cancel room with completed purchases without refund',
  })
  @UseGuards(JwtAuthGuard)
  @Put('rooms/:id/cancel')
  async cancelRoom(
    @Param('id') id: string,
    @Req() req,
    @Body() cancelData: { cancellationReason?: string }
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in JWT payload');
    }
    await this.livekitService.cancelRoom(id, userId, cancelData.cancellationReason);
    return { message: 'Room cancelled successfully' };
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete room',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({
    status: 200,
    description: 'Room deleted successfully',
    type: Object,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only room creator can delete',
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Delete('rooms/:id')
  async deleteRoom(@Param('id') id: string, @Req() req) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in JWT payload');
    }
    await this.livekitService.deleteRoom(id, userId);
    return { message: 'Room deleted successfully' };
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get rooms created by current user',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user rooms',
    type: [RoomResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/user/my-rooms')
  async getMyRooms(@Req() req) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in JWT payload');
    }
    return await this.livekitService.findRoomsByUser(userId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get room secret ID (only for room creator)',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({ status: 200, description: 'Room secret ID', type: Object })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Only room creator can access secret ID',
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:id/secret-id')
  async getRoomSecretId(@Param('id') id: string, @Req() req) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in JWT payload');
    }
    return await this.livekitService.getRoomSecretId(id, userId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Join private room by ID',
    description:
      'Join a private room using its MongoDB ID. User must be invited or be the creator, and payment must be made if the room is paid.',
  })
  @ApiResponse({ status: 200, description: 'LiveKit access token and room details', type: Object })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not invited, payment required, or room full' })
  @ApiResponse({ status: 404, description: 'Room not found or inactive' })
  @UseGuards(JwtAuthGuard)
  @Post('rooms/join-private/:roomId')
  async joinPrivateRoom(
    @Param('roomId') roomId: string,
    @Req() req,
  ): Promise<any> { // Change return type to specific DTO later if needed
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User ID not found in JWT payload',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return await this.livekitService.joinPrivateRoom(roomId, userId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Join room by secret ID',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiQuery({ name: 'secretId', required: true, description: 'Room MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Room details', type: RoomResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found or inactive' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/join/:secretId')
  async joinRoomBySecretId(@Param('secretId') secretId: string, @Req() req) {
    const userId = req.user?.sub;
    const user = await this.userModel.findById(userId).select('email');
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }
    const room = await this.livekitService.findRoomBySecretIdInternal(secretId, userId);
    if (
      room.isPrivate &&
      !room.invitedUsers.some((id) => id.toString() === userId)
    ) {
      throw new HttpException(
        'You are not invited to this room',
        HttpStatus.FORBIDDEN,
      );
    }
    
    return await this.livekitService.findRoomBySecretId(secretId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Join any public room by room ID',
    description:
      'Join any public room using its MongoDB room ID. No invitation or special ID required for public rooms.',
  })
  @ApiResponse({ status: 200, description: 'Room details', type: RoomResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Public room not found or inactive' })
  @ApiResponse({ status: 403, description: 'Room is private and requires invitation' })
  @UseGuards(JwtAuthGuard)
  @Post('rooms/join-public/:roomId') // Changed to POST
  async joinPublicRoom(@Param('roomId') roomId: string, @Req() req) {
    const userId = req.user?.sub;
    const user = await this.userModel.findById(userId).select('email');
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }
    
    // For public rooms, no invitation check is needed
    const result = await this.livekitService.joinPublicRoomById(roomId, userId);
    
    return result;
  }



    @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get room participants',
    description: 'Get current participants in a specific room.',
  })
  @ApiResponse({ status: 200, description: 'Room participants', type: Object })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/participants')
  async getRoomParticipants(@Param('roomId') roomId: string) {
    try {
      const room = await this.roomModel.findById(roomId)
        .populate('createdBy', 'username firstName lastName email avatar');
      if (!room) {
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

             // Get real-time participants from LiveKit
       const livekitClient = this.getLiveKitClient();
       // Use secretId for private rooms, MongoDB ID for public rooms
       const livekitRoomName = room.isPrivate && room.secretId
         ? room.secretId 
         : room._id?.toString() || roomId;
      
      if (livekitClient) {
        try {
          // Ensure room exists on LiveKit before checking participants
          try {
            await this.ensureRoomExists(livekitClient, livekitRoomName, room.name);
          } catch (ensureError) {
            console.warn('Failed to ensure room exists, continuing with participant check:', ensureError);
          }
          
          const livekitRoom = await livekitClient.listParticipants(livekitRoomName);
          const participants = livekitRoom || [];
        
          // Get user details for each participant
          const populatedParticipants = await Promise.all(
            participants.map(async (participant) => {
              const user = await this.userModel.findById(participant.identity).select('username firstName lastName email avatar');
              return {
                userId: participant.identity,
                username: user?.username || participant.name || 'Unknown',
                firstName: user?.firstName || '',
                lastName: user?.lastName || '',
                email: user?.email || '',
                avatar: user?.avatar || '',
                joinedAt: new Date(), // LiveKit doesn't provide join time, so use current time
                isConnected: participant.state === 1 // 1 = active, 0 = disconnected
              };
            })
          );

          return {
            roomId: room._id,
            roomName: room.name,
            participants: populatedParticipants,
            participantCount: populatedParticipants.length,
            message: 'Real-time room participants retrieved successfully',
            source: 'LiveKit'
          };
        } catch (livekitError) {
          console.warn('LiveKit error, falling back to session data:', livekitError);
        }
      } else {
        // LiveKit not configured, fallback to session data
  
      }

      // Fallback to session data if LiveKit is not available or fails
      const session = await this.sessionModel.findOne({ roomId: room._id });
      
      if (!session) {
        return {
          roomId: room._id,
          roomName: room.name,
          participants: [],
          participantCount: 0,
          message: 'No active participants found',
          source: 'Database (no LiveKit)'
        };
      }

      const populatedParticipants = await Promise.all(
        session.participants.map(async (participant) => {
          const user = await this.userModel.findById(participant.userId).select('username firstName lastName email avatar');
          return {
            userId: participant.userId,
            username: user?.username || 'Unknown',
            firstName: user?.firstName || '',
            lastName: user?.lastName || '',
            email: user?.email || '',
            avatar: user?.avatar || '',
            joinedAt: participant.joinedAt,
            isConnected: true // Assume connected if we have session data
          };
        })
      );

      return {
        roomId: room._id,
        roomName: room.name,
        participants: populatedParticipants,
        participantCount: populatedParticipants.length,
        message: 'Room participants retrieved from session data (LiveKit unavailable)',
        source: 'Database (no LiveKit)',
        warning: 'This shows historical session data, not real-time participants. To get real-time data, configure LiveKit.'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to get room participants: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get room status',
    description: 'Get room status including participant count and activity.',
  })
  @ApiResponse({ status: 200, description: 'Room status', type: Object })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/status')
  async getRoomStatus(@Param('roomId') roomId: string) {
    try {
      const room = await this.roomModel.findById(roomId)
        .populate('createdBy', 'username firstName lastName email avatar');
      if (!room) {
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

      // Get real-time participant count from LiveKit
      let participantCount = 0;
      let hasActiveSession = false;
      
      try {
        const livekitClient = this.getLiveKitClient();
                 if (livekitClient) {
           // Use secretId for private rooms, MongoDB ID for public rooms
           const livekitRoomName = room.isPrivate && room.secretId
             ? room.secretId 
             : room._id?.toString() || roomId;
           
           // Ensure room exists on LiveKit before checking participants
           try {
             await this.ensureRoomExists(livekitClient, livekitRoomName, room.name);
           } catch (ensureError) {
             console.warn('Failed to ensure room exists, continuing with participant check:', ensureError);
           }
           
           const participants = await livekitClient.listParticipants(livekitRoomName);
           participantCount = participants?.length || 0;
           hasActiveSession = participantCount > 0;
        } else {
          // LiveKit not configured, fallback to session data
          const session = await this.sessionModel.findOne({ roomId: room._id });
          participantCount = session ? session.participants.length : 0;
          hasActiveSession = !!session;
        }
      } catch (livekitError) {
        console.warn('LiveKit error, falling back to session data:', livekitError);
        // Fallback to session data on error
        const session = await this.sessionModel.findOne({ roomId: room._id });
        participantCount = session ? session.participants.length : 0;
        hasActiveSession = !!session;
      }

      const isActive = room.isActive;

      return {
        roomId: room._id,
        roomName: room.name,
        isActive,
        hasActiveSession,
        participantCount,
        maxParticipants: room.maxParticipants,
        isPrivate: room.isPrivate,
        createdAt: room.createdAt,
        lastActivity: new Date().getTime(), // Current time since we're getting real-time data
        message: 'Real-time room status retrieved successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to get room status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get comprehensive room information',
    description: 'Get detailed room information including participants, status, and metadata.',
  })
  @ApiResponse({ status: 200, description: 'Room information', type: Object })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/info')
  async getRoomInfo(@Param('roomId') roomId: string) {
    try {
      const room = await this.roomModel.findById(roomId)
        .populate('createdBy', 'username firstName lastName email avatar')
        .populate('invitedUsers', 'username firstName lastName email avatar');

      if (!room) {
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

      // Get session info for this room
      const session = await this.sessionModel.findOne({ roomId: room._id });
      
      const participantCount = session ? session.participants.length : 0;
      const isActive = room.isActive;
      const hasActiveSession = !!session;

      // Get current participants with details
      let currentParticipants: Array<{
        userId: Types.ObjectId;
        username: string;
        firstName: string;
        lastName: string;
        email: string;
        joinedAt: Date;
      }> = [];
      if (session) {
        currentParticipants = await Promise.all(
          session.participants.map(async (participant) => {
            const user = await this.userModel.findById(participant.userId).select('username firstName lastName email avatar');
            return {
              userId: participant.userId,
              username: user?.username || 'Unknown',
              firstName: user?.firstName || '',
              lastName: user?.lastName || '',
              email: user?.email || '',
              avatar: user?.avatar || '',
              joinedAt: participant.joinedAt
            };
          })
        );
      }

      return {
        roomId: room._id,
        roomName: room.name,
        description: room.description,
        isActive,
        isPrivate: room.isPrivate,
        hasActiveSession,
        participantCount,
        maxParticipants: room.maxParticipants,
        createdBy: room.createdBy,
        invitedUsers: room.invitedUsers,
        currentParticipants,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        lastActivity: session ? Math.max(...session.participants.map(p => p.joinedAt.getTime())) : null,
        message: 'Room information retrieved successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to get room information: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check room accessibility status',
    description: 'Check if a room is accessible based on scheduled time and other conditions.',
  })
  @ApiResponse({ status: 200, description: 'Room accessibility status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/accessibility')
  async checkRoomAccessibility(@Param('roomId') roomId: string) {
    try {
      const room = await this.roomModel.findById(roomId)
        .populate('createdBy', 'username firstName lastName email avatar');
      
      if (!room) {
        throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
      }

      const now = new Date();
      let isAccessible = true;
      let reason = 'Room is accessible';
      let timeUntilAccessible: string | null = null;

      // Check if room is active
      if (!room.isActive) {
        isAccessible = false;
        reason = 'Room is not active';
      }
      // Check if room is scheduled and not yet accessible
      else if (room.scheduledStartTime && now < room.scheduledStartTime) {
        isAccessible = false;
        reason = 'Room is scheduled for a future time';
        
        const timeUntilStart = room.scheduledStartTime.getTime() - now.getTime();
        const days = Math.floor(timeUntilStart / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeUntilStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.ceil((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
          timeUntilAccessible = `${days} day(s), ${hours} hour(s), ${minutes} minute(s)`;
        } else if (hours > 0) {
          timeUntilAccessible = `${hours} hour(s), ${minutes} minute(s)`;
        } else {
          timeUntilAccessible = `${minutes} minute(s)`;
        }
      }

      return {
        roomId: room._id,
        roomName: room.name,
        isAccessible,
        reason,
        scheduledStartTime: room.scheduledStartTime,
        currentTime: now,
        timeUntilAccessible,
        isActive: room.isActive,
        isPrivate: room.isPrivate,
        createdBy: room.createdBy
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to check room accessibility: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }


   @ApiBearerAuth()
   @ApiOperation({
     summary: 'End LiveKit session',
     description: 'Forcefully end a LiveKit session and disconnect all participants. Only room creator can end sessions.',
   })
   @ApiResponse({ status: 200, description: 'Session ended successfully', type: Object })
   @ApiResponse({ status: 401, description: 'Unauthorized' })
   @ApiResponse({ status: 403, description: 'Forbidden - Only room creator can end session' })
   @ApiResponse({ status: 404, description: 'Room not found' })
   @UseGuards(JwtAuthGuard)
   @Post('rooms/:roomId/end-session')
   async endSession(@Param('roomId') roomId: string, @Req() req) {
     try {
       const userId = req.user?.sub;
       if (!userId) {
         throw new HttpException(
           'User ID not found in JWT payload',
           HttpStatus.UNAUTHORIZED,
         );
       }

       // Find the room
       console.log(`Looking up room with ID: ${roomId}`);
       let room;
       try {
         room = await this.roomModel.findById(roomId)
           .populate('createdBy', 'username firstName lastName email avatar');
         if (!room) {
           throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
         }
       } catch (dbError) {
         console.error('Database error when looking up room:', dbError);
         throw new HttpException(
           `Database error when looking up room: ${dbError.message}`,
           HttpStatus.INTERNAL_SERVER_ERROR
         );
       }
       console.log(`Room found: ${room.name}, isActive: ${room.isActive}, createdBy: ${room.createdBy._id}`);
       console.log('Full room status:', {
         _id: room._id,
         name: room.name,
         isActive: room.isActive,
         endedDate: room.endedDate,
         updatedAt: room.updatedAt,
         createdBy: room.createdBy
       });

       // Check if user is the room creator
       console.log(`Permission check - User ID: ${userId}, Room Creator: ${room.createdBy._id}`);
       if (room.createdBy._id.toString() !== userId) {
         console.log('Permission denied - user is not room creator');
         throw new HttpException(
           'Only room creator can end the session',
           HttpStatus.FORBIDDEN,
         );
       }
       console.log('Permission granted - user is room creator');

       // Check if room is active
       console.log(`Room status check - Room ID: ${roomId}, isActive: ${room.isActive}, endedDate: ${room.endedDate}`);
       
       // Additional debugging - check if room was recently ended
       if (room.endedDate) {
         const timeSinceEnded = Date.now() - new Date(room.endedDate).getTime();
         console.log(`Room ended ${timeSinceEnded}ms ago (${Math.round(timeSinceEnded / 1000)}s)`);
       }
       
       if (!room.isActive) {
         console.log('Room is already inactive - cannot end session again');
         throw new HttpException(
           `Room is already inactive. Room ended at: ${room.endedDate || 'Unknown time'}`, 
           HttpStatus.BAD_REQUEST
         );
       }
       console.log('Room is active - proceeding with session end');

       // Get LiveKit client
       console.log('Checking LiveKit configuration...');
       const livekitClient = this.getLiveKitClient();
       if (!livekitClient) {
         console.error('LiveKit client creation failed - missing API key/secret or URL');
         throw new HttpException(
           'LiveKit not configured - cannot end session. Please check environment variables.',
           HttpStatus.INTERNAL_SERVER_ERROR,
         );
       }
       console.log('LiveKit client created successfully');

       // Determine LiveKit room name
       const livekitRoomName = room.isPrivate && room.secretId
         ? room.secretId 
         : room._id?.toString() || roomId;

       try {
         // Get current participants
         console.log(`Getting participants for LiveKit room: ${livekitRoomName}`);
         let participants: any[] = [];
         try {
           participants = await livekitClient.listParticipants(livekitRoomName);
           console.log(`Found ${participants?.length || 0} participants in LiveKit room`);
         } catch (participantError: any) {
           console.warn(`Failed to get participants from LiveKit: ${participantError.message}`);
           console.warn('Continuing with session end process...');
           participants = [];
         }
         
         // Disconnect all participants
         if (participants && participants.length > 0) {
           console.log(`Disconnecting ${participants.length} participants...`);
           for (const participant of participants) {
             try {
               console.log(`Disconnecting participant: ${participant.identity}`);
               // Use removeParticipant instead of disconnectParticipant
               await livekitClient.removeParticipant(livekitRoomName, participant.identity);
               console.log(`Successfully disconnected participant: ${participant.identity}`);
             } catch (disconnectError: any) {
               console.warn(`Failed to disconnect participant ${participant.identity}:`, disconnectError.message);
               // Participant disconnect failed, continue with others
             }
           }
           console.log('Finished disconnecting participants');
         } else {
           console.log('No participants to disconnect');
         }

         // Update room status in database with ended date
         console.log('Updating room status in database...');
         const endedDate = new Date();
         await this.roomModel.findByIdAndUpdate(roomId, { 
           isActive: false,
           endedDate: endedDate,
           updatedAt: endedDate,
         });
         console.log('Room status updated successfully in database');
         
         // Mark all participants as inactive and set their leave time
         console.log('Updating session participants...');
         const session = await this.sessionModel.findOne({ roomId: room._id });
         if (session) {
           console.log(`Found session with ${session.participants.length} participants`);
           session.participants.forEach(participant => {
             participant.isActive = false;
             participant.leftAt = new Date();
           });
           await session.save();
           console.log('Session participants updated successfully');

           // Send rating request notifications to all participants (except creator)
           try {
             const participants = session.participants.filter(
               p => p.userId.toString() !== room.createdBy._id.toString()
             );

             if (participants.length > 0) {
               const notifications = participants.map(participant => ({
                 toUserId: participant.userId.toString(),
                 fromUserId: room.createdBy._id.toString(),
                 content: `Session "${room.name}" ended, please rate your experience.`,
                 type: 'RATING_REQUESTED' as any,
                 data: {
                   sessionId: (session._id as any).toString(),
                   roomId: (room._id as any).toString(),
                   roomName: room.name,
                   creatorId: room.createdBy._id.toString(),
                   sessionEndedAt: new Date().toISOString(),
                 },
               }));

               try {
                 await this.notificationService.addNotifications(notifications);
                 console.log(`Sent rating requests to ${notifications.length} participants`);
               } catch (notificationError: any) {
                 console.error('Failed to send rating notifications:', notificationError.message);
                 // Don't fail the entire operation if notifications fail
               }
             }
           } catch (ratingError) {
             console.error('Failed to send rating requests:', ratingError);
             // Don't fail the entire operation if rating logic fails
           }
         } else {
           console.log('No session found for this room');
         }

         return {
           success: true,
           roomId: room._id,
           roomName: room.name,
           participantsDisconnected: participants?.length || 0,
           message: 'Session ended successfully. All participants have been disconnected.',
           timestamp: new Date().toISOString()
         };

       } catch (livekitError: any) {
         console.error('LiveKit operation failed:', livekitError);
         console.error('Error details:', {
           message: livekitError.message,
           status: livekitError.status,
           code: livekitError.code,
           stack: livekitError.stack
         });
         
         // Even if LiveKit fails, mark room as inactive in database
         console.log('LiveKit failed, but marking room as inactive in database...');
         const endedDate = new Date();
         await this.roomModel.findByIdAndUpdate(roomId, { 
           isActive: false,
           endedDate: endedDate,
           updatedAt: endedDate,
         });
         
         // Mark all participants as inactive and set their leave time
         const session = await this.sessionModel.findOne({ roomId: room._id });
         if (session) {
           session.participants.forEach(participant => {
             participant.isActive = false;
             participant.leftAt = new Date();
           });
           await session.save();
         }

         // Return success even if LiveKit failed, since we've updated the database
         return {
           success: true,
           roomId: room._id,
           roomName: room.name,
           participantsDisconnected: 0,
           message: 'Session ended successfully in database. LiveKit operations may have failed.',
           timestamp: new Date().toISOString(),
           warning: 'LiveKit operations failed, but session was ended in database'
         };
       }

     } catch (error) {
       if (error instanceof HttpException) throw error;
       
       console.error('Error ending session:', error);
       console.error('Error details:', {
         message: error.message,
         name: error.name,
         stack: error.stack,
         roomId: roomId,
         userId: req.user?.sub
       });
       
       // Check if it's a database connection issue
       if (error.name === 'MongoNetworkError' || error.message.includes('MongoDB')) {
         throw new HttpException(
           'Database connection error. Please try again later.',
           HttpStatus.SERVICE_UNAVAILABLE
         );
       }
       
       // Check if it's an environment variable issue
       if (error.message.includes('LIVEKIT') || error.message.includes('environment')) {
         throw new HttpException(
           'LiveKit configuration error. Please check server configuration.',
           HttpStatus.INTERNAL_SERVER_ERROR
         );
       }
       
       throw new HttpException(
         `Failed to end session: ${error.message}`,
         HttpStatus.INTERNAL_SERVER_ERROR,
       );
     }
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Leave room session',
     description: 'Mark current user as having left the room session.',
   })
   @ApiResponse({ status: 200, description: 'Left room successfully', type: Object })
   @ApiResponse({ status: 401, description: 'Unauthorized' })
   @ApiResponse({ status: 404, description: 'Room not found' })
   @UseGuards(JwtAuthGuard)
   @Post('rooms/:roomId/leave')
   async leaveRoom(@Param('roomId') roomId: string, @Req() req) {
     try {
       const userId = req.user?.sub;
       if (!userId) {
         throw new HttpException(
           'User ID not found in JWT payload',
           HttpStatus.UNAUTHORIZED,
         );
       }

       // Find the room
       const room = await this.roomModel.findById(roomId)
         .populate('createdBy', 'username firstName lastName email avatar');
       if (!room) {
         throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
       }

       // Find the session for this room
       const session = await this.sessionModel.findOne({ roomId: room._id });
       if (!session) {
         throw new HttpException('No active session found for this room', HttpStatus.NOT_FOUND);
       }

       // Find the participant and mark them as inactive
       const participant = session.participants.find(p => p.userId.toString() === userId);
       if (participant) {
         participant.isActive = false;
         participant.leftAt = new Date();
         await session.save();
       }

       return {
         success: true,
         message: 'Left room successfully',
         leftAt: new Date().toISOString()
       };
     } catch (error) {
       if (error instanceof HttpException) throw error;
       console.error('Error leaving room:', error);
       throw new HttpException(
         `Failed to leave room: ${error.message}`,
         HttpStatus.INTERNAL_SERVER_ERROR,
       );
     }
   }



   // Rating endpoints
   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Rate a meeting creator after session ends',
     description: 'Rate the meeting creator based on your experience in the session. Only session participants can rate.',
   })
   @ApiParam({ name: 'sessionId', description: 'ID of the ended session' })
   @ApiBody({ type: CreateRatingDto, description: 'Rating data' })
   @ApiResponse({ status: 201, description: 'Rating created successfully' })
   @ApiResponse({ status: 400, description: 'Bad request - Session still active or already rated' })
   @ApiResponse({ status: 403, description: 'Forbidden - Not a session participant' })
   @ApiResponse({ status: 404, description: 'Session not found' })
   @ApiResponse({ status: 500, description: 'Internal server error' })
   @UseGuards(JwtAuthGuard)
   @Post('ratings/sessions/:sessionId')
   async createRating(
     @Param('sessionId') sessionId: string,
     @Body() createRatingDto: CreateRatingDto,
     @Req() req,
   ) {
     if (!req.user || !req.user.sub) {
       throw new UnauthorizedException('User not authenticated');
     }
     return this.ratingService.createRating(sessionId, req.user.sub, createRatingDto);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get all ratings for a specific session',
     description: 'Retrieve all ratings submitted for a particular session.',
   })
   @ApiParam({ name: 'sessionId', description: 'ID of the session' })
   @ApiResponse({ status: 200, description: 'Session ratings retrieved successfully' })
   @ApiResponse({ status: 404, description: 'Session not found' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/sessions/:sessionId')
   async getSessionRatings(@Param('sessionId') sessionId: string) {
     return this.ratingService.getSessionRatings(sessionId);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get all ratings for a specific creator',
     description: 'Retrieve all ratings submitted for a particular meeting creator.',
   })
   @ApiParam({ name: 'creatorId', description: 'ID of the creator' })
   @ApiResponse({ status: 200, description: 'Creator ratings retrieved successfully' })
   @ApiResponse({ status: 404, description: 'Creator not found' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/creators/:creatorId')
   async getCreatorRatings(@Param('creatorId') creatorId: string) {
     return this.ratingService.getCreatorRatings(creatorId);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get rating summary for a creator',
     description: 'Retrieve aggregated rating statistics for a meeting creator.',
   })
   @ApiParam({ name: 'creatorId', description: 'ID of the creator' })
   @ApiResponse({ status: 200, description: 'Creator rating summary retrieved successfully' })
   @ApiResponse({ status: 404, description: 'No ratings found for this creator' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/creators/:creatorId/summary')
   async getCreatorRatingSummary(@Param('creatorId') creatorId: string) {
     return this.ratingService.getCreatorRatingSummary(creatorId);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get top rated meeting creators',
     description: 'Retrieve a list of the highest-rated meeting creators.',
   })
   @ApiResponse({ status: 200, description: 'Top rated creators retrieved successfully' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/top-rated')
   async getTopRatedCreators(@Query('limit') limit?: number) {
     return this.ratingService.getTopRatedCreators(limit);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get all ratings with pagination',
     description: 'Retrieve all ratings with pagination support, filtering, and search.',
   })
   @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', type: Number })
   @ApiQuery({ name: 'limit', required: false, description: 'Number of ratings per page (default: 10)', type: Number })
   @ApiQuery({ name: 'search', required: false, description: 'Search in room names, comments, or usernames', type: String })
   @ApiQuery({ name: 'rating', required: false, description: 'Filter by specific rating (1-5 or "all")', type: String })
   @ApiQuery({ name: 'sortBy', required: false, description: 'Sort by: newest, oldest, highest, lowest', type: String })
   @ApiResponse({ status: 200, description: 'Ratings retrieved successfully' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings')
   async getAllRatings(
     @Query('page') page: number = 1,
     @Query('limit') limit: number = 10,
     @Query('search') search?: string,
     @Query('rating') rating?: string,
     @Query('sortBy') sortBy?: string,
   ) {
     return this.ratingService.getAllRatings(page, limit, { search, rating, sortBy });
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get ratings submitted by current user',
     description: 'Retrieve all ratings that the current user has submitted to others with filtering and search.',
   })
   @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', type: Number })
   @ApiQuery({ name: 'limit', required: false, description: 'Number of ratings per page (default: 10)', type: Number })
   @ApiQuery({ name: 'search', required: false, description: 'Search in room names, comments, or usernames', type: String })
   @ApiQuery({ name: 'rating', required: false, description: 'Filter by specific rating (1-5 or "all")', type: String })
   @ApiQuery({ name: 'sortBy', required: false, description: 'Sort by: newest, oldest, highest, lowest', type: String })
   @ApiResponse({ status: 200, description: 'User submitted ratings retrieved successfully' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/my-submitted')
   async getMySubmittedRatings(
     @Req() req,
     @Query('page') page?: number,
     @Query('limit') limit?: number,
     @Query('search') search?: string,
     @Query('rating') rating?: string,
     @Query('sortBy') sortBy?: string,
   ) {
     const userId = req.user?.sub;
     if (!userId) {
       throw new HttpException('User ID not found in JWT payload', HttpStatus.UNAUTHORIZED);
     }
     return this.ratingService.getUserSubmittedRatings(userId, page || 1, limit || 10, { search, rating, sortBy });
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get ratings received by current user',
     description: 'Retrieve all ratings that the current user has received from others with filtering and search.',
   })
   @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', type: Number })
   @ApiQuery({ name: 'limit', required: false, description: 'Number of ratings per page (default: 10)', type: Number })
   @ApiQuery({ name: 'search', required: false, description: 'Search in room names, comments, or usernames', type: String })
   @ApiQuery({ name: 'rating', required: false, description: 'Filter by specific rating (1-5 or "all")', type: String })
   @ApiQuery({ name: 'sortBy', required: false, description: 'Sort by: newest, oldest, highest, lowest', type: String })
   @ApiResponse({ status: 200, description: 'User received ratings retrieved successfully' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/my-received')
   async getMyReceivedRatings(
     @Req() req,
     @Query('page') page?: number,
     @Query('limit') limit?: number,
     @Query('search') search?: string,
     @Query('rating') rating?: string,
     @Query('sortBy') sortBy?: string,
   ) {
     const userId = req.user?.sub;
     if (!userId) {
       throw new HttpException('User ID not found in JWT payload', HttpStatus.UNAUTHORIZED);
     }
     return this.ratingService.getUserReceivedRatings(userId, page || 1, limit || 10, { search, rating, sortBy });
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Get rating by ID',
     description: 'Retrieve a specific rating by its ID.',
   })
   @ApiParam({ name: 'ratingId', description: 'ID of the rating to retrieve' })
   @ApiResponse({ status: 200, description: 'Rating retrieved successfully', type: RatingResponseDto })
   @ApiResponse({ status: 404, description: 'Rating not found' })
   @UseGuards(JwtAuthGuard)
   @Get('ratings/:ratingId')
   async getRatingById(@Param('ratingId') ratingId: string) {
     return this.ratingService.getRatingById(ratingId);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Update a rating',
     description: 'Update your own rating. Only the user who created the rating can update it.',
   })
   @ApiParam({ name: 'ratingId', description: 'ID of the rating to update' })
   @ApiResponse({ status: 200, description: 'Rating updated successfully' })
   @ApiResponse({ status: 403, description: 'Forbidden - Can only update your own ratings' })
   @ApiResponse({ status: 404, description: 'Rating not found' })
   @UseGuards(JwtAuthGuard)
   @Put('ratings/:ratingId')
   async updateRating(
     @Param('ratingId') ratingId: string,
     @Body() updateData: any,
     @Req() req,
   ) {
     if (!req.user || !req.user.sub) {
       throw new UnauthorizedException('User not authenticated');
     }
     return this.ratingService.updateRating(ratingId, req.user.sub, updateData);
   }

   @ApiBearerAuth()
   @ApiOperation({
     summary: 'Delete a rating',
     description: 'Delete your own rating. Only the user who created the rating can delete it.',
   })
   @ApiParam({ name: 'ratingId', description: 'ID of the rating to delete' })
   @ApiResponse({ status: 200, description: 'Rating deleted successfully' })
   @ApiResponse({ status: 403, description: 'Forbidden - Can only delete your own ratings' })
   @ApiResponse({ status: 404, description: 'Rating not found' })
   @UseGuards(JwtAuthGuard)
   @Delete('ratings/:ratingId')
   async deleteRating(@Param('ratingId') ratingId: string, @Req() req) {
     if (!req.user || !req.user.sub) {
       throw new UnauthorizedException('User not authenticated');
     }
     return this.ratingService.deleteRating(ratingId, req.user.sub);
   }

   @Get('ratings/users/:userId/received')
   async getUserReceivedRatings(
     @Param('userId') userId: string,
     @Query('page') page?: number,
     @Query('limit') limit?: number,
     @Query('search') search?: string,
     @Query('rating') rating?: string,
     @Query('sortBy') sortBy?: string,
   ) {
     return this.ratingService.getUserReceivedRatings(
       userId,
       page || 1,
       limit || 10,
       { search, rating, sortBy }
     );
   }

  // Helper method to get room IDs where user participated
  private async getUserParticipatedRoomIds(userId: string): Promise<string[]> {
    const mySessions = await this.sessionModel.find({
      'participants.userId': new Types.ObjectId(userId)
    });

    const roomIds = [...new Set(mySessions
      .filter(session => session.roomId)
      .map(session => session.roomId!.toString())
    )];

    return roomIds;
  }

  // Helper method to get room IDs that user purchased
  private async getUserPurchasedRoomIds(userId: string): Promise<string[]> {
    const purchases = await this.meetingPurchaseModel.find({
      userId: new Types.ObjectId(userId),
      status: 'completed'
    });

    const roomIds = [...new Set(purchases
      .filter(purchase => purchase.roomId)
      .map(purchase => (purchase.roomId as Types.ObjectId).toString())
    )];

    return roomIds;
  }

  // Helper method to get appropriate note for session history
  private getSessionHistoryNote(participationCount: number, userPurchase: any, isCreator: boolean): string | undefined {
    if (participationCount > 0) {
      return undefined; // User participated, no special note needed
    }
    
    if (isCreator) {
      return 'Room created by you';
    }
    
    if (userPurchase) {
      if (userPurchase.status === 'completed') {
        return 'Purchased but not joined yet';
      }
      return 'Purchase pending';
    }
    
    return 'No participation or purchase found';
  }

  // Helper method to calculate session history filters
  private async calculateSessionHistoryFilters(userId: string): Promise<SessionHistoryFiltersDto> {
    const userParticipatedRoomIds = await this.getUserParticipatedRoomIds(userId);
    const userPurchasedRoomIds = await this.getUserPurchasedRoomIds(userId);
    
    const baseQuery = {
      $or: [
        { _id: { $in: userParticipatedRoomIds } },
        { _id: { $in: userPurchasedRoomIds } },
        // Rooms created by user (only for cancelled/ended sessions)
        { 
          createdBy: new Types.ObjectId(userId),
          $or: [
            { cancelledAt: { $exists: true } }, // Cancelled rooms
            { endedDate: { $exists: true } }   // Ended rooms
          ]
        }
      ]
    };

    const [
      totalActiveSessions,
      totalEndedSessions,
      totalCancelledSessions,
      totalPublicSessions,
      totalPrivateSessions,
      totalPaidSessions,
      totalFreeSessions
    ] = await Promise.all([
      // Active sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        isActive: true,
        cancelledAt: { $exists: false }
      }),
      
      // Ended sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        endedDate: { $exists: true },
        cancelledAt: { $exists: false }
      }),
      
      // Cancelled sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        cancelledAt: { $exists: true }
      }),
      
      // Public sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        isPrivate: false
      }),
      
      // Private sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        isPrivate: true
      }),
      
      // Paid sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        isPaid: true
      }),
      
      // Free sessions
      this.roomModel.countDocuments({
        ...baseQuery,
        $or: [
          { isPaid: false },
          { isPaid: { $exists: false } }
        ]
      })
    ]);

    return {
      availableStatuses: ['active', 'ended', 'cancelled', 'all'],
      availableTypes: ['public', 'private', 'all'],
      availablePaymentStatuses: ['paid', 'free', 'all'],
      totalActiveSessions,
      totalEndedSessions,
      totalCancelledSessions,
      totalPublicSessions,
      totalPrivateSessions,
      totalPaidSessions,
      totalFreeSessions
    };
  }

  // Helper method to get rating data for a room
  private async getRoomRatingData(roomId: string, userId: string): Promise<{
    averageRating?: number;
    ratingCount: number;
    userRating?: number;
    isUserRated: boolean;
  }> {
    try {
      // Get all ratings for this room
      const ratings = await this.ratingModel.find({ roomId: new Types.ObjectId(roomId) });
      
      if (ratings.length === 0) {
        return {
          ratingCount: 0,
          isUserRated: false
        };
      }

      // Calculate average rating
      const totalRating = ratings.reduce((sum, rating) => sum + rating.overallRating, 0);
      const averageRating = Math.round((totalRating / ratings.length) * 10) / 10; // Round to 1 decimal place

      // Check if current user has rated this room
      const userRating = ratings.find(rating => rating.raterId.toString() === userId);
      const isUserRated = !!userRating;

      return {
        averageRating,
        ratingCount: ratings.length,
        userRating: userRating?.overallRating,
        isUserRated
      };
    } catch (error) {
      console.error(`Error getting rating data for room ${roomId}:`, error);
      return {
        ratingCount: 0,
        isUserRated: false
      };
    }
  }

}
