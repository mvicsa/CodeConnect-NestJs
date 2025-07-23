// notification.service.ts
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationDocument } from './entities/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationGateway } from './notification.gateway';
import { NotificationType } from './entities/notification.schema';

function extractObjectId(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // Match new ObjectId('...') or _id: '...'
    const match = val.match(/_id: new ObjectId\('([a-fA-F0-9]{24})'\)/) || val.match(/_id: '([a-fA-F0-9]{24})'/);
    if (match) return match[1];
    // If it's just an ObjectId string
    if (/^[a-fA-F0-9]{24}$/.test(val.trim())) return val.trim();
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && parsed._id) return parsed._id.toString();
    } catch {
      return val;
    }
  }
  if (typeof val === 'object' && val._id) return val._id.toString();
  return val.toString();
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,
  ) {}

  async create(dto: CreateNotificationDto) {
    dto.toUserId = extractObjectId(dto.toUserId);
    dto.fromUserId = extractObjectId(dto.fromUserId);
    // Deduplicate COMMENT_REACTION notifications
    if (dto.type === NotificationType.COMMENT_REACTION && dto.data && dto.data._id) {
      const existing = await this.notificationModel.findOne({
        toUserId: dto.toUserId,
        fromUserId: dto.fromUserId,
        type: NotificationType.COMMENT_REACTION,
        'data._id': dto.data._id,
      });
      if (existing) {
        existing.set('updatedAt', new Date());
        existing.data = dto.data; // Optionally update data
        await existing.save();
        // Populate and return as in the new notification case
        const populatedNotification = await this.notificationModel.findById(existing._id)
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
          this.gateway.sendNotificationToUser(dto?.toUserId, populatedNotification);
          // Emit notification:update for realtime update
          if (this.gateway.server) {
            this.gateway.server.to(`user:${dto?.toUserId}`).emit('notification:update', populatedNotification);
          }
          return populatedNotification;
        }
        return existing;
      }
    }
    // Deduplicate POST_REACTION notifications
    if (dto.type === NotificationType.POST_REACTION && dto.data && dto.data.postId) {
      const existing = await this.notificationModel.findOne({
        toUserId: dto.toUserId,
        fromUserId: dto.fromUserId,
        type: NotificationType.POST_REACTION,
        'data.postId': dto.data.postId,
      });
      if (existing) {
        existing.set('updatedAt', new Date());
        existing.data = dto.data; // Optionally update data
        await existing.save();
        // Populate and return as in the new notification case
        const populatedNotification = await this.notificationModel.findById(existing._id)
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
          this.gateway.sendNotificationToUser(dto?.toUserId, populatedNotification);
          // Emit notification:update for realtime update
          if (this.gateway.server) {
            this.gateway.server.to(`user:${dto?.toUserId}`).emit('notification:update', populatedNotification);
          }
          return populatedNotification;
        }
        return existing;
      }
    }
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
      
      // 🔥 إضافة البيانات المُ populate كخصائص منفصلة بدلاً من استبدال الـ IDs
      if (notification.data && notification.data.postId && typeof notification.data.postId === 'object') {
        const postData = notification.data.postId as any;
        notification.data.post = postData;  // إضافة البيانات كـ post
        notification.data.postId = postData._id.toString();  // الحفاظ على postId كـ string
      }
      
      if (notification.data && notification.data.commentId && typeof notification.data.commentId === 'object') {
        const commentData = notification.data.commentId as any;
        notification.data.comment = commentData;  // إضافة البيانات كـ comment
        notification.data.commentId = commentData._id.toString();  // الحفاظ على commentId كـ string
      }
      
      this.gateway.sendNotificationToUser(dto?.toUserId, notification);
              this.logger.debug('Notification created successfully');
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
      
      // 🔥 إضافة البيانات المُ populate كخصائص منفصلة
      if (notification.data && notification.data.postId && typeof notification.data.postId === 'object') {
        const postData = notification.data.postId as any;
        notification.data.post = postData;
        notification.data.postId = postData._id.toString();  // الحفاظ على postId كـ string
      }
      
      if (notification.data && notification.data.commentId && typeof notification.data.commentId === 'object') {
        const commentData = notification.data.commentId as any;
        notification.data.comment = commentData;
        notification.data.commentId = commentData._id.toString();  // الحفاظ على commentId كـ string
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
