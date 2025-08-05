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
      
      // Start with the provided invited users - handle both user IDs and email addresses
      let invitedUsers: Types.ObjectId[] = [];
      
             if (createRoomDto.invitedUsers && createRoomDto.invitedUsers.length > 0) {
         console.log('Processing invited users:', createRoomDto.invitedUsers);
         for (const userIdentifier of createRoomDto.invitedUsers) {
           let userId: Types.ObjectId;
           
           // Check if it's a valid ObjectId (user ID)
           if (Types.ObjectId.isValid(userIdentifier)) {
             console.log('Valid ObjectId found:', userIdentifier);
             userId = new Types.ObjectId(userIdentifier);
           } else {
             // Assume it's an email address and find the user
             console.log('Looking up user by email:', userIdentifier);
             const user = await this.userModel.findOne({ email: userIdentifier }).select('_id');
             if (!user) {
               console.error(`User with email ${userIdentifier} not found`);
               throw new NotFoundException(`User with email ${userIdentifier} not found`);
             }
             console.log('User found:', user._id);
             userId = user._id as Types.ObjectId;
           }
           
           // Add to invited users if not already present
           if (!invitedUsers.some(id => id.equals(userId))) {
             invitedUsers.push(userId);
             console.log('Added user to invited users:', userId);
           } else {
             console.log('User already in invited users:', userId);
           }
         }
       }
      
             // If it's a private room, automatically add the creator to invited users
       if (createRoomDto.isPrivate) {
         const creatorId = new Types.ObjectId(userId);
         console.log('Adding creator to invited users:', creatorId);
         // Add creator to invited users if not already present
         if (!invitedUsers.some(id => id.equals(creatorId))) {
           invitedUsers.push(creatorId);
           console.log('Creator added to invited users');
         } else {
           console.log('Creator already in invited users');
         }
       }

      if (invitedUsers.length > 0) {
        const validUsers = await this.userModel.countDocuments({
          _id: { $in: invitedUsers },
        });
        if (validUsers !== invitedUsers.length) {
          console.error(`Invalid invited users: ${invitedUsers}`);
          throw new NotFoundException('One or more invited users not found');
        }
      }
             console.log('Creating room with data:', {
         ...createRoomDto,
         secretId,
         maxParticipants: createRoomDto.maxParticipants || maxParticipants,
         createdBy: new Types.ObjectId(userId),
         invitedUsers,
       });
       const room = new this.roomModel({
         ...createRoomDto,
         secretId,
         maxParticipants: createRoomDto.maxParticipants || maxParticipants,
         createdBy: new Types.ObjectId(userId),
         invitedUsers,
       });
       const savedRoom = await room.save();
       console.log('Room saved successfully:', savedRoom);
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
    const rooms = await this.roomModel
      .find({ isActive: true })
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();
    
    // Manually populate invited users
    for (const room of rooms) {
      if (room.invitedUsers && room.invitedUsers.length > 0) {
        const userIds = room.invitedUsers.map(id => id.toString());
        const users = await this.userModel
          .find({ _id: { $in: userIds } })
          .select('username firstName lastName email')
          .exec();
        
        // Replace ObjectIds with user objects
        room.invitedUsers = users as any;
      }
    }
    
    return rooms;
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

    // Manually populate invited users
    if (room.invitedUsers && room.invitedUsers.length > 0) {
      const userIds = room.invitedUsers.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
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
    // Start with the provided invited users - handle both user IDs and email addresses
    let invitedUsers: Types.ObjectId[] = [];
    
    if (updateRoomDto.invitedUsers && updateRoomDto.invitedUsers.length > 0) {
      for (const userIdentifier of updateRoomDto.invitedUsers) {
        let userId: Types.ObjectId;
        
        // Check if it's a valid ObjectId (user ID)
        if (Types.ObjectId.isValid(userIdentifier)) {
          userId = new Types.ObjectId(userIdentifier);
        } else {
          // Assume it's an email address and find the user
          const user = await this.userModel.findOne({ email: userIdentifier }).select('_id');
          if (!user) {
            throw new NotFoundException(`User with email ${userIdentifier} not found`);
          }
          userId = user._id as Types.ObjectId;
        }
        
        // Add to invited users if not already present
        if (!invitedUsers.some(id => id.equals(userId))) {
          invitedUsers.push(userId);
        }
      }
    }
    
    // If it's a private room, automatically add the creator to invited users
    if (updateRoomDto.isPrivate) {
      const creatorId = new Types.ObjectId(userId);
      // Add creator to invited users if not already present
      if (!invitedUsers.some(id => id.equals(creatorId))) {
        invitedUsers.push(creatorId);
      }
    }

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

    // Manually populate invited users
    if (updatedRoom.invitedUsers && updatedRoom.invitedUsers.length > 0) {
      const userIds = updatedRoom.invitedUsers.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email')
        .exec();
      
      // Replace ObjectIds with user objects
      updatedRoom.invitedUsers = users as any;
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
    const rooms = await this.roomModel
      .find({ createdBy: new Types.ObjectId(userId), isActive: true })
      .populate('createdBy', 'username firstName lastName')
      .select('-secretId')
      .exec();
    
    // Manually populate invited users
    for (const room of rooms) {
      if (room.invitedUsers && room.invitedUsers.length > 0) {
        const userIds = room.invitedUsers.map(id => id.toString());
        const users = await this.userModel
          .find({ _id: { $in: userIds } })
          .select('username firstName lastName email')
          .exec();
        
        // Replace ObjectIds with user objects
        room.invitedUsers = users as any;
      }
    }
    
    return rooms;
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

    // Manually populate invited users
    if (room.invitedUsers && room.invitedUsers.length > 0) {
      const userIds = room.invitedUsers.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
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
