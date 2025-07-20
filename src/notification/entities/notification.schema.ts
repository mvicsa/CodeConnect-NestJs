import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  POST_CREATED = 'POST_CREATED',
  POST_REACTION = 'POST_REACTION',
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
  toUserId: string; // the user who receives the notification
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
    [key: string]: any; // for flexibility
  }; //can include postId or commentId
  @Prop()
  fromUserId?: string;
}

// ✅ Define statics interface
export interface NotificationModel extends Model<NotificationDocument> {
  findByUser(toUserId: string): Promise<NotificationDocument[]>;
  markAllAsRead(toUserId: string): Promise<any>;
  markAllAsUnread(toUserId: string): Promise<any>;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
// @InjectModel('User') private readonly userModel: Model<UserDocument>
NotificationSchema.index({ toUserId: 1, createdAt: -1 });
NotificationSchema.index({ isRead: 1 });

NotificationSchema.statics.markAllAsRead = function (toUserId: string) {
  console.log('here in the part of mark all as read', toUserId);
  return this.updateMany({ toUserId, isRead: false }, { isRead: true });
};

NotificationSchema.statics.markAllAsUnread = function (toUserId: string) {
  return this.updateMany({ toUserId, isRead: true }, { isRead: false });
};

NotificationSchema.statics.findByUser = function (toUserId: string) {
  return this.find({ toUserId }).sort({ createdAt: -1 });
};
NotificationSchema.statics.deleteAll = function (toUserId: string) {
  return this.deleteMany({ toUserId });
};

NotificationSchema.statics.countUnread = function (toUserId: string) {
  return this.countDocuments({ toUserId, isRead: false });
};

NotificationSchema.statics.countAll = function (toUserId: string) {
  return this.countDocuments({ toUserId });
};

NotificationSchema.statics.countByType = function (
  toUserId: string,
  type: NotificationType,
) {
  return this.countDocuments({ toUserId, type });
};

NotificationSchema.statics.deleteByType = function (
  toUserId: string,
  type: NotificationType,
) {
  return this.deleteMany({ toUserId, type });
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

NotificationSchema.statics.deleteByUserId = function (toUserId: string) {
  return this.deleteMany({ toUserId });
};
