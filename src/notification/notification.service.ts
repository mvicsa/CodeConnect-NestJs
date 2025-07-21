// notification.service.ts
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationDocument } from './entities/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,
  ) {}

  async create(dto: CreateNotificationDto) {
    const created = new this.notificationModel(dto);
    const saved = await created.save();
    
    // جلب الإشعار المحدث مع populate
    const populatedNotification = await this.notificationModel.findById(saved._id)
      .populate('toUserId', 'username firstName lastName avatar')
      .populate('fromUserId', 'username firstName lastName avatar')
      .populate({
        path: 'data.postId',
        model: 'Post',
        select: 'text code codeLang image video tags reactions createdAt updatedAt',
        populate: {
          path: 'createdBy',
          model: 'User',
          select: 'username firstName lastName avatar'
        }
      })
      .populate({
        path: 'data.commentId',
        model: 'Comment',
        select: 'text code codeLang postId parentCommentId reactions createdAt updatedAt',
        populate: [
          {
            path: 'createdBy',
            model: 'User',
            select: 'username firstName lastName avatar'
          },
          {
            path: 'postId',
            model: 'Post',
            select: 'text code codeLang image video tags reactions createdAt updatedAt',
            populate: {
              path: 'createdBy',
              model: 'User',
              select: 'username firstName lastName avatar'
            }
          }
        ]
      })
      .lean()
      .exec();
    
    if (populatedNotification) {
      // تحويل البيانات لتكون في الشكل المطلوب
      const notification = { ...populatedNotification };
      
      // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
      if (notification.data && notification.data.postId && typeof notification.data.postId === 'object') {
        const postData = notification.data.postId as any;
        notification.data.post = postData;
        notification.data.postId = postData._id;
      }
      
      // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
      if (notification.data && notification.data.commentId && typeof notification.data.commentId === 'object') {
        const commentData = notification.data.commentId as any;
        notification.data.comment = commentData;
        notification.data.commentId = commentData._id;
      }
      
      this.gateway.sendNotificationToUser(dto?.toUserId, notification);
      console.log('we created a notification', notification);
      return notification;
    }
    
    return saved;
  }

  findByUser(toUserId: string) {
    return this.notificationModel.find({ toUserId })
      .populate('toUserId', 'username firstName lastName avatar')
      .populate('fromUserId', 'username firstName lastName avatar')
      .populate({
        path: 'data.postId',
        model: 'Post',
        select: 'text code codeLang image video tags reactions createdAt updatedAt',
        populate: {
          path: 'createdBy',
          model: 'User',
          select: 'username firstName lastName avatar'
        }
      })
      .populate({
        path: 'data.commentId',
        model: 'Comment',
        select: 'text code codeLang postId parentCommentId reactions createdAt updatedAt',
        populate: [
          {
            path: 'createdBy',
            model: 'User',
            select: 'username firstName lastName avatar'
          },
          {
            path: 'postId',
            model: 'Post',
            select: 'text code codeLang image video tags reactions createdAt updatedAt',
            populate: {
              path: 'createdBy',
              model: 'User',
              select: 'username firstName lastName avatar'
            }
          }
        ]
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec()
      .then(notifications => {
        // تحويل البيانات لتكون في الشكل المطلوب
        return notifications.map(notification => {
          const result = { ...notification };
          
          // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
          if (result.data && result.data.postId && typeof result.data.postId === 'object') {
            const postData = result.data.postId as any;
            result.data.post = postData;
            result.data.postId = postData._id;
          }
          
          // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
          if (result.data && result.data.commentId && typeof result.data.commentId === 'object') {
            const commentData = result.data.commentId as any;
            result.data.comment = commentData;
            result.data.commentId = commentData._id;
          }
          
          return result;
        });
      });
  }

    async markAsRead(notificationId: string) {
    const result = await this.notificationModel.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true },
    ).populate('toUserId', 'username firstName lastName avatar')
     .populate('fromUserId', 'username firstName lastName avatar')
     .populate({
       path: 'data.postId',
       model: 'Post',
       select: 'text code codeLang image video tags reactions createdAt updatedAt',
       populate: {
         path: 'createdBy',
         model: 'User',
         select: 'username firstName lastName avatar'
       }
     })
     .populate({
       path: 'data.commentId',
       model: 'Comment',
       select: 'text code codeLang postId parentCommentId reactions createdAt updatedAt',
       populate: [
         {
           path: 'createdBy',
           model: 'User',
           select: 'username firstName lastName avatar'
         },
         {
           path: 'postId',
           model: 'Post',
           select: 'text code codeLang image video tags reactions createdAt updatedAt',
           populate: {
             path: 'createdBy',
             model: 'User',
             select: 'username firstName lastName avatar'
             }
           }
         ]
       })
     .lean()
     .exec();

    // تحويل البيانات لتكون في الشكل المطلوب
    if (result) {
      const notification = { ...result };
      
      // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
      if (notification.data && notification.data.postId && typeof notification.data.postId === 'object') {
        const postData = notification.data.postId as any;
        notification.data.post = postData;
        notification.data.postId = postData._id;
      }
      
      // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
      if (notification.data && notification.data.commentId && typeof notification.data.commentId === 'object') {
        const commentData = notification.data.commentId as any;
        notification.data.comment = commentData;
        notification.data.commentId = commentData._id;
      }
      
      return notification;
    }
    
    return result;
  }

  async addNotifications(notifications: CreateNotificationDto[]) {
    try {
      const created = await this.notificationModel.insertMany(notifications);
      
      // جلب الإشعارات المحدثة مع populate
      const populatedNotifications = await this.notificationModel.find({
        _id: { $in: created.map(n => n._id) }
      })
      .populate('toUserId', 'username firstName lastName avatar')
      .populate('fromUserId', 'username firstName lastName avatar')
      .populate({
        path: 'data.postId',
        model: 'Post',
        select: 'text code codeLang image video tags reactions createdAt updatedAt',
        populate: {
          path: 'createdBy',
          model: 'User',
          select: 'username firstName lastName avatar'
        }
      })
      .populate({
        path: 'data.commentId',
        model: 'Comment',
        select: 'text code codeLang postId parentCommentId reactions createdAt updatedAt',
        populate: [
          {
            path: 'createdBy',
            model: 'User',
            select: 'username firstName lastName avatar'
          },
          {
            path: 'postId',
            model: 'Post',
            select: 'text code codeLang image video tags reactions createdAt updatedAt',
            populate: {
              path: 'createdBy',
              model: 'User',
              select: 'username firstName lastName avatar'
            }
          }
        ]
      })
      .lean()
      .exec()
      .then(notifications => {
        // تحويل البيانات لتكون في الشكل المطلوب
        return notifications.map(notification => {
          const result = { ...notification };
          
          // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
          if (result.data && result.data.postId && typeof result.data.postId === 'object') {
            const postData = result.data.postId as any;
            result.data.post = postData;
            result.data.postId = postData._id;
          }
          
          // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
          if (result.data && result.data.commentId && typeof result.data.commentId === 'object') {
            const commentData = result.data.commentId as any;
            result.data.comment = commentData;
            result.data.commentId = commentData._id;
          }
          
          return result;
        });
      });
      
      this.gateway.sendToUsers(populatedNotifications);
      return populatedNotifications;
    } catch (error) {
      console.error('Error adding notifications: in addNotifications', error);
      throw error;
    }
  }

  // notification.service.ts
  async deleteOldNotifications(days: number) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    return this.notificationModel
      .deleteMany({ createdAt: { $lt: threshold } })
      .exec();
  }
}
