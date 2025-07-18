import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Post {
  @Prop() // text is now optional
  text?: string;

  @Prop()
  code?: string;

  @Prop()
  codeLang?: string;

  @Prop({ default: false })
  hasAiSuggestions?: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ default: [] })
  tags: string[];

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

  @Prop()
  image?: string;

  @Prop()
  video?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Replace the pre-validation hook with the following:
PostSchema.pre('validate', function (next) {
  // At least one of text, code, video, image must be present and non-empty
  const fields = [this.text, this.code, this.video, this.image].map(f => (typeof f === 'string' ? f.trim() : f)).filter(Boolean);
  if (fields.length === 0) {
    return next(new BadRequestException('At least one of text, code, video, or image must be provided.'));
  }
  // Only one of code, video, image can be present
  const mediaFields = [this.code, this.video, this.image].map(f => (typeof f === 'string' ? f.trim() : f)).filter(Boolean);
  if (mediaFields.length > 1) {
    return next(new BadRequestException('Only one of code, video, or image can be present in a post.'));
  }
  // Ensure all reaction keys are present
  const defaultReactions = { like: 0, love: 0, wow: 0, happy: 0, funny: 0, dislike: 0 };
  this.reactions = { ...defaultReactions, ...(this.reactions || {}) };
  next();
}); 