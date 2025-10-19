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

  @ApiProperty({ required: false, default: false })
  @Prop({ default: false })
  isPaid: boolean;

  @ApiProperty({ required: false, default: 0 })
  @Prop({ default: 0 })
  price: number;

  @ApiProperty({ required: false, default: 'USD' })
  @Prop({ default: 'USD' })
  currency: string;

  @ApiProperty({ required: false, default: Number.MAX_SAFE_INTEGER })
  @Prop({ default: Number.MAX_SAFE_INTEGER })
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

  @ApiProperty({ required: false, type: String })
  @Prop()
  cancelledAt?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  cancellationReason?: string;

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

// إضافة indexes لتحسين الأداء
LivekitRoomSchema.index({ isPaid: 1 }); // فلترة الجلسات المدفوعة
LivekitRoomSchema.index({ isActive: 1 }); // فلترة الجلسات النشطة
LivekitRoomSchema.index({ scheduledStartTime: 1 }); // فلترة الجلسات المجدولة
LivekitRoomSchema.index({ createdBy: 1 }); // جلب جلسات المستخدم
LivekitRoomSchema.index({ isPrivate: 1 }); // فلترة الجلسات العامة/الخاصة
LivekitRoomSchema.index({ price: 1 }); // ترتيب حسب السعر
LivekitRoomSchema.index({ currency: 1 }); // فلترة حسب العملة
LivekitRoomSchema.index({ createdAt: -1 }); // ترتيب افتراضي بالتاريخ
LivekitRoomSchema.index({ name: 'text', description: 'text' }); // بحث نصي
LivekitRoomSchema.index({ isPaid: 1, isActive: 1 }); // فلترة متعددة شائعة
LivekitRoomSchema.index({ isPaid: 1, price: 1 }); // فلترة المدفوعة مع السعر
