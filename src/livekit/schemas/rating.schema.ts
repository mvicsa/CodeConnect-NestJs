import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type RatingDocument = Rating & Document;

@Schema({ timestamps: true })
export class Rating {
  @ApiProperty({ description: 'The session that was rated' })
  @Prop({ type: Types.ObjectId, ref: 'LivekitSession', required: true })
  sessionId: Types.ObjectId;

  @ApiProperty({ description: 'The room that was rated' })
  @Prop({ type: Types.ObjectId, ref: 'LivekitRoom', required: true })
  roomId: Types.ObjectId;

  @ApiProperty({ description: 'The meeting creator being rated' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @ApiProperty({ description: 'The user giving the rating' })
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  raterId: Types.ObjectId;

  @ApiProperty({ description: 'Overall rating from 1-5 stars', minimum: 1, maximum: 5 })
  @Prop({ required: true, min: 1, max: 5 })
  overallRating: number;

  @ApiProperty({ description: 'Technical knowledge rating from 1-5', minimum: 1, maximum: 5 })
  @Prop({ required: true, min: 1, max: 5 })
  technicalKnowledge: number;

  @ApiProperty({ description: 'Communication skills rating from 1-5', minimum: 1, maximum: 5 })
  @Prop({ required: true, min: 1, max: 5 })
  communication: number;

  @ApiProperty({ description: 'Session organization rating from 1-5', minimum: 1, maximum: 5 })
  @Prop({ required: true, min: 1, max: 5 })
  organization: number;

  @ApiProperty({ description: 'Helpfulness rating from 1-5', minimum: 1, maximum: 5 })
  @Prop({ required: true, min: 1, max: 5 })
  helpfulness: number;

  @ApiProperty({ description: 'Optional comment about the session' })
  @Prop({ type: String, maxlength: 500 })
  comment?: string;

  @ApiProperty({ description: 'Whether the rating is anonymous' })
  @Prop({ default: false })
  isAnonymous: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  @Prop()
  createdAt?: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Prop()
  updatedAt?: Date;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);

// Create compound index to prevent multiple ratings from same user for same session
RatingSchema.index({ raterId: 1, sessionId: 1 }, { unique: true });

// Create index for efficient querying of creator ratings
RatingSchema.index({ creatorId: 1 });

// Create index for efficient querying of session ratings
RatingSchema.index({ sessionId: 1 });
