import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;
@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  userId: string; // the user who receives the notification
  @Prop({ required: true })
  content: string; // readable text like you have a new message / comment / post
  @Prop({ required: true })
  type: string; // like, comment post
  @Prop({ default: false })
  isRead: boolean;
  @Prop({ type: Object, required: true })
  data: any; //can include postId or commentId
  @Prop()
  fromUserId?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
// @InjectModel('User') private readonly userModel: Model<UserDocument>
