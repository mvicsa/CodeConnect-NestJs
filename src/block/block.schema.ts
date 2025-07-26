import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type BlockDocument = Block & Document;

@Schema({ timestamps: true })
export class Block {
  @ApiProperty({ description: 'The user who is doing the blocking' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockerId: Types.ObjectId;

  @ApiProperty({ description: 'The user who is being blocked' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockedId: Types.ObjectId;

  @ApiProperty({ description: 'Optional reason for blocking', required: false })
  @Prop({ type: String, required: false })
  reason?: string;

  @ApiProperty({ description: 'Whether the block is active', default: true })
  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const BlockSchema = SchemaFactory.createForClass(Block);

// Create a compound index to ensure unique blocking relationships
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });