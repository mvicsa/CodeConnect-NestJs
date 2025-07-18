import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatRoom, ChatRoomDocument } from './schemas/chat-room.schema';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoomDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async getUserChatRooms(userId: string) {
    return this.chatRoomModel.find({ members: userId }).exec();
  }

  async createMessage(userId: string, dto: CreateMessageDto) {
    // Validate room membership (optional: can be added for security)
    const message = new this.messageModel({
      chatRoom: dto.roomId,
      sender: userId,
      content: dto.content,
      type: dto.type,
      fileUrl: dto.fileUrl,
      replyTo: dto.replyTo,
      reactions: [],
      seenBy: [userId],
      pinned: false,
    });
    await message.save();
    return message;
  }

  async markMessagesAsSeen(userId: string, messageIds: string[]) {
    // Update all messages to add userId to seenBy if not already present
    await this.messageModel.updateMany(
      { _id: { $in: messageIds }, seenBy: { $ne: userId } },
      { $addToSet: { seenBy: userId } }
    ).exec();
  }

  async deleteMessage(userId: string, messageId: string, forAll: boolean) {
    if (forAll) {
      // Delete for all: remove the message (or mark as deleted)
      await this.messageModel.findByIdAndUpdate(messageId, { content: '', fileUrl: '', deleted: true }).exec();
    } else {
      // Delete for me: add userId to deletedFor array
      await this.messageModel.findByIdAndUpdate(messageId, { $addToSet: { deletedFor: userId } }).exec();
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
    // Return updated message
    return this.messageModel.findById(messageId).exec();
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

  async getPaginatedMessages(roomId: string, limit: number, before?: string) {
    const query: any = { chatRoom: roomId };
    if (before) {
      // Support both timestamp and messageId as cursor
      if (before.match(/^[0-9a-fA-F]{24}$/)) {
        // before is a messageId
        query._id = { $lt: before };
      } else {
        // before is a timestamp
        query.createdAt = { $lt: new Date(before) };
      }
    }
    return this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
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

  // Chat business logic will be implemented here
} 