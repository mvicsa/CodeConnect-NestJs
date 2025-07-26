import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LivekitRoom, LivekitRoomDocument } from './room.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { generateUniqueSecretId } from './utils/secret-id.util';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from 'src/users/shemas/user.schema';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class LivekitService {
  constructor(
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoomDocument>,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async createRoom(
    createRoomDto: CreateRoomDto,
    userId: string,
  ): Promise<LivekitRoom & { secretId: string }> {
    try {
      const secretIdLength = this.configService.get<number>(
        'LIVEKIT_SECRET_ID_LENGTH',
        16,
      );
      const secretId = generateUniqueSecretId(secretIdLength);
      const maxParticipants = this.configService.get<number>(
        'LIVEKIT_MAX_PARTICIPANTS',
        10,
      );
      const invitedUsers = createRoomDto.isPrivate
        ? createRoomDto.invitedUsers?.map((user) => new Types.ObjectId(user)) ||
          []
        : [];

      if (invitedUsers.length > 0) {
        const validUsers = await this.userModel.countDocuments({
          _id: { $in: invitedUsers },
        });
        if (validUsers !== invitedUsers.length) {
          console.error(`Invalid invited users: ${invitedUsers}`);
          throw new NotFoundException('One or more invited users not found');
        }
      }
      const room = new this.roomModel({
        ...createRoomDto,
        secretId,
        maxParticipants: createRoomDto.maxParticipants || maxParticipants,
        createdBy: new Types.ObjectId(userId),
        invitedUsers,
      });
      const savedRoom = await room.save();
      console.log('Room saved:', savedRoom);
      return { ...savedRoom.toObject(), secretId: savedRoom.secretId };
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.name) {
        throw new Error(
          'A room with this name already exists. Please choose a different name.',
        );
      }
      throw error;
    }
  }

  async findAllRooms(): Promise<Omit<LivekitRoom, 'secretId'>[]> {
    return await this.roomModel
      .find({ isActive: true })
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();
  }

  async findRoomById(id: string): Promise<Omit<LivekitRoom, 'secretId'>> {
    const room = await this.roomModel
      .findById(id)
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async updateRoom(
    id: string,
    updateRoomDto: UpdateRoomDto,
    userId: string,
  ): Promise<Omit<LivekitRoom, 'secretId'>> {
    const room = await this.roomModel.findById(id);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is the creator of the room
    if (room.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'Only the room creator can update this room',
      );
    }
    const invitedUsers = updateRoomDto.isPrivate
      ? updateRoomDto.invitedUsers?.map((id) => new Types.ObjectId(id)) || []
      : [];

    if (invitedUsers.length > 0) {
      const validUsers = await this.userModel.countDocuments({
        _id: { $in: invitedUsers },
      });
      if (validUsers !== invitedUsers.length) {
        throw new NotFoundException('One or more invited users not found');
      }
    }
    const updatedData = {
      ...updateRoomDto,
      invitedUsers,
    };
    const updatedRoom = await this.roomModel
      .findByIdAndUpdate(id, updatedData, { new: true })
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();

    if (!updatedRoom) {
      throw new NotFoundException('Room not found after update');
    }

    return updatedRoom;
  }

  async deleteRoom(id: string, userId: string): Promise<void> {
    const room = await this.roomModel.findById(id);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is the creator of the room
    if (room.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'Only the room creator can delete this room',
      );
    }

    await this.roomModel.findByIdAndDelete(id);
  }

  async findRoomsByUser(
    userId: string,
  ): Promise<Omit<LivekitRoom, 'secretId'>[]> {
    return await this.roomModel
      .find({ createdBy: new Types.ObjectId(userId), isActive: true })
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();
  }

  async findRoomBySecretId(
    secretId: string,
  ): Promise<Omit<LivekitRoomDocument, 'secretId'>> {
    const room = await this.roomModel
      .findOne({ secretId, isActive: true })
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found or inactive');
    }

    return room;
  }

  async findRoomBySecretIdInternal(
    secretId: string,
  ): Promise<LivekitRoomDocument> {
    try {
      console.log('Searching for room with secretId:', secretId);

      const room = await this.roomModel
        .findOne({ secretId, isActive: true })
        .populate('createdBy', 'username firstName lastName')
        .exec();

      console.log(
        'Database query result:',
        room ? 'Room found' : 'Room not found',
      );

      if (!room) {
        throw new NotFoundException('Room not found or inactive');
      }

      return room;
    } catch (error) {
      console.error('Error in findRoomBySecretIdInternal:', error);
      throw error;
    }
  }

  async getRoomSecretId(
    roomId: string,
    userId: string,
  ): Promise<{ secretId: string }> {
    const room = await this.roomModel.findById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is the creator of the room
    if (room.createdBy.toString() !== userId) {
      throw new ForbiddenException(
        'Only the room creator can access the secret ID',
      );
    }

    return { secretId: room.secretId };
  }
}
