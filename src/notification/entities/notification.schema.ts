import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  POST_CREATED = 'POST_CREATED',
  POST_LIKED = 'POST_LIKED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  FOLLOWED_USER = 'FOLLOWED_USER',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  LOGIN = 'LOGIN', // New: for login notifications
}
// // Add more as needed
// POST_SHARED = 'POST_SHARED', // New: when a post is shared
// USER_MENTIONED = 'USER_MENTIONED', // New: when a user is mentioned
// FRIEND_REQUEST = 'FRIEND_REQUEST', // New: for friend request notifications

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  userId: string; // the user who receives the notification
  @Prop({ required: true })
  content: string; // readable text like you have a new message / comment / post
  @Prop({ required: true, enum: NotificationType })
  type: NotificationType; // like, comment post
  @Prop({ default: false })
  isRead: boolean;
  @Prop({ type: Object, required: true })
  data: {
    postId?: string;
    commentId?: string;
    messageId?: string;
    extra?: Record<string, any>;
  }; //can include postId or commentId
  @Prop()
  fromUserId?: string;
}

// ✅ Define statics interface
export interface NotificationModel extends Model<NotificationDocument> {
  findByUser(userId: string): Promise<NotificationDocument[]>;
  markAllAsRead(userId: string): Promise<any>;
  markAllAsUnread(userId: string): Promise<any>;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
// @InjectModel('User') private readonly userModel: Model<UserDocument>
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ isRead: 1 });

NotificationSchema.statics.markAllAsRead = function (userId: string) {
  return this.updateMany({ userId, isRead: false }, { isRead: true });
};

NotificationSchema.statics.markAllAsUnread = function (userId: string) {
  return this.updateMany({ userId, isRead: true }, { isRead: false });
};

NotificationSchema.statics.findByUser = function (userId: string) {
  return this.find({ userId }).sort({ createdAt: -1 });
};
NotificationSchema.statics.deleteAll = function (userId: string) {
  return this.deleteMany({ userId });
};

NotificationSchema.statics.countUnread = function (userId: string) {
  return this.countDocuments({ userId, isRead: false });
};

NotificationSchema.statics.countAll = function (userId: string) {
  return this.countDocuments({ userId });
};

NotificationSchema.statics.countByType = function (
  userId: string,
  type: NotificationType,
) {
  return this.countDocuments({ userId, type });
};

NotificationSchema.statics.deleteByType = function (
  userId: string,
  type: NotificationType,
) {
  return this.deleteMany({ userId, type });
};

NotificationSchema.statics.deleteByPostId = function (postId: string) {
  return this.deleteMany({ 'data.postId': postId });
};

NotificationSchema.statics.deleteByCommentId = function (commentId: string) {
  return this.deleteMany({ 'data.commentId': commentId });
};

NotificationSchema.statics.deleteByMessageId = function (messageId: string) {
  return this.deleteMany({ 'data.messageId': messageId });
};

NotificationSchema.statics.deleteByUserId = function (userId: string) {
  return this.deleteMany({ userId });
};
