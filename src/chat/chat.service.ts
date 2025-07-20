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
    // Validate room membership (optional: can be added for security)
    const message = new this.messageModel({
      chatRoom: new Types.ObjectId(dto.roomId),  // Convert to ObjectId
      sender: new Types.ObjectId(userId),
      content: dto.content,
      type: dto.type,
      fileUrl: dto.fileUrl,
      replyTo: dto.replyTo,
      reactions: [],
      seenBy: [userId],
      pinned: false,
    });
    await message.save();

    // Return populated message
    return this.messageModel.findById(message._id)
      .populate({ path: 'sender', select: '-password' })
      .populate({ 
        path: 'replyTo',
        populate: { path: 'sender', select: '-password' }
      })
      .lean()
      .exec();
  }

  async markMessagesAsSeen(userId: string, messageIds: string[]) {
    console.log('[SERVICE] Marking messages as seen:', { userId, messageIds });
    try {
      const userObjectId = new Types.ObjectId(userId);
      const messageObjectIds = messageIds.map(id => new Types.ObjectId(id));
      const result = await this.messageModel.updateMany(
        { _id: { $in: messageObjectIds }, seenBy: { $ne: userObjectId } },
        { $addToSet: { seenBy: userObjectId } }
      ).exec();
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
        const result = await this.messageModel.findByIdAndUpdate(
          messageObjectId,
          { 
            deleted: true,
            content: '',
            fileUrl: '',
            deletedAt: new Date(),
            deletedBy: new Types.ObjectId(userId)
          },
          { new: true }
        ).exec();
        console.log('[SERVICE] Message marked as deleted for all:', result);
        return result;
      } else {
        // Mark as deleted for specific user
        const result = await this.messageModel.findByIdAndUpdate(
          messageObjectId,
          { 
            $addToSet: { 
              deletedFor: new Types.ObjectId(userId)
            }
          },
          { new: true }
        ).exec();
        console.log('[SERVICE] Message marked as deleted for user:', result);
        return result;
      }
    } catch (error) {
      console.error('[SERVICE] Error deleting message:', error);
      throw error;
    }
  }

  async reactToMessage(userId: string, messageId: string, emoji: string) {
    // Remove previous reaction by this user, then add new one
    await this.messageModel.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { user: userId } } },
    ).exec();
    await this.messageModel.findByIdAndUpdate(
      messageId,
      { $push: { reactions: { user: userId, emoji } } },
    ).exec();
    // Return populated message
    return this.messageModel.findById(messageId)
      .populate({ path: 'sender', select: '-password' })
      .populate({ 
        path: 'replyTo',
        populate: { path: 'sender', select: '-password' }
      })
      .populate({
        path: 'reactions.user',
        select: '-password'
      })
      .lean()
      .exec();
  }

  async createGroup(creatorId: string, title: string, avatar: string, memberIds: string[]) {
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
    return this.chatRoomModel.findByIdAndUpdate(roomId, update, { new: true }).exec();
  }

  async addGroupMember(roomId: string, userId: string) {
    return this.chatRoomModel.findByIdAndUpdate(
      roomId,
      { $addToSet: { members: userId } },
      { new: true }
    ).exec();
  }

  async removeGroupMember(roomId: string, userId: string) {
    return this.chatRoomModel.findByIdAndUpdate(
      roomId,
      { $pull: { members: userId, admins: userId } },
      { new: true }
    ).exec();
  }

  async getPaginatedMessages(roomId: string, limit: number = 50, before?: string) {
    console.log('[SERVICE] Getting paginated messages:', { roomId, limit, before });
    
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
          populate: { path: 'sender', select: '-password' }
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
    await this.chatRoomModel.findByIdAndUpdate(
      roomId,
      { $addToSet: { pinnedMessages: messageId } }
    ).exec();
    await this.messageModel.findByIdAndUpdate(messageId, { pinned: true }).exec();
  }

  async unpinMessage(roomId: string, messageId: string) {
    await this.chatRoomModel.findByIdAndUpdate(
      roomId,
      { $pull: { pinnedMessages: messageId } }
    ).exec();
    await this.messageModel.findByIdAndUpdate(messageId, { pinned: false }).exec();
  }

  async getUserChatRooms(userId: string) {
    // First get all rooms the user is a member of
    const rooms = await this.chatRoomModel.find({ members: userId })
      .populate({ 
        path: 'members', 
        select: '-password' 
      })
      .populate({
        path: 'createdBy',
        select: '-password'
      })
      .populate({
        path: 'admins',
        select: '-password'
      })
      .populate({
        path: 'pinnedMessages',
        populate: [
          { path: 'sender', select: '-password' },
          { path: 'replyTo' }
        ]
      })
      .lean()
      .exec();

    // For each room, get the latest messages
    const roomsWithMessages = await Promise.all(rooms.map(async room => {
      const messages = await this.messageModel.find({ chatRoom: room._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate({ path: 'sender', select: '-password' })
        .populate({ 
          path: 'replyTo',
          populate: { path: 'sender', select: '-password' }
        })
        .lean()
        .exec();

      // Calculate unread count for this user
      const unreadCount = await this.messageModel.countDocuments({
        chatRoom: room._id,
        seenBy: { $ne: userId },
        sender: { $ne: userId }
      });

      return {
        ...room,
        messages: messages.reverse(), // Return messages in chronological order
        unreadCount,
        lastMessage: messages[0] || null
      };
    }));

    return roomsWithMessages;
  }

  async createPrivateRoom(senderId: string, receiverId: string) {
    console.log('[SERVICE] Creating private room between:', { senderId, receiverId });
    try {
      // Find a private room where members contains only these two users (in any order), or just one of them
      let existingRoom = await this.chatRoomModel.findOne({
        type: 'private',
        $or: [
          { members: [new Types.ObjectId(senderId), new Types.ObjectId(receiverId)] },
          { members: [new Types.ObjectId(receiverId), new Types.ObjectId(senderId)] },
          { members: [new Types.ObjectId(senderId)] },
          { members: [new Types.ObjectId(receiverId)] }
        ]
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
        members: [
          new Types.ObjectId(senderId),
          new Types.ObjectId(receiverId)
        ],
        createdBy: new Types.ObjectId(senderId),
        groupTitle: null,
        groupAvatar: null,
        admins: [],
        pinnedMessages: []
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
    console.log(`[SERVICE] User ${userId} removed from room ${roomId}. Remaining members:`, room.members);
    // If no members left, delete the room and its messages
    if (room.members.length === 0) {
      await this.messageModel.deleteMany({ chatRoom: room._id });
      await this.chatRoomModel.findByIdAndDelete(room._id);
      console.log(`[SERVICE] Room ${roomId} deleted from DB because all users left.`);
      return { deleted: true };
    }
    return { deleted: false };
  }

  // Chat business logic will be implemented here
} 