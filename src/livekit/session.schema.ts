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
        leftAt: Date, // When the participant left the session (optional)
        isActive: { type: Boolean, default: true }, // Whether currently in session
      },
    ],
    default: [],
  })
  participants: Array<{
    userId: Types.ObjectId;
    username: string;
    joinedAt: Date;
    leftAt?: Date; // Optional - only set when participant leaves
    isActive: boolean; // Whether currently in session
  }>;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LivekitSessionSchema =
  SchemaFactory.createForClass(LivekitSession);
