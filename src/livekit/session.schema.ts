import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type LivekitSessionDocument = LivekitSession & Document;

@Schema({ timestamps: true })
export class LivekitSession {
  @Prop({ required: true })
  room: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'LivekitRoom',
    required: false,
  })
  roomId?: Types.ObjectId;

  @Prop({
    type: [
      {
        userId: {
          type: MongooseSchema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        username: String,
        joinedAt: Date,
      },
    ],
    default: [],
  })
  participants: Array<{
    userId: Types.ObjectId;
    username: string;
    joinedAt: Date;
  }>;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LivekitSessionSchema =
  SchemaFactory.createForClass(LivekitSession);
