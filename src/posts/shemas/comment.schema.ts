import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true })
export class Comment {
  @ApiProperty()
  @Prop({ required: false })
  text: string;

  @ApiProperty({ required: false })
  @Prop()
  code?: string;

  @ApiProperty({ required: false })
  @Prop()
  codeLang?: string;

  @ApiProperty({ type: String })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @ApiProperty({ type: String })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true })
  postId: MongooseSchema.Types.ObjectId;

  @ApiProperty({ type: String, required: false, nullable: true })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Comment', default: null })
  parentCommentId?: MongooseSchema.Types.ObjectId | null;

  @ApiProperty({
    type: 'object',
    example: { like: 0, love: 0, wow: 0, funny: 0, dislike: 0, happy: 0 },
    additionalProperties: { type: 'number' },
  })
  @Prop({
    type: Object,
    default: {
      like: 0,
      love: 0,
      wow: 0,
      funny: 0,
      dislike: 0,
      happy: 0,
    },
  })
  reactions: {
    like: number;
    love: number;
    wow: number;
    funny: number;
    dislike: number;
    happy: number;
  };

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        username: { type: 'string' },
        reaction: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        username: String,
        reaction: String,
        createdAt: Date,
      },
    ],
    default: [],
  })
  userReactions: Array<{
    userId: Types.ObjectId;
    username: string;
    reaction: string;
    createdAt: Date;
  }>;

  @ApiProperty({ required: false, type: String })
  @Prop()
  createdAt?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  updatedAt?: Date;

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Indicates if this comment has an AI evaluation',
  })
  @Prop({ default: false })
  hasAiEvaluation?: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
