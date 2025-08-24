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
import { generateUniqueSecretId, generateUniquePublicId } from './utils/secret-id.util';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument } from 'src/users/shemas/user.schema';
import { LivekitSession, LivekitSessionDocument } from './session.schema';

@Injectable()
export class LivekitService {
  constructor(
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoomDocument>,
    @InjectModel(LivekitSession.name)
    private readonly sessionModel: Model<LivekitSessionDocument>,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    // Fix the MongoDB index issue on startup
    this.fixMongoIndexes();
  }

  private async fixMongoIndexes() {
    try {
      // Drop the problematic unique index on secretId
      await this.roomModel.collection.dropIndex('secretId_1');
      console.log('✅ Dropped problematic secretId unique index');
    } catch (error) {
      // Index might not exist, that's fine
      console.log('ℹ️ secretId index already removed or doesn\'t exist');
    }
  }

  async createRoom(
    createRoomDto: CreateRoomDto,
    userId: string,
  ): Promise<LivekitRoom & { secretId?: string }> {
    try {
      const maxParticipants = this.configService.get<number>(
        'LIVEKIT_MAX_PARTICIPANTS',
        10,
      );
      
      let secretId: string | undefined;
      
      // Only generate secretId for private rooms
      if (createRoomDto.isPrivate) {
        const secretIdLength = this.configService.get<number>(
          'LIVEKIT_SECRET_ID_LENGTH',
          16,
        );
        secretId = generateUniqueSecretId(secretIdLength);
      }
      
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
                           const roomData: any = {
        ...createRoomDto,
        maxParticipants: createRoomDto.maxParticipants || maxParticipants,
        createdBy: new Types.ObjectId(userId),
        invitedUsers,
        totalParticipantsJoined: 0,
        currentActiveParticipants: 0,
        peakParticipants: 0,
      };
      
      // Convert scheduledStartTime from string to Date if provided, or set to null if empty
      if (createRoomDto.scheduledStartTime === null || createRoomDto.scheduledStartTime === '') {
        roomData.scheduledStartTime = null;
      } else if (createRoomDto.scheduledStartTime) {
        roomData.scheduledStartTime = new Date(createRoomDto.scheduledStartTime);
      }
      
      // Only add secretId if it exists (for private rooms)
      if (secretId && typeof secretId === 'string') {
        roomData.secretId = secretId;
      }
      console.log('Creating room with data:', roomData);
      
      const room = new this.roomModel(roomData);
      console.log('Room model created, attempting to save...');
      
      const savedRoom = await room.save();
      console.log('Room saved successfully:', savedRoom);
      
      // Return secretId only for private rooms
      if (savedRoom.isPrivate) {
        return { ...savedRoom.toObject(), secretId: savedRoom.secretId };
      } else {
        return savedRoom.toObject();
      }
    } catch (error) {
      console.error('Error in createRoom service:', error);
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
      .populate('createdBy', 'username firstName lastName email avatar')
      .select('-secretId')
      .exec();
    
    // Manually populate invited users and calculate real participant counts
    for (const room of rooms) {
      if (room.invitedUsers && room.invitedUsers.length > 0) {
        const userIds = room.invitedUsers.map(id => id.toString());
        const users = await this.userModel
          .find({ _id: { $in: userIds } })
          .select('username firstName lastName email avatar')
          .exec();
        
        // Replace ObjectIds with user objects
        room.invitedUsers = users as any;
      }
      
      // Calculate real participant counts from session data
      const session = await this.sessionModel.findOne({ roomId: room._id });
      if (session) {
        room.totalParticipantsJoined = session.participants.length;
        room.currentActiveParticipants = session.participants.filter(p => p.isActive).length;
        room.peakParticipants = Math.max(room.peakParticipants || 0, room.currentActiveParticipants);
      } else {
        room.totalParticipantsJoined = 0;
        room.currentActiveParticipants = 0;
        room.peakParticipants = 0;
      }
    }
    
    return rooms;
  }

  async findRoomById(id: string): Promise<Omit<LivekitRoom, 'secretId'>> {
    const room = await this.roomModel
      .findById(id)
      .populate('createdBy', 'username firstName lastName email avatar')
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
        .select('username firstName lastName email avatar')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
    }

    // Calculate real participant counts from session data
    const session = await this.sessionModel.findOne({ roomId: room._id });
    if (session) {
      room.totalParticipantsJoined = session.participants.length;
      room.currentActiveParticipants = session.participants.filter(p => p.isActive).length;
      room.peakParticipants = Math.max(room.peakParticipants || 0, room.currentActiveParticipants);
    } else {
      room.totalParticipantsJoined = 0;
      room.currentActiveParticipants = 0;
      room.peakParticipants = 0;
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
    const updatedData: any = {
      ...updateRoomDto,
      invitedUsers,
    };
    
    // Convert scheduledStartTime from string to Date if provided, or clear it if null/empty
    if (updateRoomDto.scheduledStartTime === null || updateRoomDto.scheduledStartTime === '') {
      updatedData.scheduledStartTime = null;
    } else if (updateRoomDto.scheduledStartTime) {
      updatedData.scheduledStartTime = new Date(updateRoomDto.scheduledStartTime);
    }
    
    // Ensure participant count fields exist
    if (updatedData.totalParticipantsJoined === undefined) {
      updatedData.totalParticipantsJoined = 0;
    }
    if (updatedData.currentActiveParticipants === undefined) {
      updatedData.currentActiveParticipants = 0;
    }
    if (updatedData.peakParticipants === undefined) {
      updatedData.peakParticipants = 0;
    }

    const updatedRoom = await this.roomModel
      .findByIdAndUpdate(id, updatedData, { new: true })
      .populate('createdBy', 'username firstName lastName email avatar')
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
        .select('username firstName lastName email avatar')
        .exec();
      
      // Replace ObjectIds with user objects
      updatedRoom.invitedUsers = users as any;
    }

    // Calculate real participant counts from session data
    const session = await this.sessionModel.findOne({ roomId: updatedRoom._id });
    if (session) {
      updatedRoom.totalParticipantsJoined = session.participants.length;
      updatedRoom.currentActiveParticipants = session.participants.filter(p => p.isActive).length;
      updatedRoom.peakParticipants = Math.max(updatedRoom.peakParticipants || 0, updatedRoom.currentActiveParticipants);
    } else {
      updatedRoom.totalParticipantsJoined = 0;
      updatedRoom.currentActiveParticipants = 0;
      updatedRoom.peakParticipants = 0;
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

    // Delete the room
    await this.roomModel.findByIdAndDelete(id);
    
    // Also delete related sessions
    await this.sessionModel.deleteMany({ roomId: id });
  }

  async findRoomsByUser(
    userId: string,
  ): Promise<Omit<LivekitRoom, 'secretId'>[]> {
    const rooms = await this.roomModel
      .find({ createdBy: new Types.ObjectId(userId), isActive: true })
      .populate('createdBy', 'username firstName lastName email avatar')
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
      
      // Calculate real participant counts from session data
      const session = await this.sessionModel.findOne({ roomId: room._id });
      if (session) {
        room.totalParticipantsJoined = session.participants.length;
        room.currentActiveParticipants = session.participants.filter(p => p.isActive).length;
        room.peakParticipants = Math.max(room.peakParticipants || 0, room.currentActiveParticipants);
      } else {
        room.totalParticipantsJoined = 0;
        room.currentActiveParticipants = 0;
        room.peakParticipants = 0;
      }
    }
    
    return rooms;
  }

  async findRoomBySecretId(
    secretId: string,
  ): Promise<Omit<LivekitRoomDocument, 'secretId'>> {
    const room = await this.roomModel
      .findOne({ secretId, isActive: true })
      .populate('createdBy', 'username firstName lastName email avatar')
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
        .select('username firstName lastName email avatar')
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
        .populate('createdBy', 'username firstName lastName email avatar')
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

    if (!room.secretId) {
      throw new NotFoundException('This room does not have a secret ID');
    }

    return { secretId: room.secretId };
  }



  async joinPublicRoomById(
    roomId: string,
  ): Promise<Omit<LivekitRoom, 'secretId'>> {
    const room = await this.roomModel
      .findById(roomId)
      .populate('createdBy', 'username firstName lastName email avatar')
      .select('-secretId')
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.isPrivate) {
      throw new ForbiddenException('This room is private and requires an invitation');
    }

    if (!room.isActive) {
      throw new NotFoundException('Room is not active');
    }

    // Check if room is scheduled and not yet accessible
    if (room.scheduledStartTime) {
      const now = new Date();
      if (now < room.scheduledStartTime) {
        const timeUntilStart = room.scheduledStartTime.getTime() - now.getTime();
        const minutesUntilStart = Math.ceil(timeUntilStart / (1000 * 60));
        
        throw new ForbiddenException(
          `This session is scheduled to start in ${minutesUntilStart} minutes. Please wait until ${room.scheduledStartTime.toLocaleString()} to join.`
        );
      }
    }

    // Manually populate invited users
    if (room.invitedUsers && room.invitedUsers.length > 0) {
      const userIds = room.invitedUsers.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email avatar')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
    }

    // Calculate real participant counts from session data
    const session = await this.sessionModel.findOne({ roomId: room._id });
    if (session) {
      room.totalParticipantsJoined = session.participants.length;
      room.currentActiveParticipants = session.participants.filter(p => p.isActive).length;
      room.peakParticipants = Math.max(room.peakParticipants || 0, room.currentActiveParticipants);
    } else {
      room.totalParticipantsJoined = 0;
      room.currentActiveParticipants = 0;
      room.peakParticipants = 0;
    }

    return room;
  }

  async findPublicRooms(): Promise<Omit<LivekitRoom, 'secretId'>[]> {
    try {
      // Query for public rooms - no ID required
      const rooms = await this.roomModel
        .find({ isActive: true, isPrivate: false })
        .populate('createdBy', 'username firstName lastName email avatar')
        .select('-secretId')
        .exec();
      
      // If no rooms found, return empty array
      if (!rooms || rooms.length === 0) {
        return [];
      }
      
      // Filter out rooms that are not yet accessible based on scheduled time
      const now = new Date();
      const accessibleRooms = rooms.filter(room => {
        if (!room.scheduledStartTime) {
          return true; // No scheduled time, always accessible
        }
        return now >= room.scheduledStartTime;
      });
      
      // Manually populate invited users
      for (const room of accessibleRooms) {
        if (room.invitedUsers && room.invitedUsers.length > 0) {
          const userIds = room.invitedUsers.map(id => id.toString());
          const users = await this.userModel
            .find({ _id: { $in: userIds } })
            .select('username firstName lastName email avatar')
            .exec();
          
          // Replace ObjectIds with user objects
          room.invitedUsers = users as any;
        }
        
        // Calculate real participant counts from session data
        const session = await this.sessionModel.findOne({ roomId: room._id });
        if (session) {
          room.totalParticipantsJoined = session.participants.length;
          room.currentActiveParticipants = session.participants.filter(p => p.isActive).length;
          room.peakParticipants = Math.max(room.peakParticipants || 0, room.currentActiveParticipants);
        } else {
          room.totalParticipantsJoined = 0;
          room.currentActiveParticipants = 0;
          room.peakParticipants = 0;
        }
      }
      
      return accessibleRooms;
    } catch (error) {
      console.error('Error in findPublicRooms:', error);
      throw new Error(`Failed to find public rooms: ${error.message}`);
    }
  }

  // Helper method to check if a room is accessible based on scheduled time
  private isRoomAccessible(room: LivekitRoom): boolean {
    if (!room.scheduledStartTime) {
      return true; // No scheduled time, always accessible
    }
    
    const now = new Date();
    return now >= room.scheduledStartTime;
  }

  // Helper method to get time until room becomes accessible
  private getTimeUntilAccessible(room: LivekitRoom): string {
    if (!room.scheduledStartTime) {
      return 'Room is accessible now';
    }
    
    const now = new Date();
    if (now >= room.scheduledStartTime) {
      return 'Room is accessible now';
    }
    
    const timeUntilStart = room.scheduledStartTime.getTime() - now.getTime();
    const days = Math.floor(timeUntilStart / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeUntilStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.ceil((timeUntilStart % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days} day(s), ${hours} hour(s), ${minutes} minute(s)`;
    } else if (hours > 0) {
      return `${hours} hour(s), ${minutes} minute(s)`;
    } else {
      return `${minutes} minute(s)`;
    }
  }


}
