import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type LivekitRoomDocument = LivekitRoom & Document;

@Schema({ timestamps: true })
export class LivekitRoom {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, unique: true })
  secretId: string;

  @Prop({ default: false })
  isPrivate: boolean;

  @Prop({ default: 10 })
  maxParticipants: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LivekitRoomSchema = SchemaFactory.createForClass(LivekitRoom); 