import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CodeSuggestionDocument = CodeSuggestion & Document;

@Schema({ timestamps: true })
export class CodeSuggestion {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true })
  postId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  suggestions: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const CodeSuggestionSchema =
  SchemaFactory.createForClass(CodeSuggestion);

@Schema({ timestamps: true })
export class AICommentEvaluation {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true })
  postId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Comment', required: true })
  commentId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  evaluation: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const AICommentEvaluationSchema =
  SchemaFactory.createForClass(AICommentEvaluation);
