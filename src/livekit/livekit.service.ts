import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException, // Added BadRequestException
  Inject,
  HttpException,
  HttpStatus,
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
import { MeetingPurchase, MeetingPurchaseDocument } from './schemas/meeting-purchase.schema';
import { PurchaseStatus } from './enums/purchase-status.enum'; // Removed PURCHASE_MESSAGES, PURCHASE_ACTIONS
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk'; // Added RoomServiceClient and AccessToken
import {
  DiscoverSessionsQueryDto,
  DiscoverSessionsResponseDto,
  DiscoverSessionsFiltersDto,
  DiscoverSessionsPaginationDto,
  DiscoverSessionDto,
} from './dto/discover-sessions.dto';
import { PaymentService } from '../payments/payment.service'; // تصحيح المسار
import { NotificationService } from '../notification/notification.service'; // Added NotificationService
import { CreateNotificationDto } from '../notification/dto/create-notification.dto'; // Added CreateNotificationDto
import { NotificationType } from '../notification/entities/notification.schema'; // تصحيح المسار
import { StripeConnectService } from '../payments/stripe-connect.service'; // New: Import StripeConnectService

@Injectable()
export class LivekitService {
  private readonly livekitHost: string;
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly roomServiceClient: RoomServiceClient; // Declared RoomServiceClient

  constructor(
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoomDocument>,
    @InjectModel(LivekitSession.name)
    private readonly sessionModel: Model<LivekitSessionDocument>,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(MeetingPurchase.name)
    private readonly meetingPurchaseModel: Model<MeetingPurchaseDocument>, // Injected MeetingPurchase model
    private readonly paymentService: PaymentService, // Injected PaymentService
    private readonly notificationService: NotificationService, // Injected NotificationService
    private readonly stripeConnectService: StripeConnectService, // New: Inject StripeConnectService
  ) {
    const livekitHost = this.configService.get<string>('LIVEKIT_URL');
    const livekitApiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const livekitApiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!livekitHost || !livekitApiKey || !livekitApiSecret) {
      throw new Error('LiveKit environment variables (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) must be defined.');
    }

    this.livekitHost = livekitHost;
    this.livekitApiKey = livekitApiKey;
    this.livekitApiSecret = livekitApiSecret;

    this.roomServiceClient = new RoomServiceClient(
      this.livekitHost,
      this.livekitApiKey,
      this.livekitApiSecret,
    ); // Initialized RoomServiceClient
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

  private async ensureRoomExists(livekitClient: RoomServiceClient, roomName: string, roomDisplayName: string): Promise<void> {
    try {
      await livekitClient.listParticipants(roomName);
    } catch (error: any) {
      if (error.status === 404) {
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

  async createRoom(
    createRoomDto: CreateRoomDto,
    userId: string,
  ): Promise<LivekitRoom & { secretId?: string }> {
    try {
      // Enforce business logic: a room cannot be both private and paid
      if (createRoomDto.isPrivate && createRoomDto.isPaid) {
        throw new BadRequestException(
          'A room cannot be both private and paid. Please choose one.',
        );
      }

      // Enforce business logic: paid rooms must have a scheduled start time
      if (createRoomDto.isPaid && (!createRoomDto.scheduledStartTime || createRoomDto.scheduledStartTime === null || createRoomDto.scheduledStartTime === '')) {
        throw new BadRequestException(
          'Paid sessions must have a scheduled start time.',
        );
      }

      // Enforce business logic: if room is paid, creator must have a Stripe Connect account
      if (createRoomDto.isPaid) {
        const accountStatus = await this.stripeConnectService.getAccountStatus(userId);
        if (!accountStatus.isConnected) {
          throw new BadRequestException(
            'You must connect your Stripe account to create paid sessions.',
          );
        }
        if (!accountStatus.detailsSubmitted) {
          throw new BadRequestException(
            'Please complete your Stripe account setup to create paid sessions.',
          );
        }
        if (!accountStatus.chargesEnabled || !accountStatus.payoutsEnabled) {
          throw new BadRequestException(
            'Your Stripe account is connected but not fully enabled for payments and payouts. Please check your Stripe dashboard.',
          );
        }
      }
      
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
      
      // Note: Creator doesn't need to be in invitedUsers since they created the room
      // Only add creator if explicitly provided in the invitedUsers list

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
      // Ensure currency is always USD
      roomData.currency = 'USD';
      
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
        // Filter out non-ObjectId values (like email addresses) and only keep valid ObjectIds
        const validObjectIds = room.invitedUsers.filter(id => 
          Types.ObjectId.isValid(id.toString())
        );
        
        if (validObjectIds.length > 0) {
          const userIds = validObjectIds.map(id => id.toString());
        const users = await this.userModel
          .find({ _id: { $in: userIds } })
          .select('username firstName lastName email avatar')
          .exec();
        
        // Replace ObjectIds with user objects
        room.invitedUsers = users as any;
        } else {
          // If no valid ObjectIds, set to empty array
          room.invitedUsers = [];
        }
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
      // Filter out non-ObjectId values (like email addresses) and only keep valid ObjectIds
      const validObjectIds = room.invitedUsers.filter(id => 
        Types.ObjectId.isValid(id.toString())
      );
      
      if (validObjectIds.length > 0) {
        const userIds = validObjectIds.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email avatar')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
      } else {
        // If no valid ObjectIds, set to empty array
        room.invitedUsers = [];
      }
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

    // Get purchase count for this room
    const completedPurchases = await this.meetingPurchaseModel.find({
      roomId: room._id,
      status: 'completed'
    }).sort({ purchaseDate: -1 });
    
    // Add purchase count to room object
    const roomObj = room.toObject ? room.toObject() : room;
    (roomObj as any).completedPurchasesCount = completedPurchases.length;

    // Get user details for recent purchasers (last 3)
    const recentPurchases = completedPurchases.slice(0, 3);
    const recentPurchasers = await Promise.all(
      recentPurchases.map(async (purchase) => {
        const user = await this.userModel.findById(purchase.userId).select('username firstName lastName avatar');
        return {
          userId: purchase.userId,
          username: user?.username || 'Unknown',
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          avatar: user?.avatar || '',
          purchasedAt: purchase.purchaseDate
        };
      })
    );
    
    (roomObj as any).recentPurchasers = recentPurchasers;

    return roomObj;
  }

  async getRoomPurchasers(
    roomId: string, 
    userId: string, 
    page: number = 1, 
    limit: number = 10
  ): Promise<any> {
    const room = await this.roomModel.findById(roomId);
    
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is the room creator
    if (room.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the room creator can view all purchasers');
    }

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Max 100 items per page
    const skip = (validPage - 1) * validLimit;

    // Get total count for pagination
    const totalPurchases = await this.meetingPurchaseModel.countDocuments({
      roomId: room._id,
      status: 'completed'
    });

    // Get paginated completed purchases
    const completedPurchases = await this.meetingPurchaseModel.find({
      roomId: room._id,
      status: 'completed'
    })
    .sort({ purchaseDate: -1 })
    .skip(skip)
    .limit(validLimit);

    // Format purchasers data with user details
    const purchasers = await Promise.all(
      completedPurchases.map(async (purchase) => {
        const user = await this.userModel.findById(purchase.userId).select('username firstName lastName avatar email');
        return {
          purchaseId: purchase._id,
          userId: (purchase.userId as Types.ObjectId).toString(),
          username: user?.username || 'Unknown',
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          avatar: user?.avatar || '',
          email: user?.email || '',
          amountPaid: purchase.amountPaid,
          currency: purchase.currencyUsed,
          purchasedAt: purchase.purchaseDate,
          status: purchase.status
        };
      })
    );

    // Calculate total revenue (from all purchases, not just current page)
    const allPurchases = await this.meetingPurchaseModel.find({
      roomId: room._id,
      status: 'completed'
    }).select('amountPaid');
    
    const totalRevenue = allPurchases.reduce((sum, p) => sum + p.amountPaid, 0);

    // Calculate pagination info
    const totalPages = Math.ceil(totalPurchases / validLimit);

    return {
      roomId: room._id,
      roomName: room.name,
      totalPurchasers: totalPurchases,
      totalRevenue,
      purchasers,
      pagination: {
        page: validPage,
        limit: validLimit,
        total: totalPurchases,
        totalPages,
        hasNext: validPage < totalPages,
        hasPrev: validPage > 1
      }
    };
  }

  async updateRoom(
    id: string,
    updateRoomDto: UpdateRoomDto,
    userId: string,
  ): Promise<Omit<LivekitRoom, 'secretId'> | { message: string; cancelled?: boolean }> {
    console.log('=== UPDATE ROOM DEBUG ===');
    console.log('Room ID:', id);
    console.log('User ID:', userId);
    console.log('Update DTO:', updateRoomDto);

    const room = await this.roomModel.findById(id);

    if (!room) {
      console.log('Room not found');
      throw new NotFoundException('Room not found');
    }

    console.log('Room found. Creator ID:', room.createdBy.toString());
    console.log('User is creator?', room.createdBy.toString() === userId);

    // التحقق من أن المستخدم هو مالك الغرفة
    if (room.createdBy.toString() !== userId) {
      console.log('Forbidden: User is not the room creator');
      throw new ForbiddenException('Only the room creator can update this room');
    }

    // إذا كان الطلب لإلغاء الغرفة، استخدم دالة cancelRoom
    if (updateRoomDto.cancel === true) {
      console.log('🔄 Cancel request detected, calling cancelRoom...');
      await this.cancelRoom(id, userId, updateRoomDto.cancellationReason);
      return { message: 'Room cancelled successfully', cancelled: true };
    }

    // منع أن تكون الغرفة private و paid في نفس الوقت
    if (updateRoomDto.isPrivate && updateRoomDto.isPaid) {
      throw new BadRequestException('A room cannot be both private and paid. Please choose one.');
    }

    // منع تحويل الغرفة إلى مدفوعة بدون موعد محدد
    if (updateRoomDto.isPaid && (!updateRoomDto.scheduledStartTime || updateRoomDto.scheduledStartTime === null || updateRoomDto.scheduledStartTime === '')) {
      throw new BadRequestException('Paid sessions must have a scheduled start time.');
    }

    // التحقق من وجود مشتريات مكتملة
    const completedPurchases = await this.meetingPurchaseModel.find({
      roomId: room._id,
      status: 'completed'
    });

    console.log('Completed purchases count:', completedPurchases.length);
    console.log('Completed purchases details:', completedPurchases.map(p => ({
      id: p._id,
      userId: p.userId,
      amount: p.amountPaid,
      status: p.status
    })));

    // منع تغيير السعر أو حالة الدفع إذا كانت هناك مشتريات
    if (completedPurchases.length > 0) {
      console.log('Room has completed purchases, checking price and payment status changes...');
      
      if (updateRoomDto.price !== undefined && updateRoomDto.price !== room.price) {
        console.log('Forbidden: Attempting to change price after purchases');
        console.log('Current price:', room.price, 'New price:', updateRoomDto.price);
        throw new ForbiddenException('Cannot change room price after purchases');
      }
      console.log('Price validation passed');

      if (updateRoomDto.isPaid !== undefined && updateRoomDto.isPaid !== room.isPaid) {
        console.log('Forbidden: Attempting to change payment status after purchases');
        console.log('Current isPaid:', room.isPaid, 'New isPaid:', updateRoomDto.isPaid);
        throw new ForbiddenException('Cannot change payment status after purchases');
      }
      console.log('Payment status validation passed');

      // التحقق من maxParticipants - يجب أن يكون أكبر من أو يساوي عدد المشترين الحاليين
      if (updateRoomDto.maxParticipants !== undefined) {
        console.log('Checking maxParticipants change...');
        console.log('Current maxParticipants:', room.maxParticipants, 'New maxParticipants:', updateRoomDto.maxParticipants);
        console.log('Current completed purchases:', completedPurchases.length);
        
        // يجب أن يكون maxParticipants أكبر من أو يساوي عدد المشترين + الـ creator (1)
        const minRequiredParticipants = completedPurchases.length + 1; // +1 للـ creator
        console.log('=== MAX PARTICIPANTS VALIDATION ===');
        console.log('Completed purchases count:', completedPurchases.length);
        console.log('Min required participants:', minRequiredParticipants);
        console.log('New maxParticipants:', updateRoomDto.maxParticipants);
        console.log('Is new max < min required?', updateRoomDto.maxParticipants !== null && updateRoomDto.maxParticipants < minRequiredParticipants);
        
        if (updateRoomDto.maxParticipants !== null && updateRoomDto.maxParticipants < minRequiredParticipants) {
          console.log('Forbidden: New maxParticipants is less than required minimum');
          throw new ForbiddenException(
            `Cannot set maxParticipants to ${updateRoomDto.maxParticipants}. There are already ${completedPurchases.length} participants who have paid, plus the creator. Minimum required: ${minRequiredParticipants}.`
          );
        }
        
        console.log('maxParticipants change allowed');
      }
    }

    // التحقق من التغييرات وإرسال إشعار واحد شامل
    if (completedPurchases.length > 0) {
      console.log('=== CHECKING FOR CHANGES ===');
      
      const changes: any = {};
      let hasChanges = false;
      let content = '';
      const changeTypes: string[] = [];

      // التحقق من تغيير الوقت
      if (updateRoomDto.scheduledStartTime && 
          new Date(updateRoomDto.scheduledStartTime).getTime() !== new Date(room.scheduledStartTime || 0).getTime()) {
        
        const newTime = new Date(updateRoomDto.scheduledStartTime);
        const now = new Date();
        const isNewTimeInPast = newTime < now;
        
        changes.scheduledStartTime = {
          old: room.scheduledStartTime,
          new: updateRoomDto.scheduledStartTime,
          isInPast: isNewTimeInPast
        };
        
        hasChanges = true;
        changeTypes.push('time');
        
        if (isNewTimeInPast) {
          content = `⚠️ Session "${room.name}" time has been changed to a past time! Please check the new schedule.`;
        }
        
        console.log('⏰ Time change detected:', {
          oldTime: room.scheduledStartTime,
          newTime: updateRoomDto.scheduledStartTime,
          isInPast: isNewTimeInPast
        });
      }

      // التحقق من تغيير الوصف
      if (updateRoomDto.description && 
          updateRoomDto.description !== room.description) {
        
        changes.description = {
          old: room.description,
          new: updateRoomDto.description
        };
        
        hasChanges = true;
        changeTypes.push('description');
        console.log('📝 Description change detected');
      }

      // التحقق من تغيير الاسم
      if (updateRoomDto.name && 
          updateRoomDto.name !== room.name) {
        
        changes.name = {
          old: room.name,
          new: updateRoomDto.name
        };
        
        hasChanges = true;
        changeTypes.push('name');
        console.log('📝 Name change detected');
      }

      // تحديد المحتوى حسب نوع التغيير
      if (hasChanges && !content) {
        if (changeTypes.length === 1) {
          // تغيير واحد فقط
          switch (changeTypes[0]) {
            case 'time':
              content = `Session "${room.name}" time has been changed`;
              break;
            case 'description':
              content = `Session "${room.name}" description has been updated`;
              break;
            case 'name':
              content = `Session "${room.name}" name has been updated`;
              break;
          }
        } else {
          // تغييرات متعددة
          content = `Session "${room.name}" has been updated`;
        }
      }

      // إرسال إشعار واحد شامل إذا كان هناك تغييرات
      if (hasChanges) {
        console.log('📧 Sending comprehensive update notification to', completedPurchases.length, 'purchasers');
        console.log('Changes detected:', changes);
        
        const updateNotifications = completedPurchases.map(purchase => ({
          toUserId: purchase.userId.toString(),
          fromUserId: userId,
          content: content,
          type: NotificationType.SESSION_DETAILS_CHANGED,
          data: {
            roomId: (room._id as Types.ObjectId).toString(),
            roomName: updateRoomDto.name || room.name,
            changes: changes,
            refundOption: true
          }
        }));

        await this.notificationService.addNotifications(updateNotifications);
        console.log('✅ Comprehensive update notifications sent successfully');
      } else {
        console.log('ℹ️ No changes detected, no notifications needed');
      }
    }

    // معالجة invitedUsers إذا تم توفيرها
    let processedUpdateData = { ...updateRoomDto };
    
    if (updateRoomDto.invitedUsers && updateRoomDto.invitedUsers.length > 0) {
      console.log('=== PROCESSING INVITED USERS IN UPDATE ===');
      console.log('Invited users from DTO:', updateRoomDto.invitedUsers);
      
      let invitedUserIds: Types.ObjectId[] = [];
      
      for (const userIdentifier of updateRoomDto.invitedUsers) {
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
        if (!invitedUserIds.some(id => id.equals(userId))) {
          invitedUserIds.push(userId);
          console.log('Added user to invited users:', userId);
        } else {
          console.log('User already in invited users:', userId);
        }
      }
      
      // If room is being changed from private to public, clear all invited users
      if (room.isPrivate && updateRoomDto.isPrivate === false) {
        console.log('Room changed from private to public - clearing all invited users');
        invitedUserIds = [];
      }
      // Note: Creator doesn't need to be in invitedUsers since they created the room
      // Only add creator if explicitly provided in the invitedUsers list
      
      // Replace the invitedUsers in the update data
      (processedUpdateData as any).invitedUsers = invitedUserIds;
      console.log('Final invited user IDs:', invitedUserIds);
      console.log('=== END PROCESSING INVITED USERS ===');
    }

    // تحديث الغرفة
    const updatedRoom = await this.roomModel.findByIdAndUpdate(
      id, 
      processedUpdateData, 
      { new: true }
    );

    if (!updatedRoom) {
      throw new NotFoundException('Room not found after update');
    }

    return updatedRoom.toObject();
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

    // التحقق من وجود مشتريات مكتملة - منع حذف الغرف المشتراة
    const completedPurchases = await this.meetingPurchaseModel.find({
      roomId: room._id,
      status: 'completed'
    });

    if (completedPurchases.length > 0) {
      throw new ForbiddenException(
        `Cannot delete this room. There are ${completedPurchases.length} completed purchases. Please use the cancel room feature instead to refund participants.`
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
        // Filter out non-ObjectId values (like email addresses) and only keep valid ObjectIds
        const validObjectIds = room.invitedUsers.filter(id => 
          Types.ObjectId.isValid(id.toString())
        );
        
        if (validObjectIds.length > 0) {
          const userIds = validObjectIds.map(id => id.toString());
        const users = await this.userModel
          .find({ _id: { $in: userIds } })
          .select('username firstName lastName email')
          .exec();
        
        // Replace ObjectIds with user objects
        room.invitedUsers = users as any;
        } else {
          // If no valid ObjectIds, set to empty array
          room.invitedUsers = [];
        }
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

      // Get purchase count and recent purchasers for this room
      const completedPurchases = await this.meetingPurchaseModel.find({
        roomId: room._id,
        status: 'completed'
      }).sort({ purchaseDate: -1 });
      
      // Add purchase count to room object
      const roomObj = room.toObject ? room.toObject() : room;
      (roomObj as any).completedPurchasesCount = completedPurchases.length;

      // Get user details for recent purchasers (last 3)
      const recentPurchases = completedPurchases.slice(0, 3);
      const recentPurchasers = await Promise.all(
        recentPurchases.map(async (purchase) => {
          const user = await this.userModel.findById(purchase.userId).select('username firstName lastName avatar');
          return {
            userId: purchase.userId,
            username: user?.username || 'Unknown',
            firstName: user?.firstName || '',
            lastName: user?.lastName || '',
            avatar: user?.avatar || '',
            purchasedAt: purchase.purchaseDate
          };
        })
      );
      
      (roomObj as any).recentPurchasers = recentPurchasers;
      
      // Replace the room in the array
      const roomIndex = rooms.findIndex(r => (r._id as Types.ObjectId).toString() === (room._id as Types.ObjectId).toString());
      if (roomIndex !== -1) {
        rooms[roomIndex] = roomObj as any;
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
      // Filter out non-ObjectId values (like email addresses) and only keep valid ObjectIds
      const validObjectIds = room.invitedUsers.filter(id => 
        Types.ObjectId.isValid(id.toString())
      );
      
      if (validObjectIds.length > 0) {
        const userIds = validObjectIds.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email avatar')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
      } else {
        // If no valid ObjectIds, set to empty array
        room.invitedUsers = [];
      }
    }

    return room;
  }

  async findRoomBySecretIdInternal(
    secretId: string,
    userId: string, // Added userId parameter
  ): Promise<LivekitRoomDocument & { userHasPurchased?: boolean }> {
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

      // Check if room is paid and if user has purchased it
      let userHasPurchased = false;
      if (room.isPaid) {
        const isCreator = room.createdBy.toString() === userId;

        if (isCreator) {
          userHasPurchased = true; // Creator always has access to their paid room
        } else {
          // If not the creator, check for a completed purchase
        const hasPurchased = await this.meetingPurchaseModel.exists({
          userId: new Types.ObjectId(userId),
          roomId: room._id,
          status: 'completed',
        });
        userHasPurchased = !!hasPurchased;
        }

        // Only throw exception if not creator AND not purchased
        if (!isCreator && !userHasPurchased) { // **THIS IS THE CRITICAL CHANGE**
          throw new ForbiddenException('Payment required to join this session.');
        }
      }

      // Check max participants limit
      if (room.maxParticipants !== null) {
        const livekitRoom = await this.roomServiceClient.listRooms([room.name]);
        if (livekitRoom.length > 0 && livekitRoom[0].numParticipants >= room.maxParticipants) {
          throw new ForbiddenException('Room is full. Maximum participants reached.');
        }
      }

      // Return room with userHasPurchased status
      const roomWithPurchaseStatus = room as LivekitRoomDocument & { userHasPurchased?: boolean };
      roomWithPurchaseStatus.userHasPurchased = userHasPurchased;
      return roomWithPurchaseStatus;
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

  async cancelRoom(
    id: string, 
    userId: string,
    reason?: string
  ): Promise<void> {
    console.log('=== CANCEL ROOM DEBUG ===');
    console.log('Room ID:', id);
    console.log('User ID:', userId);
    console.log('Reason:', reason);

    const room = await this.roomModel.findById(id);

    if (!room) {
      console.log('❌ Room not found');
      throw new NotFoundException('Room not found');
    }

    console.log('✅ Room found:', room.name);

    // التحقق من أن المستخدم هو مالك الغرفة
    if (room.createdBy.toString() !== userId) {
      console.log('❌ User is not the room creator');
      throw new ForbiddenException('Only the room creator can cancel the room');
    }

    console.log('✅ User is the room creator');

    // جلب جميع المشتريات المكتملة للغرفة
    const purchases = await this.meetingPurchaseModel.find({
      roomId: room._id,
      status: 'completed'
    });

    console.log('📊 Found completed purchases:', purchases.length);
    console.log('Purchases details:', purchases.map(p => ({
      id: p._id,
      userId: p.userId,
      amount: p.amountPaid,
      status: p.status
    })));

    if (purchases.length === 0) {
      console.log('ℹ️ No completed purchases found, just updating room status');
    }

    // إرسال إشعارات الإلغاء أولاً
    const cancellationPromises = purchases.map(async (purchase) => {
      try {
        console.log(`📧 Sending cancellation notification to user ${purchase.userId}`);
        await this.notificationService.addNotifications([{
          toUserId: purchase.userId.toString(),
          fromUserId: userId,
          content: `Session "${room.name}" has been cancelled and your payment will be refunded`,
          type: NotificationType.SESSION_CANCELLED,
          data: {
            roomId: (room._id as Types.ObjectId).toString(),
            roomName: room.name,
            refundAmount: purchase.amountPaid,
            reason: reason || 'Room cancelled by creator'
          }
        }]);
        console.log(`✅ Cancellation notification sent to user ${purchase.userId}`);
      } catch (error) {
        console.error(`❌ Failed to send cancellation notification for purchase ${purchase._id}:`, error);
      }
    });

    // انتظار إرسال إشعارات الإلغاء
    await Promise.all(cancellationPromises);
    console.log('✅ All cancellation notifications sent');

    // بدء عملية رد الأموال
    const refundPromises = purchases.map(async (purchase) => {
      try {
        console.log(`🔄 Processing refund for purchase ${purchase._id}`);
        
        // رد الأموال باستخدام PaymentService
        await this.paymentService.refundPurchase((purchase._id as Types.ObjectId).toString(), reason);
        console.log(`✅ Refund processed for purchase ${purchase._id}`);
      } catch (error) {
        console.error(`❌ Failed to process refund for purchase ${purchase._id}:`, error);
        // يمكنك إضافة منطق للتعامل مع الأخطاء هنا
      }
    });

    // انتظار اكتمال عمليات رد الأموال
    const refundResults = await Promise.allSettled(refundPromises);
    
    // التحقق من نجاح جميع عمليات الـ refund
    const failedRefunds = refundResults.filter(result => result.status === 'rejected');
    
    if (failedRefunds.length > 0) {
      console.error('❌ Some refunds failed:', failedRefunds);
      throw new BadRequestException(`Failed to process ${failedRefunds.length} refund(s). Cannot cancel room.`);
    }
    
    console.log('✅ All refunds processed successfully');

    // تحديث حالة الغرفة فقط إذا نجحت جميع عمليات الـ refund
    await this.roomModel.findByIdAndUpdate(id, {
      isActive: false,
      cancelledAt: new Date(),
      cancellationReason: reason || 'Room cancelled by creator'
    });
    console.log('✅ Room status updated to cancelled');
  }

  async joinPublicRoomById(
    roomId: string,
    userId: string, // Added userId parameter
  ): Promise<Omit<LivekitRoom, 'secretId'> & { userHasPurchased?: boolean }> {
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

    let userHasPurchased = false;
    if (room.isPaid) {
      // طباعة معلومات للتتبع
      console.log('Room Creator:', room.createdBy);
      console.log('Current User ID:', userId);
      console.log('Room Creator Type:', typeof room.createdBy);
      console.log('User ID Type:', typeof userId);

      // تحقق مباشر: إذا كان المستخدم هو creator، اسمح له بالدخول فوراً
      const isCreator = room.createdBy.toString() === userId || 
                        room.createdBy._id.toString() === userId;
      
      console.log('Is Creator:', isCreator);
      
      if (isCreator) {
        userHasPurchased = true; // دخول مباشر للـ creator
        console.log('Creator access granted');
      } else {
        // فقط بعد التأكد من أنه ليس creator، تحقق من الدفع
      const hasPurchased = await this.meetingPurchaseModel.exists({
        userId: new Types.ObjectId(userId),
        roomId: room._id,
        status: 'completed',
      });

      userHasPurchased = !!hasPurchased;
        console.log('Has Purchased:', userHasPurchased);
      }

      // رسالة الدفع فقط للمستخدمين غير المشترين وغير الـ creator
      if (!isCreator && !userHasPurchased) {
        console.log('Throwing Forbidden Exception');
        throw new ForbiddenException('Payment required to join this session.');
      }
    }

    // Check max participants limit
    if (room.maxParticipants !== null) {
      const livekitRoom = await this.roomServiceClient.listRooms([room.name]);
      if (livekitRoom.length > 0 && livekitRoom[0].numParticipants >= room.maxParticipants) {
        throw new ForbiddenException('Room is full. Maximum participants reached.');
      }
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
      // Filter out non-ObjectId values (like email addresses) and only keep valid ObjectIds
      const validObjectIds = room.invitedUsers.filter(id => 
        Types.ObjectId.isValid(id.toString())
      );
      
      if (validObjectIds.length > 0) {
        const userIds = validObjectIds.map(id => id.toString());
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('username firstName lastName email avatar')
        .exec();
      
      // Replace ObjectIds with user objects
      room.invitedUsers = users as any;
      } else {
        // If no valid ObjectIds, set to empty array
        room.invitedUsers = [];
      }
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

    // Return room with userHasPurchased status
    const roomWithPurchaseStatus = room as LivekitRoomDocument & { userHasPurchased?: boolean };
    roomWithPurchaseStatus.userHasPurchased = userHasPurchased;
    return roomWithPurchaseStatus;
  }

  async joinPrivateRoom(
    roomId: string,
    userId: string,
  ): Promise<{ token: string } & Omit<LivekitRoom, 'secretId'> & { userHasPurchased?: boolean }> {
    try {
      const room = await this.roomModel
        .findById(roomId)
        .populate('createdBy', 'username firstName lastName email avatar')
        .exec();

      if (!room) {
        throw new NotFoundException('Room not found or inactive');
      }

      // For private rooms, a secretId is essential for LiveKit. If a private room somehow lacks one, it's an invalid state.
      if (room.isPrivate && !room.secretId) {
        throw new BadRequestException('Private room is misconfigured: missing secret ID.');
      }

      // Check if user is creator or invited
      const isCreator = room.createdBy._id.toString() === userId;
      const isInvited = room.invitedUsers.some(invitedUserId => invitedUserId.toString() === userId);

      if (!isCreator && !isInvited) {
        throw new ForbiddenException('You are not authorized to join this private room.');
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

      // Payment check for paid rooms
      let userHasPurchased = false;
      if (room.isPaid) {
        const isCreatorOrPurchased = isCreator || await this.meetingPurchaseModel.exists({
          userId: new Types.ObjectId(userId),
          roomId: room._id,
          status: PurchaseStatus.COMPLETED,
        });

        userHasPurchased = !!isCreatorOrPurchased;

        if (!userHasPurchased) {
          throw new ForbiddenException('Payment required to join this session.');
        }
      }

      // Max participants check
      if (room.maxParticipants !== Number.MAX_SAFE_INTEGER) {
        const livekitRoom = await this.roomServiceClient.listRooms([room.name]);
        if (livekitRoom.length > 0 && livekitRoom[0].numParticipants >= room.maxParticipants) {
          throw new ForbiddenException('Room is full. Maximum participants reached.');
        }
      }

      // Generate LiveKit token
      const user = await this.userModel.findById(userId).select('username firstName lastName email avatar');
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Determine LiveKit room name based on room type
      const livekitRoomName = room.isPrivate && room.secretId 
        ? room.secretId 
        : (room._id as Types.ObjectId).toString();
        
      const apiKey = this.livekitApiKey;
      const apiSecret = this.livekitApiSecret;

      if (!apiKey || !apiSecret) {
        throw new BadRequestException('LiveKit API key/secret not configured.');
      }

      // Ensure room exists on LiveKit server
      const livekitClient = this.roomServiceClient;
      await this.ensureRoomExists(livekitClient, livekitRoomName, room.name);

      // Store or update session in DB
      let session = await this.sessionModel.findOne({ roomId: (room._id as Types.ObjectId) });
      if (!session) {
        session = new this.sessionModel({
          room: livekitRoomName,
          roomId: (room._id as Types.ObjectId),
          participants: [],
        });
      }

      const isFirstParticipant = session.participants.length === 0;
      const existingParticipant = session.participants.find(p => p.userId.toString() === userId);

      if (!existingParticipant) {
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

        if (isFirstParticipant) {
          await this.roomModel.findByIdAndUpdate(room._id, {
            actualStartTime: new Date(),
          });
        }
      } else if (!existingParticipant.isActive) {
        existingParticipant.isActive = true;
        existingParticipant.joinedAt = new Date();
        existingParticipant.leftAt = undefined;
      }
      await session.save();

      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId.toString(),
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
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
      const token = await at.toJwt();

      const roomWithPurchaseStatus = room as LivekitRoomDocument & { userHasPurchased?: boolean };
      roomWithPurchaseStatus.userHasPurchased = userHasPurchased;

      return { token, ...roomWithPurchaseStatus.toObject() };

    } catch (error) {
      console.error('Error in joinPrivateRoom service:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to join private room: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

  private buildSortStage(sortBy: string, sortOrder: string): Record<string, 1 | -1> {
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'createdAt':
        return { createdAt: sortDirection };
      case 'name':
        return { name: sortDirection };
      case 'participants':
        return {
          participantSortScore: sortDirection
        };
      case 'price':
        return { 
          priceSortScore: sortDirection,
          createdAt: sortDirection // Tie-breaker for price
        };
      case 'rating':
        return {
          averageRating: sortDirection,
          ratingCount: sortDirection
        };
      default:
        return { createdAt: -1 };
    }
  }

  async discoverSessions(
    query: DiscoverSessionsQueryDto,
    userId: string,
  ): Promise<DiscoverSessionsResponseDto> {
    const {
      page = 1,
      limit = 10,
      search,
      type = 'all',
      status = 'all',
      isPaid,
      minPrice,
      maxPrice,
      currency,
      scheduledAfter,
      scheduledBefore,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const matchStage: any = {};

    if (type === 'public') {
      matchStage.isPrivate = false;
    } else if (type === 'private') {
      matchStage.isPrivate = true;
      matchStage.invitedUsers = new Types.ObjectId(userId);
    }

    if (status === 'active') {
      matchStage.isActive = true;
      matchStage.cancelledAt = { $exists: false }; // استبعاد الغرف الملغية
    } else if (status === 'scheduled') {
      matchStage.scheduledStartTime = { $gt: new Date() };
      matchStage.cancelledAt = { $exists: false }; // استبعاد الغرف الملغية
    } else if (status === 'ended') {
      matchStage.endedDate = { $exists: true };
      matchStage.cancelledAt = { $exists: false }; // استبعاد الغرف الملغية
    }
    
    if (status === 'cancelled') {
      matchStage.cancelledAt = { $exists: true }; // فقط الغرف الملغية
    } else if (status === 'all') {
      matchStage.endedDate = { $exists: false };
      matchStage.cancelledAt = { $exists: false }; // استبعاد الغرف الملغية
    }

    if (isPaid !== undefined) {
      matchStage.$or = [
        { isPaid: isPaid },
        ...(isPaid === false ? [{ isPaid: { $exists: false } }] : [])
      ];
    }

    // فلترة حسب السعر والعملة (تعمل فقط مع الجلسات المدفوعة)
    if ((minPrice !== undefined || maxPrice !== undefined) && (isPaid === true)) {
      matchStage.isPaid = true; // تأكيد أن الفلترة بالسعر تعمل فقط على المدفوع
    }

    if (minPrice !== undefined) {
      matchStage.price = { ...matchStage.price, $gte: minPrice };
    }
    if (maxPrice !== undefined) {
      matchStage.price = { ...matchStage.price, $lte: maxPrice };
    }
    // Remove currency filtering, as it's always USD now
    // if (currency) {
    //   matchStage.currency = currency;
    // }

    // إضافة فلتر isPaid: true عندما يكون الترتيب حسب السعر
    if (sortBy === 'price') {
      matchStage.isPaid = true;
      matchStage.price = { ...matchStage.price, $exists: true, $gt: 0 };
    }

    if (scheduledAfter) {
      matchStage.scheduledStartTime = {
        ...matchStage.scheduledStartTime,
        $gte: new Date(scheduledAfter),
      };
    }
    if (scheduledBefore) {
      matchStage.scheduledStartTime = {
        ...matchStage.scheduledStartTime,
        $lte: new Date(scheduledBefore),
      };
    }

    if (search) {
      matchStage.$and = matchStage.$and || [];
      matchStage.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const pipeline: any[] = [
      { $match: matchStage },
      // جلب معلومات المستخدم المنشئ
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creatorInfo',
        },
      },
      { $unwind: '$creatorInfo' },

      // جلب معلومات المستخدمين المدعوين
      {
        $lookup: {
          from: 'users',
          localField: 'invitedUsers',
          foreignField: '_id',
          as: 'invitedUsersInfo',
        },
      },

      {
        $lookup: {
          from: 'ratings',
          localField: '_id',
          foreignField: 'roomId',
          as: 'ratings',
        },
      },

      {
        $addFields: {
          averageRating: {
            $cond: {
              if: { $gt: [{ $size: '$ratings' }, 0] },
              then: {
                $avg: '$ratings.rating',
              },
              else: null,
            },
          },
          ratingCount: { $size: '$ratings' },
        },
      },

      {
        $lookup: {
          from: 'livekitsessions',
          localField: '_id',
          foreignField: 'roomId',
          as: 'sessionInfo',
        },
      },

      // جلب معلومات المشتريات
      {
        $lookup: {
          from: 'meetingpurchases',
          let: { roomId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$roomId', '$$roomId'] },
                    { $eq: ['$status', 'completed'] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'userInfo'
              }
            },
            {
              $unwind: {
                path: '$userInfo',
                preserveNullAndEmptyArrays: true
              }
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                amountPaid: 1,
                purchaseDate: 1,
                userInfo: {
                  _id: '$userInfo._id',
                  username: '$userInfo.username',
                  firstName: '$userInfo.firstName',
                  lastName: '$userInfo.lastName',
                  avatar: '$userInfo.avatar'
                }
              }
            },
            {
              $sort: { purchaseDate: -1 }
            }
          ],
          as: 'purchases',
        },
      },
      {
        $addFields: {
          currentParticipants: {
            $cond: {
              if: { $gt: [{ $size: '$sessionInfo' }, 0] },
              then: {
                $size: {
                  $filter: {
                    input: { $arrayElemAt: ['$sessionInfo.participants', 0] },
                    cond: '$$this.isActive',
                  },
                },
              },
              else: 0,
            },
          },
          totalParticipantsJoined: {
            $cond: {
              if: { $gt: [{ $size: '$sessionInfo' }, 0] },
              then: { $size: { $arrayElemAt: ['$sessionInfo.participants', 0] } },
              else: 0,
            },
          },
          participantSortScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$currentParticipants', 0] }, 1000000] },
              { $multiply: [{ $ifNull: ['$totalParticipantsJoined', 0] }, 1000] },
              { $subtract: [Number.MAX_SAFE_INTEGER, { $ifNull: ['$maxParticipants', Number.MAX_SAFE_INTEGER] }] },
              { $divide: [ { $toLong: "$createdAt" }, 1000000000000 ] }
            ]
          },
          priceSortScore: {
            $cond: {
              if: { $eq: ['$isPaid', false] },
              then: 0,
              else: { $ifNull: ['$price', 0] }
            }
          },
          completedPurchasesCount: { $size: '$purchases' },
          recentPurchasers: {
            $slice: [
              {
                $map: {
                  input: '$purchases',
                  as: 'purchase',
                  in: {
                    userId: '$$purchase.userId',
                    username: '$$purchase.userInfo.username',
                    firstName: '$$purchase.userInfo.firstName',
                    lastName: '$$purchase.userInfo.lastName',
                    avatar: '$$purchase.userInfo.avatar',
                    purchasedAt: '$$purchase.purchaseDate'
                  }
                }
              },
              3
            ]
          }
        },
      },

      // ترتيب النتائج
      {
        $sort: this.buildSortStage(sortBy, sortOrder),
      },

      // إزالة حقول الترتيب المضافة
      { $unset: ["participantSortScore", "priceSortScore"] },

      // تصفح النتائج
      { $skip: skip },
      { $limit: limit },

      // تشكيل الاستجابة النهائية
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          isPrivate: 1,
          isPaid: 1,
          price: 1,
          currency: 1,
          maxParticipants: 1,
          currentParticipants: 1,
          isActive: 1,
          scheduledStartTime: 1,
          actualStartTime: 1,
          endedDate: 1,
          createdAt: 1,
          updatedAt: 1,
          createdBy: {
            _id: '$creatorInfo._id',
            username: '$creatorInfo.username',
            firstName: '$creatorInfo.firstName',
            lastName: '$creatorInfo.lastName',
            avatar: '$creatorInfo.avatar',
            email: '$creatorInfo.email',
          },
          invitedUsers: {
            $map: {
              input: '$invitedUsersInfo',
              as: 'user',
              in: {
                _id: '$$user._id',
                username: '$$user.username',
                firstName: '$$user.firstName',
                lastName: '$$user.lastName',
                avatar: '$$user.avatar',
                email: '$$user.email',
              },
            },
          },
          totalParticipantsJoined: 1,
          averageRating: 1,
          ratingCount: 1,
          completedPurchasesCount: 1,
          recentPurchasers: 1
        },
      },
    ];

    const aggregationOptions: any = {};
    if (sortBy === 'name') {
      aggregationOptions.collation = {
        locale: 'en',
        strength: 1
      };
    }

    const sessions = await this.roomModel.aggregate(pipeline, aggregationOptions).exec();

    const totalCount = await this.roomModel.countDocuments(matchStage);
    const totalPages = Math.ceil(totalCount / limit);

    const filters = await this.calculateFilters();

    return {
      sessions,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters,
    };
  }

  private async calculateFilters(): Promise<DiscoverSessionsFiltersDto> {
    // حساب الإحصائيات المختلفة
    const [
      totalPaidSessions,
      totalFreeSessions,
      totalScheduledSessions,
      totalActiveSessions,
      totalCancelledSessions,
      priceRange,
      availableCurrencies,
    ] = await Promise.all([
      // عدد الجلسات المدفوعة
      this.roomModel.countDocuments({ isPaid: true }),

      // عدد الجلسات المجانية
      this.roomModel.countDocuments({ 
        $or: [
          { isPaid: false },
          { isPaid: { $exists: false } }
        ],
        isActive: true, // فقط الجلسات النشطة
        endedDate: { $exists: false } // واستبعاد الجلسات المنتهية
      }),

      // عدد الجلسات المجدولة
      this.roomModel.countDocuments({ scheduledStartTime: { $gt: new Date() } }),

      // عدد الجلسات النشطة
      this.roomModel.countDocuments({ 
        isActive: true, 
        endedDate: { $exists: false },
        cancelledAt: { $exists: false }
      }),

      // عدد الجلسات الملغية
      this.roomModel.countDocuments({ 
        cancelledAt: { $exists: true }
      }),

      // نطاق الأسعار للجلسات المدفوعة
      this.roomModel.aggregate([
        { $match: { isPaid: true, price: { $exists: true, $gt: 0 } } },
        {
          $group: {
            _id: null,
            min: { $min: '$price' },
            max: { $max: '$price' },
          },
        },
      ]).then((result) => result[0] || { min: 0, max: 0 }),

      // العملات المتاحة للجلسات المدفوعة
      // this.roomModel.distinct('currency', { isPaid: true }), // Removed currency distinct
      [] // Return an empty array or just ['USD'] if needed
    ]);

    console.log('Free Sessions Count:', totalFreeSessions);
    console.log('Paid Sessions Count:', totalPaidSessions);

    return {
      availableTypes: ['public', 'private', 'all'],
      availableStatuses: ['active', 'scheduled', 'ended', 'cancelled', 'all'],
      availableCurrencies: ['USD'], // Always return USD
      totalPaidSessions,
      totalFreeSessions,
      totalScheduledSessions,
      totalActiveSessions,
      priceRange: {
        min: priceRange.min || 0,
        max: priceRange.max || 0,
      },
    };
  }
}
