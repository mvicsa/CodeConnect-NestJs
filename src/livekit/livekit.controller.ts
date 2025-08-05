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
  UseGuards,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessToken } from 'livekit-server-sdk';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema as MongooseSchema, Types } from 'mongoose';
import { LivekitSession, LivekitSessionDocument } from './session.schema';
import { LivekitRoom, LivekitRoomDocument } from './room.schema';
import { User, UserDocument } from '../users/shemas/user.schema';
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
} from '@nestjs/swagger';
import { LivekitService } from './livekit.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

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
    private readonly livekitService: LivekitService,
    private readonly configService: ConfigService,

  ) {}

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
          'User ID not found in JWT payload',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const user = await this.userModel
        .findById(userId)
        .select('username email');
      if (!user) {
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }
      // Find room by secret ID
      if (!secretId) {
        throw new HttpException('secretId is required', HttpStatus.BAD_REQUEST);
      }
      let roomDocument;
      try {
        roomDocument =
          await this.livekitService.findRoomBySecretIdInternal(secretId);
      } catch (err) {
        if (err instanceof HttpException) throw err;
        throw new HttpException(
          'Room not found or inactive',
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if user is invited
      if (
        roomDocument.isPrivate &&
        !roomDocument.invitedUsers.some(
          (user) => user._id.toString() === userId,
        )
      ) {
        throw new HttpException(
          'You are not invited to this room',
          HttpStatus.FORBIDDEN,
        );
      }

      const roomName = roomDocument.name;
      const livekitRoomName = roomDocument.secretId; // Use secretId for LiveKit room identifier
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      if (!apiKey || !apiSecret) {
        throw new HttpException(
          'LiveKit API key/secret not set in environment variables',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
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
      // Add participant if not already present
      if (
        !session.participants.some(
          (p) => p.userId.toString() === userId.toString(),
        )
      ) {
        session.participants.push({
          userId: new Types.ObjectId(userId),
          username: user.username,
          joinedAt: new Date(),
        });
      }
      await session.save();
      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId.toString(),
        name: user.username,
      });
      at.addGrant({
        roomJoin: true,
        room: livekitRoomName,
        canPublish: true,
        canSubscribe: true,
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
      console.log('Creating room:', createRoomDto);
      const userId = req.user?.sub;
      if (!userId) {
        throw new HttpException(
          'User ID not found in JWT payload',
          HttpStatus.UNAUTHORIZED,
        );
      }
      return await this.livekitService.createRoom(createRoomDto, userId);
    } catch (error) {
      throw new HttpException(
        'Failed to create room',
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
      throw new Error('User ID not found in JWT payload');
    }
    return await this.livekitService.updateRoom(id, updateRoomDto, userId);
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
      throw new Error('User ID not found in JWT payload');
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
      throw new Error('User ID not found in JWT payload');
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
      throw new Error('User ID not found in JWT payload');
    }
    return await this.livekitService.getRoomSecretId(id, userId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Join room by secret ID',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
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
    const room = await this.livekitService.findRoomBySecretIdInternal(secretId);
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
}
