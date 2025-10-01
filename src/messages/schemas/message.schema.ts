import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file',
  CODE = 'code',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'ChatRoom', required: true })
  chatRoom: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({ type: String, enum: MessageType, required: true })
  type: MessageType;

  @Prop({ default: '' })
  content: string;

  @Prop({ default: null })
  fileUrl?: string;

  @Prop({ type: Object, default: null })
  fileData?: {
    name?: string;
    size?: number;
    type?: string;
  };

  @Prop({ type: Object, default: null })
  codeData?: {
    code: string;
    language: string;
  };

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  replyTo?: Types.ObjectId;

  @Prop({
    type: [{
      userId: { type: Types.ObjectId, ref: 'User' },
      reaction: String,
      createdAt: { type: Date, default: Date.now }
    }],
    default: [],
  })
  userReactions: { userId: Types.ObjectId; reaction: string; createdAt: Date }[];

  @Prop({
    type: {
      like: { type: Number, default: 0 },
      love: { type: Number, default: 0 },
      wow: { type: Number, default: 0 },
      funny: { type: Number, default: 0 },
      dislike: { type: Number, default: 0 },
      happy: { type: Number, default: 0 },
    },
    _id: false,
    default: { like: 0, love: 0, wow: 0, funny: 0, dislike: 0, happy: 0 },
  })
  reactions: {
    like: number;
    love: number;
    wow: number;
    funny: number;
    dislike: number;
    happy: number;
  };

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  seenBy: Types.ObjectId[];

  @Prop({ default: false })
  pinned: boolean;

  @Prop({ default: false })
  deleted: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  deletedFor: Types.ObjectId[];
}

export const MessageSchema = SchemaFactory.createForClass(Message);
