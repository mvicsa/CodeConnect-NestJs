import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatRoomDocument = ChatRoom & Document;

export enum ChatRoomType {
  PRIVATE = 'private',
  GROUP = 'group',
}

@Schema({ timestamps: true })
export class ChatRoom {
  @Prop({ required: true, enum: ChatRoomType })
  type: ChatRoomType;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  members: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ default: null })
  groupTitle?: string;

  @Prop({ default: null })
  groupAvatar?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins?: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Message' }], default: [] })
  pinnedMessages?: Types.ObjectId[];
}

export const ChatRoomSchema = SchemaFactory.createForClass(ChatRoom); 