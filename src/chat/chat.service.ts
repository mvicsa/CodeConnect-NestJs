import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatRoom, ChatRoomDocument } from './schemas/chat-room.schema';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoomDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async createMessage(userId: string, dto: CreateMessageDto) {
    console.log('[SERVICE] Creating message with data:', { userId, dto });
    // Validate room membership (optional: can be added for security)
    const message = new this.messageModel({
      chatRoom: new Types.ObjectId(dto.roomId), // Convert to ObjectId
      sender: new Types.ObjectId(userId),
      content: dto.content,
      type: dto.type,
      fileUrl: dto.fileUrl,
      fileData: dto.fileData,
      codeData: dto.codeData,
      replyTo: dto.replyTo,
      userReactions: [],
      reactions: { like: 0, love: 0, wow: 0, funny: 0, dislike: 0, happy: 0 },
      seenBy: [userId],
      pinned: false,
    });
    console.log('[SERVICE] Message model created:', message);
    await message.save();
    console.log('[SERVICE] Message saved to database with ID:', message._id);

    // Return populated message
    const populatedMessage = await this.messageModel
      .findById(message._id)
      .populate({ path: 'sender', select: '-password' })
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: '-password' },
      })
      .populate({
        path: 'userReactions.userId',
        select: '_id username firstName lastName avatar role',
      })
      .lean()
      .exec();
    
    console.log('[SERVICE] Populated message returned:', populatedMessage);
    return populatedMessage;
  }

  async markMessagesAsSeen(userId: string, messageIds: string[]) {
    console.log('[SERVICE] Marking messages as seen:', { userId, messageIds });
    try {
      const userObjectId = new Types.ObjectId(userId);
      const messageObjectIds = messageIds.map((id) => new Types.ObjectId(id));
      const result = await this.messageModel
        .updateMany(
          { _id: { $in: messageObjectIds }, seenBy: { $ne: userObjectId } },
          { $addToSet: { seenBy: userObjectId } },
        )
        .exec();
      console.log('[SERVICE] Messages marked as seen:', result);
      return result;
    } catch (error) {
      console.error('[SERVICE] Error marking messages as seen:', error);
      throw error;
    }
  }

  async deleteMessage(userId: string, messageId: string, forAll: boolean) {
    console.log('[SERVICE] Deleting message:', { userId, messageId, forAll });
    const messageObjectId = new Types.ObjectId(messageId);
    try {
      if (forAll) {
        // Mark as deleted for all users
        const result = await this.messageModel
          .findByIdAndUpdate(
            messageObjectId,
            {
              deleted: true,
              content: '',
              fileUrl: '',
              deletedAt: new Date(),
              deletedBy: new Types.ObjectId(userId),
            },
            { new: true },
          )
          .exec();
        console.log('[SERVICE] Message marked as deleted for all:', result);
        return result;
      } else {
        // Mark as deleted for specific user
        const result = await this.messageModel
          .findByIdAndUpdate(
            messageObjectId,
            {
              $addToSet: {
                deletedFor: new Types.ObjectId(userId),
              },
            },
            { new: true },
          )
          .exec();
        console.log('[SERVICE] Message marked as deleted for user:', result);
        return result;
      }
    } catch (error) {
      console.error('[SERVICE] Error deleting message:', error);
      throw error;
    }
  }

  async editMessage(userId: string, messageId: string, updates: any) {
    console.log('[SERVICE] Editing message:', { userId, messageId, updates });
    
    try {
      // Check if user is the sender of the message
      const message = await this.messageModel.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }
      
      if (message.sender.toString() !== userId) {
        throw new Error('Unauthorized to edit this message');
      }
      
      // Update the message with the new data and mark as edited
      const updatedMessage = await this.messageModel
        .findByIdAndUpdate(
          messageId,
          { $set: { ...updates, edited: true } },
          { new: true }
        )
        .populate({ path: 'sender', select: '-password' })
        .populate({
          path: 'replyTo',
          populate: { path: 'sender', select: '-password' },
        })
        .lean()
        .exec();
      
      console.log('[SERVICE] Message edited successfully:', updatedMessage);
      return updatedMessage;
    } catch (error) {
      console.error('[SERVICE] Error editing message:', error);
      throw error;
    }
  }

  async addOrUpdateReaction(
    messageId: string,
    userId: string,
    reaction: string,
  ): Promise<{ message: any; action: 'add' | 'remove' }> {
    const message = await this.messageModel.findById(messageId);
    if (!message) throw new Error('Message not found');

    const allowedReactions = ['like', 'love', 'wow', 'funny', 'dislike', 'happy'];
    if (!allowedReactions.includes(reaction)) {
      throw new Error('Invalid reaction type');
    }

    const userObjectId = new Types.ObjectId(userId);

    // Normalize legacy data for old messages
    const normalizedUserReactions: any[] = Array.isArray(message.userReactions)
      ? message.userReactions.map((ur: any) => ({
          userId:
            ur?.userId instanceof Types.ObjectId
              ? ur.userId
              : new Types.ObjectId(ur.userId),
          reaction: ur?.reaction,
          createdAt: ur?.createdAt ? new Date(ur.createdAt) : new Date(),
        }))
      : [];

    const existing = normalizedUserReactions.find((ur: any) =>
      userObjectId.equals(ur.userId),
    );

    let action: 'add' | 'remove';
    let updatedUserReactions = normalizedUserReactions.filter(
      (ur: any) => !userObjectId.equals(ur.userId),
    );

    if (existing && existing.reaction === reaction) {
      action = 'remove';
    } else {
      updatedUserReactions.push({
        userId: userObjectId,
        reaction,
        createdAt: new Date(),
      } as any);
      action = 'add';
    }

    const reactionsCount = allowedReactions.reduce((acc: any, type) => {
      acc[type] = updatedUserReactions.filter((ur: any) => ur.reaction === type).length;
      return acc;
    }, {} as any);

    // Atomic update to ensure persistence and correct shape (object, not array)
    const updated = await this.messageModel
      .findByIdAndUpdate(
        messageId,
        {
          $set: {
            userReactions: updatedUserReactions,
            reactions: {
              like: reactionsCount.like || 0,
              love: reactionsCount.love || 0,
              wow: reactionsCount.wow || 0,
              funny: reactionsCount.funny || 0,
              dislike: reactionsCount.dislike || 0,
              happy: reactionsCount.happy || 0,
            },
          },
        },
        { new: true },
      )
      .populate('sender', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id username firstName lastName avatar role',
      })
      .exec();

    return { message: updated, action };
  }

  /**
   * Calculate lastActivity dynamically for a chat room
   * Returns the most recent activity (message or reaction)
   */
  async calculateLastActivity(roomId: string) {
    const roomObjectId = new Types.ObjectId(roomId);
    
    // Get the latest message in the room
    const latestMessage = await this.messageModel
      .findOne({ chatRoom: roomObjectId })
      .sort({ createdAt: -1 })
      .populate({ path: 'sender', select: 'username firstName lastName avatar' })
      .lean()
      .exec();

    // Find the latest reaction across all messages in the room
    const messagesWithReactions = await this.messageModel
      .find({ 
        chatRoom: roomObjectId,
        'userReactions.0': { $exists: true } // Only messages that have reactions
      })
      .sort({ 'userReactions.createdAt': -1 }) // ترتيب حسب آخر تفاعل
      .lean()
      .exec();

    let latestReaction: any = null;
    let latestReactionTime: Date | null = null;

    // Find the most recent reaction
    for (const message of messagesWithReactions) {
      if (message.userReactions && Array.isArray(message.userReactions)) {
        for (const userReaction of message.userReactions) {
          const reactionTime = new Date((userReaction as any).createdAt);
          
          if (!latestReactionTime || reactionTime > latestReactionTime) {
            latestReactionTime = reactionTime;
            latestReaction = {
              type: 'reaction' as const,
              time: reactionTime,
              messageId: message._id,
              reaction: (userReaction as any).reaction,
              userId: (userReaction as any).userId,
            };
          }
        }
      }
    }

    // جمع كل الأنشطة
    const activities = [
      latestReaction ? { ...latestReaction } : null,
      (latestMessage && (latestMessage as any).deleted) ? {
        type: 'deletion',
        time: (latestMessage as any).updatedAt || new Date(),
        messageId: (latestMessage as any)._id,
        displayText: 'Message deleted'
      } : null,
      latestMessage ? {
        type: 'message',
        time: new Date((latestMessage as any).createdAt),
        messageId: latestMessage._id,
        message: latestMessage
      } : null
    ].filter(Boolean);

    // ترتيب الأنشطة حسب التوقيت
    const sortedActivities = activities.sort((a, b) => 
      new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    // إرجاع أحدث نشاط
    if (sortedActivities.length > 0) {
      const topActivity = sortedActivities[0];
      
      // إذا كان Reaction، نحتاج استرجاع معلومات المستخدم
      if (topActivity.type === 'reaction') {
        const User = this.messageModel.db.model('User');
        const populatedUser = await User.findById(topActivity.userId)
          .select('username firstName lastName avatar')
          .lean()
          .exec();
        
        return {
          ...topActivity,
          userId: populatedUser
        };
      }
      
      return topActivity;
    }

    // إذا لم يوجد أي نشاط، نحاول إرجاع وقت إنشاء الغرفة
    const room = await this.chatRoomModel.findById(roomObjectId).lean().exec();
    if (room) {
      return {
        type: 'message' as const,
        time: (room as any).createdAt || new Date(),
        messageId: null,
        message: null,
        isRoomCreation: true
      };
    }
    
    return null;
  }

  async createGroup(
    creatorId: string,
    title: string,
    avatar: string,
    memberIds: string[],
  ) {
    // Create a group chat room
    const group = new this.chatRoomModel({
      type: 'group',
      members: [creatorId, ...memberIds],
      createdBy: creatorId,
      groupTitle: title,
      groupAvatar: avatar,
      admins: [creatorId],
    });
    await group.save();
    return group;
  }

  async updateGroupInfo(roomId: string, title?: string, avatar?: string) {
    const update: any = {};
    if (title) update.groupTitle = title;
    if (avatar) update.groupAvatar = avatar;
    return this.chatRoomModel
      .findByIdAndUpdate(roomId, update, { new: true })
      .exec();
  }

  async addGroupMember(roomId: string, userId: string) {
    return this.chatRoomModel
      .findByIdAndUpdate(
        roomId,
        { $addToSet: { members: userId } },
        { new: true },
      )
      .exec();
  }

  async removeGroupMember(roomId: string, userId: string) {
    return this.chatRoomModel
      .findByIdAndUpdate(
        roomId,
        { $pull: { members: userId, admins: userId } },
        { new: true },
      )
      .exec();
  }

  async getPaginatedMessages(
    roomId: string,
    limit: number = 50,
    before?: string,
  ) {
    console.log('[SERVICE] Getting paginated messages:', {
      roomId,
      limit,
      before,
    });

    try {
      const query: any = { chatRoom: new Types.ObjectId(roomId) };

      // Add before condition if provided
      if (before) {
        const beforeObjectId = new Types.ObjectId(before);
        query._id = { $lt: beforeObjectId };
      }

      const messages = await this.messageModel
        .find(query)
        .sort({ _id: -1 }) // Sort by _id descending (newest first)
        .limit(limit)
        .populate('sender', '-password')
        .populate({
          path: 'replyTo',
          populate: { path: 'sender', select: '-password' },
        })
        .populate({
          path: 'userReactions.userId',
        select: '_id username firstName lastName avatar role',
        })
        .lean()
        .exec();

      console.log('[SERVICE] Found messages:', messages.length);
      return messages;
    } catch (error) {
      console.error('[SERVICE] Error getting paginated messages:', error);
      throw error;
    }
  }

  async pinMessage(roomId: string, messageId: string) {
    await this.chatRoomModel
      .findByIdAndUpdate(roomId, { $addToSet: { pinnedMessages: messageId } })
      .exec();
    await this.messageModel
      .findByIdAndUpdate(messageId, { pinned: true })
      .exec();
  }

  async unpinMessage(roomId: string, messageId: string) {
    await this.chatRoomModel
      .findByIdAndUpdate(roomId, { $pull: { pinnedMessages: messageId } })
      .exec();
    await this.messageModel
      .findByIdAndUpdate(messageId, { pinned: false })
      .exec();
  }

  async getUserChatRooms(userId: string) {
    // First get all rooms the user is a member of
    const rooms = await this.chatRoomModel
      .find({ members: userId })
      .populate({
        path: 'members',
        select: '-password',
      })
      .populate({
        path: 'createdBy',
        select: '-password',
      })
      .populate({
        path: 'admins',
        select: '-password',
      })
      .populate({
        path: 'pinnedMessages',
        populate: [
          { path: 'sender', select: '-password' },
          { path: 'replyTo' },
        ],
      })
      .lean()
      .exec();

    // For each room, get the latest messages
    const roomsWithMessages = await Promise.all(
      rooms.map(async (room) => {
        const messages = await this.messageModel
          .find({ chatRoom: room._id })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate({ path: 'sender', select: '-password' })
          .populate({
            path: 'replyTo',
            populate: { path: 'sender', select: '-password' },
          })
          .lean()
          .exec();

        // Calculate unread count for this user
        const unreadCount = await this.messageModel.countDocuments({
          chatRoom: room._id,
          seenBy: { $ne: userId },
          sender: { $ne: userId },
        });

        // Calculate lastActivity dynamically
        const lastActivity = await this.calculateLastActivity(room._id.toString());

        return {
          ...room,
          messages: messages.reverse(), // Return messages in chronological order
          unreadCount,
          lastMessage: messages[0] || null,
          lastActivity,
        };
      }),
    );

    return roomsWithMessages;
  }

  /**
   * Backfill old messages that are missing reaction fields.
   * - Ensures userReactions is an array
   * - Ensures reactions object exists with all counters set to 0
   */
  async migrateMissingReactionsFields() {
    const zeroReactions = {
      like: 0,
      love: 0,
      wow: 0,
      funny: 0,
      dislike: 0,
      happy: 0,
    } as any;

    // Initialize missing userReactions to empty array
    const initUserReactions = await this.messageModel.updateMany(
      { $or: [ { userReactions: { $exists: false } }, { userReactions: null } ] },
      { $set: { userReactions: [] } },
    ).exec();

    // Initialize missing reactions object
    const initReactions = await this.messageModel.updateMany(
      { $or: [ { reactions: { $exists: false } }, { reactions: null } ] },
      { $set: { reactions: zeroReactions } },
    ).exec();

    return { initUserReactions, initReactions };
  }

  async createPrivateRoom(senderId: string, receiverId: string) {
    console.log('[SERVICE] Creating private room between:', {
      senderId,
      receiverId,
    });
    try {
      // Find a private room where members contains only these two users (in any order), or just one of them
      let existingRoom = await this.chatRoomModel.findOne({
        type: 'private',
        $or: [
          {
            members: [
              new Types.ObjectId(senderId),
              new Types.ObjectId(receiverId),
            ],
          },
          {
            members: [
              new Types.ObjectId(receiverId),
              new Types.ObjectId(senderId),
            ],
          },
          { members: [new Types.ObjectId(senderId)] },
          { members: [new Types.ObjectId(receiverId)] },
        ],
      });

      console.log('[SERVICE] senderId:', senderId, 'receiverId:', receiverId);
      if (existingRoom) {
        console.log('[SERVICE] Found existing private room:', existingRoom._id);
        const memberIds = existingRoom.members.map((m: any) => m.toString());
        if (!memberIds.includes(senderId.toString())) {
          existingRoom.members.push(new Types.ObjectId(senderId));
        }
        if (!memberIds.includes(receiverId.toString())) {
          existingRoom.members.push(new Types.ObjectId(receiverId));
        }
        await existingRoom.save();
        console.log('[SERVICE] Updated members:', existingRoom.members);
        return existingRoom;
      }

      // Create new private room
      const newRoom = new this.chatRoomModel({
        type: 'private',
        members: [new Types.ObjectId(senderId), new Types.ObjectId(receiverId)],
        createdBy: new Types.ObjectId(senderId),
        groupTitle: null,
        groupAvatar: null,
        admins: [],
        pinnedMessages: [],
      });

      await newRoom.save();
      console.log('[SERVICE] New private room created:', newRoom._id);
      return newRoom;
    } catch (error) {
      console.error('[SERVICE] Error creating private room:', error);
      throw error;
    }
  }
  /**
   * Remove a user from a chat room. If the last member leaves, delete the room.
   */
  async removeUserFromRoom(roomId: string, userId: string) {
    const room = await this.chatRoomModel.findById(roomId);
    if (!room) throw new Error('Room not found');
    // Remove user from members
    room.members = room.members.filter((m: any) => m.toString() !== userId);
    // Also remove from admins if present
    if (room.admins) {
      room.admins = room.admins.filter((a: any) => a.toString() !== userId);
    }
    await room.save();
    console.log(
      `[SERVICE] User ${userId} removed from room ${roomId}. Remaining members:`,
      room.members,
    );
    // If no members left, delete the room and its messages
    if (room.members.length === 0) {
      await this.messageModel.deleteMany({ chatRoom: room._id });
      await this.chatRoomModel.findByIdAndDelete(room._id);
      console.log(
        `[SERVICE] Room ${roomId} deleted from DB because all users left.`,
      );
      return { deleted: true };
    }
    return { deleted: false };
  }

  async checkOlderMessagesExist(roomId: string, beforeMessageId: string): Promise<boolean> {
    try {
      const query = {
        chatRoom: new Types.ObjectId(roomId),
        _id: { $lt: new Types.ObjectId(beforeMessageId) }
      };
      
      const olderMessage = await this.messageModel
        .findOne(query)
        .select('_id')
        .lean()
        .exec();
      
      return !!olderMessage;
    } catch (error) {
      console.error('[SERVICE] Error checking older messages:', error);
      return false;
    }
  }

  // Chat business logic will be implemented here
}
