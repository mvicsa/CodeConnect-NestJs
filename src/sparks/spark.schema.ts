import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type SparkDocument = Spark & Document;

@Schema({ timestamps: true })
export class Spark {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  owner: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  previewImage: string;

  @Prop({ type: Object, required: true })
  files: Record<string, { code: string }>;

  @Prop({ default: false })
  isPublic: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Spark' })
  forkedFrom?: Types.ObjectId;

  @Prop({
    type: [
      {
        userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
        value: { type: Number, required: true },
      },
    ],
    default: [],
  })
  ratings: Array<{ userId: Types.ObjectId; value: number }>;

  @Prop({ default: 0 })
  averageRating: number;
}

export const SparkSchema = SchemaFactory.createForClass(Spark); 