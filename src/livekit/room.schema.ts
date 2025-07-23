import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type LivekitRoomDocument = LivekitRoom & Document;

@Schema({ timestamps: true })
export class LivekitRoom {
  @ApiProperty()
  @Prop({ required: true })
  name: string;

  @ApiProperty()
  @Prop({ required: true })
  description: string;

  @ApiProperty({ type: String })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @ApiProperty()
  @Prop({ required: true, unique: true })
  secretId: string;

  @ApiProperty({ required: false })
  @Prop({ default: false })
  isPrivate: boolean;

  @ApiProperty({ required: false })
  @Prop({ default: 10 })
  maxParticipants: number;

  @ApiProperty({ required: false })
  @Prop({ default: true })
  isActive: boolean;

  @ApiProperty({ required: false, type: String })
  @Prop()
  createdAt?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  updatedAt?: Date;
}

export const LivekitRoomSchema = SchemaFactory.createForClass(LivekitRoom);
