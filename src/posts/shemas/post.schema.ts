import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Post {
  @ApiProperty({ required: false })
  @Prop() // text is now optional
  text?: string;

  @ApiProperty({ required: false })
  @Prop()
  code?: string;

  @ApiProperty({ required: false })
  @Prop()
  codeLang?: string;

  @ApiProperty({ type: String })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @ApiProperty({ type: [String] })
  @Prop({ default: [] })
  tags: string[];

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

  @ApiProperty({ required: false })
  @Prop()
  image?: string;

  @ApiProperty({ required: false })
  @Prop()
  video?: string;

  @ApiProperty({ required: false, type: String })
  @Prop()
  createdAt?: Date;

  @ApiProperty({ required: false, type: String })
  @Prop()
  updatedAt?: Date;

  @ApiProperty({ required: false })
  @Prop({ default: false })
  hasAiSuggestions?: boolean;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Replace the pre-validation hook with the following:
PostSchema.pre('validate', function (next) {
  // At least one of text, code, video, image must be present and non-empty
  const fields = [this.text, this.code, this.video, this.image]
    .map((f) => (typeof f === 'string' ? f.trim() : f))
    .filter(Boolean);
  if (fields.length === 0) {
    return next(
      new BadRequestException(
        'At least one of text, code, video, or image must be provided.',
      ),
    );
  }
  // Only one of code, video, image can be present
  const mediaFields = [this.code, this.video, this.image]
    .map((f) => (typeof f === 'string' ? f.trim() : f))
    .filter(Boolean);
  if (mediaFields.length > 1) {
    return next(
      new BadRequestException(
        'Only one of code, video, or image can be present in a post.',
      ),
    );
  }
  // Ensure all reaction keys are present
  const defaultReactions = {
    like: 0,
    love: 0,
    wow: 0,
    happy: 0,
    funny: 0,
    dislike: 0,
  };
  this.reactions = { ...defaultReactions, ...(this.reactions || {}) };
  next();
});
