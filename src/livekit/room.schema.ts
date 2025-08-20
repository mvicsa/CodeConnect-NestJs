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
  @Prop({ required: false })
  isPrivate: boolean;

  @ApiProperty({ required: false })
  @Prop({ default: 10 })
  maxParticipants: number;

  @ApiProperty({ required: false })
  @Prop({ default: true })
  isActive: boolean;

  @ApiProperty({ 
    required: false, 
    description: 'Scheduled start time for the meeting (optional)',
    example: '2024-01-15T10:00:00.000Z'
  })
  @Prop({ required: false })
  scheduledStartTime?: Date;

  @ApiProperty({ 
    required: false, 
    description: 'Actual time when the session started',
    example: '2024-01-15T09:45:00.000Z'
  })
  @Prop({ required: false })
  actualStartTime?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  createdAt?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  updatedAt?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  endedDate?: Date;

  @ApiProperty({ 
    required: false, 
    description: 'Total number of unique participants who joined this session',
    example: 15
  })
  @Prop({ default: 0 })
  totalParticipantsJoined?: number;

  @ApiProperty({ 
    required: false, 
    description: 'Current number of active participants in the session',
    example: 8
  })
  @Prop({ default: 0 })
  currentActiveParticipants?: number;

  @ApiProperty({ 
    required: false, 
    description: 'Peak number of participants during the session',
    example: 12
  })
  @Prop({ default: 0 })
  peakParticipants?: number;

  @Prop([{ type: Types.ObjectId, ref: 'User' }]) // Reference User model explicitly
  invitedUsers: Types.ObjectId[];
}

export type LivekitRoomDocument = LivekitRoom & Document;

export type PopulatedLivekitRoomDocument = LivekitRoom &
  Document & {
    invitedUsers: Array<{ _id: string; username: string; email: string }>;
  };
export const LivekitRoomSchema = SchemaFactory.createForClass(LivekitRoom);
