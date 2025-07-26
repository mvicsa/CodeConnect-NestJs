import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';

export type NotificationDocument = Notification & Document;

// Interface للمستخدم في الإشعارات
export interface NotificationUser {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string;
}

// Interface للبوست في الإشعارات
export interface NotificationPost {
  _id: string;
  text?: string;
  code?: string;
  codeLang?: string;
  image?: string;
  video?: string;
  tags: string[];
  reactions: {
    like: number;
    love: number;
    wow: number;
    funny: number;
    dislike: number;
    happy: number;
  };
  createdBy: NotificationUser;
  createdAt: string;
  updatedAt: string;
}

// Interface للتعليق في الإشعارات
export interface NotificationComment {
  _id: string;
  text: string;
  code?: string;
  codeLang?: string;
  createdBy: NotificationUser;
  postId: string;
  parentCommentId?: string;
  reactions: {
    like: number;
    love: number;
    wow: number;
    funny: number;
    dislike: number;
    happy: number;
  };
  createdAt: string;
  updatedAt: string;
}

// Interface للإشعار مع بيانات المستخدم والبوست
export interface NotificationWithUserData {
  _id: string;
  toUserId: NotificationUser;
  fromUserId?: NotificationUser;
  content: string;
  type: NotificationType;
  isRead: boolean;
  data: {
    postId?: string;
    commentId?: string;
    messageId?: string;
    post?: NotificationPost;
    comment?: NotificationComment;
    extra?: Record<string, any>;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
}

export enum NotificationType {
  POST_CREATED = 'POST_CREATED',
  POST_REACTION = 'POST_REACTION',
  COMMENT_ADDED = 'COMMENT_ADDED',
  COMMENT_REACTION = 'COMMENT_REACTION',
  FOLLOWED_USER = 'FOLLOWED_USER',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  LOGIN = 'LOGIN', // New: for login notifications
  USER_MENTIONED = 'USER_MENTIONED', // New: when a user is mentioned,
  ROOM_CREATED = 'ROOM_CREATED',
}
// // Add more as needed
// POST_SHARED = 'POST_SHARED', // New: when a post is shared
// USER_MENTIONED = 'USER_MENTIONED', // New: when a user is mentioned
// FRIEND_REQUEST = 'FRIEND_REQUEST', // New: for friend request notifications

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, type: String, ref: 'User' })
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

  @Prop({ type: String, ref: 'User' })
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
  return this.find({ toUserId })
    .populate('toUserId', 'username firstName lastName avatar')
    .populate('fromUserId', 'username firstName lastName avatar')
    .populate({
      path: 'data.postId',
      model: 'Post',
      select:
        'text code codeLang image video tags reactions createdAt updatedAt',
      populate: {
        path: 'createdBy',
        model: 'User',
        select: 'username firstName lastName avatar',
      },
    })
    .populate({
      path: 'data.commentId',
      model: 'Comment',
      select:
        'text code codeLang postId parentCommentId reactions createdAt updatedAt',
      populate: [
        {
          path: 'createdBy',
          model: 'User',
          select: 'username firstName lastName avatar',
        },
        {
          path: 'postId',
          model: 'Post',
          select:
            'text code codeLang image video tags reactions createdAt updatedAt',
          populate: {
            path: 'createdBy',
            model: 'User',
            select: 'username firstName lastName avatar',
          },
        },
      ],
    })
    .sort({ createdAt: -1 })
    .lean()
    .exec()
    .then((notifications) => {
      // تحويل البيانات لتكون في الشكل المطلوب
      return notifications.map((notification) => {
        const result = { ...notification };

        // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
        if (
          result.data &&
          result.data.postId &&
          typeof result.data.postId === 'object'
        ) {
          result.data.post = result.data.postId;
          result.data.postId = result.data.postId._id;
        }

        // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
        if (
          result.data &&
          result.data.commentId &&
          typeof result.data.commentId === 'object'
        ) {
          result.data.comment = result.data.commentId;
          result.data.commentId = result.data.commentId._id;
        }

        return result;
      });
    });
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
