import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ required: false })
  @Prop({ required: false })
  secretId?: string;



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

  @ApiProperty({ required: false, type: String })
  @Prop()
  endedDate?: Date;

  @Prop([{ type: Types.ObjectId, ref: 'User' }]) // Reference User model explicitly
  invitedUsers: Types.ObjectId[];
}

export type LivekitRoomDocument = LivekitRoom & Document;

export type PopulatedLivekitRoomDocument = LivekitRoom &
  Document & {
    invitedUsers: Array<{ _id: string; username: string; email: string }>;
  };
export const LivekitRoomSchema = SchemaFactory.createForClass(LivekitRoom);
