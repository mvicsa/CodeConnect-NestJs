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
