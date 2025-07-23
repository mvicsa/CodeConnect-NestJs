import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationService } from './notification.service';
import { ModuleRef } from '@nestjs/core';
import {
  NotificationDocument,
  NotificationType,
} from './entities/notification.schema';
import { Model, ObjectId } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Notification } from './entities/notification.schema';
import { NotificationGateway } from './notification.gateway';
import { UsersService } from 'src/users/users.service';

type UserLike = { _id: string; username?: string };

function extractUserId(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // Try to parse if it's a stringified object
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && parsed._id) return parsed._id;
    } catch {
      // Not a JSON string, assume it's an ObjectId string
      return val;
    }
  }
  if (typeof val === 'object' && val._id) return val._id;
  return val;
}

function extractUsername(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && parsed.username) return parsed.username;
    } catch {
      return val;
    }
  }
  if (typeof val === 'object' && val.username) return val.username;
  return val;
}

function extractObjectId(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // Match new ObjectId('...') or _id: '...'
    const match = val.match(/_id: new ObjectId\('([a-fA-F0-9]{24})'\)/) || val.match(/_id: '([a-fA-F0-9]{24})'/);
    if (match) return match[1];
    if (/^[a-fA-F0-9]{24}$/.test(val.trim())) return val.trim();
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

function extractFirstLastUsername(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object') {
        if (parsed.firstName && parsed.lastName) return parsed.firstName + ' ' + parsed.lastName;
        if (parsed.username) return parsed.username;
        if (parsed._id) return parsed._id;
      }
    } catch {
      return val;
    }
  }
  if (typeof val === 'object') {
    if (val.firstName && val.lastName) return val.firstName + ' ' + val.lastName;
    if (val.username) return val.username;
    if (val._id) return val._id;
  }
  return val;
}

@Controller()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly moduleRef: ModuleRef,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly gateway: NotificationGateway,
    private readonly userService: UsersService,
  ) {
    this.logger.log('✅ NotificationListener initialized');
  }

  //---------------> 1
  @EventPattern('user.login')
  async handleUserLogin(
    @Payload() notificationDto: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handleUserLogin triggered');
    this.logger.log(
      `📨 Received user.login event for: ${notificationDto.content}`,
      notificationDto,
    );
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      // Prevent self-notification
      if (notificationDto.toUserId !== notificationDto.fromUserId) {
        const createdNotification = await this.notificationService.create({
          toUserId: notificationDto.toUserId,
          content: `User ${notificationDto.content} logged in`,
          data: notificationDto.data,
          fromUserId: notificationDto.fromUserId,
          type: NotificationType.LOGIN,
        });
        console.log('createdNotification in listener', createdNotification);
        this.logger.log(`💾 Notification saved: ${createdNotification._id}`);
      }
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged message with tag: ${originalMsg.fields.deliveryTag}`,
      );
    } catch (err) {
      channel.nack(originalMsg, false, false); // ❌ reject and drop
      this.logger.error(`❌ Ack or Save failed: ${err.message}`, err.stack);
    }
  }

  //---------------> 2
  @EventPattern('post.created')
  async handlePostCreated(
    @Payload() notificationDto: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostCreated triggered');
    this.logger.log(
      `📨 Received post.created event for postId: ${notificationDto.content}`,
      notificationDto,
    );
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      // Always use extractObjectId for toUserId and fromUserId
      notificationDto.toUserId = extractObjectId(notificationDto.toUserId);
      notificationDto.fromUserId = extractObjectId(notificationDto.fromUserId);
      this.logger.log(`Processing post.created for `, notificationDto);
      const userService = this.moduleRef.get<UsersService>(UsersService, {
        strict: false,
      });
      const followers: any[] = await userService.getFollowers(notificationDto.toUserId);
      if (followers.length === 0) {
        this.logger.log(
          '⚠️ No followers found, skipping notification creation',
        );
        channel.ack(originalMsg);
        return;
      }
      const notifications: CreateNotificationDto[] = followers
        .filter((follower) => follower._id.toString() !== notificationDto.fromUserId)
        .map((follower) => ({
          toUserId: follower._id as string,
          fromUserId: notificationDto.toUserId,
          content: `User ${notificationDto.toUserId} created a new post`,
          type: NotificationType.POST_CREATED,
          data: notificationDto.data,
        }));
      await this.notificationService.addNotifications(notifications);
      this.logger.log(
        `💾 Created notifications for ${notifications.length} followers`,
      );
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged post.created for postId: ${notificationDto.data.postId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.created: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  //---------------> 3
  @EventPattern('post.reaction')
  async handlePostLiked(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostLiked triggered', data);
    this.logger.log(`📨 Received post.reaction event for`, data);
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      if (data.toUserId !== data.fromUserId) {
        await this.notificationService.create({
          toUserId: data.toUserId,
          fromUserId: data.fromUserId,
          data: data.data,
          type: NotificationType.POST_REACTION,
          content: `reacted to your post`,
        });
      }
      const followers: any[] = await this.userService.getFollowers(
        data.toUserId,
      );
      const notifications = followers
        .filter((follower) => follower._id.toString() !== data.fromUserId)
        .map((follower): CreateNotificationDto | undefined => {
          if (follower._id != data.fromUserId) {
            return {
              toUserId: follower._id.toString(),
              fromUserId: data.fromUserId,
              data: data.data,
              type: NotificationType.POST_REACTION,
              content: `A post for a person you follow has been reacted to by ${data.fromUserId || 'someone'}`,
            };
          }
          return undefined;
        })
        .filter((n): n is CreateNotificationDto => Boolean(n));
      await this.notificationService.addNotifications(notifications);
      this.logger.log(
        `💾 Created notifications for ${notifications.length} followers`,
      );
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged post.reaction for postId: ${data.data?.postId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.reaction: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  //---------------> 4

  @EventPattern('comment.added')
  async handleCommentAdded(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handleCommentAdded triggered');
    this.logger.log(`📨 Received comment.added event for comment:`, data);
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      if (extractObjectId(data.toUserId) !== extractObjectId(data.fromUserId)) {
        // Determine notification content based on the notification type
        let notificationContent: string;
        
        if (data.data && data.data.notificationType) {
          switch (data.data.notificationType) {
            case 'reply_to_comment':
              notificationContent = `replied to your comment`;
              break;
            case 'reply_to_post_owner':
              notificationContent = `replied to a comment on your post`;
              break;
            case 'comment_on_post':
              notificationContent = `commented on your post`;
              break;
            default:
              // Fallback to the old logic
              const isReply = !!(data.data && data.data.parentCommentId);
              notificationContent = isReply ? `replied to your comment` : `commented on your post`;
          }
        } else {
          // Fallback to the old logic if notificationType is not present
          const isReply = !!(data.data && data.data.parentCommentId);
          notificationContent = isReply ? `replied to your comment` : `commented on your post`;
        }
        
        const notification = await this.notificationService.create({
          toUserId: extractObjectId(data.toUserId),
          fromUserId: extractObjectId(data.fromUserId),
          content: notificationContent,
          type: NotificationType.COMMENT_ADDED,
          data: data.data,
        });
        this.logger.log(`💾 Notification saved: ${notification._id}`);
      }
      channel.ack(originalMsg);
      this.logger.log(`✅ Acknowledged comment.added for commentId:`, data);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process comment.added: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  //---------------> 5
  @EventPattern('user.followed')
  async handleUserFollowed(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.notificationService.create({
        toUserId: data.toUserId,
        fromUserId: data.fromUserId,
        content: `started following you!`,
        type: NotificationType.FOLLOWED_USER,
        data: data.data,
      });
      channel.ack(originalMsg);
    } catch (error) {
      console.log('error in user.followed', error);
      channel.nack(originalMsg);
    }
  }

  //---------------> 6
  @EventPattern('message.received')
  async handleMessageReceived(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    console.log('In handleMessageReceived', data, context);
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      if (data.toUserId !== data.fromUserId) {
        await this.notificationService.create({
          toUserId: data.toUserId,
          content: `You have received a message from ${data.fromUserId}`,
          type: NotificationType.MESSAGE_RECEIVED,
          data: data.data,
          fromUserId: data.fromUserId,
        });
      }
      channel.ack(originalMsg);
    } catch (error) {
      console.log('Error in the part of handleMessage received ok ', error);
      channel.nack(originalMsg);
    }
  }

  @EventPattern('comment.reaction')
  async handleCommentReaction(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handleCommentReaction triggered', data);
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const isReply = !!data.data?.parentCommentId;
      if (extractObjectId(data.toUserId) !== extractObjectId(data.fromUserId)) {
        const createdNotification = await this.notificationService.create({
          toUserId: extractObjectId(data.toUserId),
          fromUserId: extractObjectId(data.fromUserId),
          data: data.data,
          type: NotificationType.COMMENT_REACTION,
          content: `reacted to your ${isReply ? 'reply' : 'comment'}`,
        });
        this.logger.log(`💾 Notification saved: ${createdNotification._id}`);
      }
      channel.ack(originalMsg);
      this.logger.log(`✅ Acknowledged comment.reaction for commentId: ${data.data?.commentId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process comment.reaction: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  @EventPattern('notification.source.deleted')
  async handleNotificationSourceDeleted(
    @Payload() data: any,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥🔥🔥 handleNotificationSourceDeleted started', data);
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      // حذف الإشعار من DB حسب النوع
      if (data.notificationId) {
        await this.notificationModel.findByIdAndDelete(data.notificationId);
        console.log('[NOTIFICATION] Emitting notification:delete (by notificationId)', {
          to: `user:${data.toUserId}`,
          notificationId: data.notificationId,
        });
        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          notificationId: data.notificationId,
        });
      }
      else if (data.type === 'USER_MENTIONED' && data.commentId) {
        console.log('[DEBUG] Explicitly deleting USER_MENTIONED notifications for commentId:', data.commentId);
        console.log('[DEBUG] Additional comment data:', data.commentData);
        console.log('[DEBUG] Comment text:', data.text);
        
        const commentId = typeof data.commentId === 'object' && data.commentId._id
          ? data.commentId._id.toString()
          : data.commentId.toString();
        
        // Debug: Find all USER_MENTIONED notifications to see their structure
        const existingMentions = await this.notificationModel.find({
          type: 'USER_MENTIONED'
        }).limit(5).lean();
        
        console.log('[DEBUG] Sample USER_MENTIONED notifications structure:', 
          JSON.stringify(existingMentions, null, 2)
        );
        
        // Debug: Check if there are any mentions for this specific comment
        const mentionsForComment = await this.notificationModel.find({
          type: 'USER_MENTIONED',
          $or: [
            { 'data.commentId': commentId },
            { 'data._id': commentId },
            { 'data.parentCommentId': commentId },
          ]
        }).lean();
        
        console.log(`[DEBUG] Found ${mentionsForComment.length} USER_MENTIONED notifications for commentId ${commentId}`);
        if (mentionsForComment.length > 0) {
          console.log('[DEBUG] First mention structure:', JSON.stringify(mentionsForComment[0], null, 2));
        }
        
        // If we have the comment text, try to extract mentions and delete notifications for those users
        if (data.text) {
          const extractMentions = (text) => {
            if (!text) return [];
            return Array.from(new Set((text.match(/@([a-zA-Z0-9_]+)/g) || []).map(m => m.slice(1))));
          };
          
          const mentions = extractMentions(data.text);
          console.log('[DEBUG] Extracted mentions from comment text:', mentions);
          
          if (mentions.length > 0) {
            try {
              // Find users by usernames
              const users = await this.userService.findByUsernames(mentions as string[]);
              console.log('[DEBUG] Found mentioned users:', users.map(u => (u as any).username));
              
              if (users.length > 0) {
                const userIds = users.map(user => (user as any)._id.toString());
                console.log('[DEBUG] User IDs for mentioned users:', userIds);
                
                // Delete USER_MENTIONED notifications for these specific users related to this comment
                const mentionDeleteResult = await this.notificationModel.deleteMany({
                  type: 'USER_MENTIONED',
                  toUserId: { $in: userIds },
                  $or: [
                    { 'data.commentId': commentId },
                    { 'data._id': commentId },
                    { 'data.parentCommentId': commentId },
                    // Try with the comment object directly
                    { 'data.comment._id': commentId },
                  ]
                });
                
                console.log(`[DEBUG] Deleted ${mentionDeleteResult.deletedCount} mention notifications using extracted mentions`);
                
                // Notify these users about the deletion
                for (const userId of userIds) {
                  this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
                    type: 'USER_MENTIONED',
                    commentId: commentId,
                  });
                }
              }
            } catch (error) {
              console.error('[ERROR] Error finding mentioned users:', error);
            }
          }
        }
          
        // Delete all USER_MENTIONED notifications related to this comment
        const mentionedDeleted = await this.notificationModel.deleteMany({
          type: 'USER_MENTIONED',
          $or: [
            { 'data.commentId': commentId },
            { 'data._id': commentId },
            { 'data.parentCommentId': commentId },
            // Try with the comment object directly
            { 'data.comment._id': commentId },
          ],
        });
        
        console.log('[DEBUG] USER_MENTIONED deleted count:', mentionedDeleted.deletedCount);
        
        // Find affected users to notify them about the deletion
        const affectedNotifications = await this.notificationModel.find({
          type: 'USER_MENTIONED',
          $or: [
            { 'data.commentId': commentId },
            { 'data._id': commentId },
            { 'data.parentCommentId': commentId },
            { 'data.comment._id': commentId },
          ],
        }).select('toUserId');
        
        const affectedUsers = new Set<string>();
        affectedNotifications.forEach(n => affectedUsers.add(n.toUserId.toString()));
        
        // Notify each affected user
        for (const userId of affectedUsers) {
          this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
            type: 'USER_MENTIONED',
            commentId: commentId,
          });
        }
      }
      else if (data.type === 'USER_MENTIONED' && data.postId) {
        console.log('[DEBUG] Explicitly deleting USER_MENTIONED notifications for postId:', data.postId);
        console.log('[DEBUG] Additional post data:', data.data);
        
        const postId = typeof data.postId === 'object' && data.postId._id
          ? data.postId._id.toString()
          : data.postId.toString();
        
        console.log('[DEBUG] Processed postId for mention deletion:', postId);
        
        // Handle specific user mention deletion (when updating post)
        if (data.toUserId && data.fromUserId) {
          console.log(`[DEBUG] Deleting specific USER_MENTIONED notification: toUserId=${data.toUserId}, fromUserId=${data.fromUserId}, postId=${postId}`);
          
          const specificDeleteResult = await this.notificationModel.deleteMany({
            type: 'USER_MENTIONED',
            toUserId: data.toUserId,
            fromUserId: data.fromUserId,
            $or: [
              { 'data.postId': postId },
              { 'data._id': postId },
              { 'data.post._id': postId },
            ]
          });
          
          console.log(`[DEBUG] Deleted ${specificDeleteResult.deletedCount} specific mention notifications for user ${data.toUserId}`);
          
          // Notify the specific user about the deletion
          this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
            type: 'USER_MENTIONED',
            postId: postId,
            fromUserId: data.fromUserId,
          });
        } else {
          // Handle general post mention deletion (when deleting post)
          console.log('[DEBUG] Deleting all USER_MENTIONED notifications for postId:', postId);
          
          const mentionsForPost = await this.notificationModel.find({
            type: 'USER_MENTIONED',
            $or: [
              { 'data.postId': postId },
              { 'data._id': postId },
              { 'data.post._id': postId },
            ]
          }).lean();
          
          console.log(`[DEBUG] Found ${mentionsForPost.length} USER_MENTIONED notifications for postId ${postId}`);
          
          if (mentionsForPost.length > 0) {
            // Collect affected users before deletion
            const affectedUsers = new Set<string>();
            mentionsForPost.forEach(n => affectedUsers.add(n.toUserId.toString()));
            
            // Delete all mention notifications for this post
            const mentionedDeleted = await this.notificationModel.deleteMany({
              type: 'USER_MENTIONED',
              $or: [
                { 'data.postId': postId },
                { 'data._id': postId },
                { 'data.post._id': postId },
              ],
            });
            
            console.log(`[DEBUG] Deleted ${mentionedDeleted.deletedCount} mention notifications for postId ${postId}`);
            
            // Notify each affected user
            for (const userId of affectedUsers) {
              this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
                type: 'USER_MENTIONED',
                postId: postId,
              });
            }
          }
        }
      }
      else if (data.type === 'COMMENT_REACTION' && data.commentId) {
        console.log('[DEBUG] Deleting comment reaction with data:', {
          toUserId: data.toUserId,
          fromUserId: data.fromUserId,
          commentId: data.commentId,
          type: data.type,
          isReply: data.isReply,
          isMainComment: data.isMainComment,
          parentCommentId: data.parentCommentId
        });

        const commentId = typeof data.commentId === 'object' && data.commentId._id
          ? data.commentId._id.toString()
          : data.commentId.toString();

        console.log(`[DEBUG] Processing COMMENT_REACTION deletion for commentId: ${commentId}`);
        
        // 🔥 استخدام الطريقة المحسنة للبحث والحذف
        const allReactionNotifications = await this.notificationModel.find({
          type: 'COMMENT_REACTION'
        }).lean();
        
        console.log(`[DEBUG] Searching through ${allReactionNotifications.length} reaction notifications`);
        
        // فلترة الإشعارات المرتبطة بالتعليق/الرد المحذوف
        const relevantReactions = allReactionNotifications.filter(notification => {
          if (!notification.data) return false;
          
          // التحقق من جميع الطرق المحتملة لتخزين معرف التعليق
          const commentMatches = 
            (notification.data.commentId && notification.data.commentId.toString() === commentId) ||
            (notification.data._id && notification.data._id.toString() === commentId) ||
            (notification.data.comment && notification.data.comment._id && 
             notification.data.comment._id.toString() === commentId) ||
            (notification.data.comment && notification.data.comment.commentId && 
             notification.data.comment.commentId.toString() === commentId) ||
            // البحث في أي مكان في البيانات
            JSON.stringify(notification.data).includes(commentId);
             
          return commentMatches;
        });
        
        console.log(`[DEBUG] Found ${relevantReactions.length} relevant COMMENT_REACTION notifications for ${data.isReply ? 'reply' : 'comment'} ${commentId}`);
        
        let deletedCount = 0;
        
        if (relevantReactions.length > 0) {
          // عرض أمثلة على الإشعارات الموجودة
          relevantReactions.slice(0, 2).forEach((notif, index) => {
            console.log(`[DEBUG] Relevant reaction notification ${index + 1}:`, {
              _id: notif._id,
              type: notif.type,
              toUserId: notif.toUserId,
              fromUserId: notif.fromUserId,
              data: notif.data
            });
          });
          
          // حذف الإشعارات بالـ IDs
          const reactionIds = relevantReactions.map(r => r._id);
          const deletedReactionsResult = await this.notificationModel.deleteMany({
            _id: { $in: reactionIds }
          });
          
          deletedCount = deletedReactionsResult.deletedCount;
          console.log(`[DEBUG] Deleted ${deletedCount} COMMENT_REACTION notifications by ID for ${data.isReply ? 'reply' : 'comment'} ${commentId}`);
          
          // إرسال إشعار للمستخدمين المتأثرين
          const affectedUsers = new Set<string>();
          relevantReactions.forEach(notif => affectedUsers.add(notif.toUserId.toString()));
          
          for (const userId of affectedUsers) {
            console.log(`[DEBUG] Sending reaction delete notification to user: ${userId} for ${data.isReply ? 'reply' : 'comment'}: ${commentId}`);
            this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
              type: 'COMMENT_REACTION',
              commentId: commentId,
              isReply: data.isReply,
              parentCommentId: data.parentCommentId
            });
          }
        }

        // حذف إضافي بالاستعلامات التقليدية للتأكد
        const traditionalQueries = [
          { type: 'COMMENT_REACTION', 'data.commentId': commentId },
          { type: 'COMMENT_REACTION', 'data._id': commentId },
          { type: 'COMMENT_REACTION', 'data.comment._id': commentId }
        ];
        
        // إضافة toUserId إذا كان متوفر
        if (data.toUserId) {
        const toUserId = typeof data.toUserId === 'object' && data.toUserId._id
          ? data.toUserId._id
          : data.toUserId;

          traditionalQueries.forEach(query => {
            query['toUserId'] = toUserId;
          });
        }

        // إضافة fromUserId إذا كان متوفر
        if (data.fromUserId) {
        const fromUserId = typeof data.fromUserId === 'object' && data.fromUserId._id
          ? data.fromUserId._id
          : data.fromUserId;

          traditionalQueries.forEach(query => {
            query['fromUserId'] = fromUserId;
          });
        }

        for (const [index, query] of traditionalQueries.entries()) {
          try {
            const additionalDeleted = await this.notificationModel.deleteMany(query);
            if (additionalDeleted.deletedCount > 0) {
              deletedCount += additionalDeleted.deletedCount;
              console.log(`[DEBUG] Traditional query ${index + 1} deleted ${additionalDeleted.deletedCount} additional notifications`);
            }
          } catch (error) {
            console.error(`[ERROR] Traditional query ${index + 1} failed:`, error.message);
          }
        }

        console.log(`[NOTIFICATION] Total deleted ${deletedCount} comment reaction notifications for ${data.isReply ? 'reply' : 'comment'} ${commentId}`, {
          type: 'COMMENT_REACTION',
          commentId: data.commentId,
          isReply: data.isReply,
          parentCommentId: data.parentCommentId
        });

        // إرسال إشعار عام للحذف إذا لم يتم إرسال إشعارات محددة
        if (deletedCount > 0 && data.toUserId) {
        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          type: 'COMMENT_REACTION',
          commentId: data.commentId,
          fromUserId: data.fromUserId,
        });
      }
      }

      else if (data.type === 'POST_REACTION' && data.postId) {
        const deleteQuery: any = {
          toUserId: data.toUserId,
          type: 'POST_REACTION',
          'data.postId': data.postId,
        };

        // إضافة fromUserId إذا كان متوفر للدقة أكثر
        if (data.fromUserId) {
          deleteQuery.fromUserId = data.fromUserId;
        }

        const deletedNotifications = await this.notificationModel.deleteMany(deleteQuery);

        console.log(`[NOTIFICATION] Deleted ${deletedNotifications.deletedCount} post reaction notifications`, {
          to: `user:${data.toUserId}`,
          type: 'POST_REACTION',
          postId: data.postId,
          fromUserId: data.fromUserId,
        });

        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          type: 'POST_REACTION',
          postId: data.postId,
          fromUserId: data.fromUserId,
        });
      }
      else if (data.type === 'FOLLOWED_USER' && data.followId) {
        const deletedNotifications = await this.notificationModel.deleteMany({
          toUserId: data.toUserId,
          type: 'FOLLOWED_USER',
          'data.followerId': data.followId,
        });

        console.log(`[NOTIFICATION] Deleted ${deletedNotifications.deletedCount} follow notifications`, {
          to: `user:${data.toUserId}`,
          type: 'FOLLOWED_USER',
          followId: data.followId,
        });

        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          type: 'FOLLOWED_USER',
          followId: data.followId,
        });
      }
      else if (data.type === 'COMMENT_ADDED' && data.commentId) {
        console.log('[DEBUG] Deleting comment added notification with data:', {
          toUserId: data.toUserId,
          commentId: data.commentId,
          type: data.type
        });
        // تنظيف البيانات
        const toUserId = typeof data.toUserId === 'object' && data.toUserId._id
          ? data.toUserId._id.toString()
          : data.toUserId.toString();
        const commentId = typeof data.commentId === 'object' && data.commentId._id
          ? data.commentId._id.toString()
          : data.commentId.toString();
          
        console.log('[DEBUG] Cleaned commentId for deletion:', commentId);
        console.log('[DEBUG] Cleaned toUserId for deletion:', toUserId);
        
        // 🔥 أولاً، نتحقق من جميع الإشعارات الموجودة في قاعدة البيانات لنفهم البنية
        const allNotifications = await this.notificationModel.find({
          $or: [
            { toUserId: toUserId },
            { 'data.commentId': commentId },
            { 'data._id': commentId }
          ]
        }).limit(10).lean();
        
        console.log(`[DEBUG] Found ${allNotifications.length} potentially related notifications:`);
        allNotifications.forEach((notif, index) => {
          console.log(`[DEBUG] Notification ${index + 1}:`, {
            _id: notif._id,
            type: notif.type,
            toUserId: notif.toUserId,
            fromUserId: notif.fromUserId,
            data: JSON.stringify(notif.data, null, 2)
          });
        });
        
        // Check for mentions with this comment ID in different locations
        const mentionQueries = [
          { type: 'USER_MENTIONED', 'data.commentId': commentId },
          { type: 'USER_MENTIONED', 'data._id': commentId },
          { type: 'USER_MENTIONED', 'data.parentCommentId': commentId },
          // Try with the comment object directly
          { type: 'USER_MENTIONED', 'data.comment._id': commentId },
        ];
        
        // Debug: Check each query individually
        for (const query of mentionQueries) {
          const count = await this.notificationModel.countDocuments(query);
          console.log(`[DEBUG] Query ${JSON.stringify(query)} found ${count} notifications`);
          
          if (count > 0) {
            const samples = await this.notificationModel.find(query).limit(2).lean();
            console.log(`[DEBUG] Sample results for query:`, samples.map(s => ({
              _id: s._id,
              type: s.type,
              data: s.data
            })));
          }
        }
        
        // التحقق من استعلامات COMMENT_ADDED
        const commentQueries = [
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data.commentId': commentId },
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data._id': commentId },
          { type: 'COMMENT_ADDED', 'data.commentId': commentId },
          { type: 'COMMENT_ADDED', 'data._id': commentId },
          { type: 'COMMENT_ADDED', 'data.comment._id': commentId },
          { type: 'COMMENT_ADDED', 'data.comment.commentId': commentId }
        ];
        
        console.log('[DEBUG] Testing COMMENT_ADDED queries:');
        for (const query of commentQueries) {
          const count = await this.notificationModel.countDocuments(query);
          console.log(`[DEBUG] Query ${JSON.stringify(query)} found ${count} notifications`);
          
          if (count > 0) {
            const samples = await this.notificationModel.find(query).limit(2).lean();
            console.log(`[DEBUG] Sample COMMENT_ADDED results:`, samples.map(s => ({
              _id: s._id,
              type: s.type,
              toUserId: s.toUserId,
              data: s.data
            })));
          }
        }
        
        // Try a more flexible approach for finding mentions
        const allMentionsWithComment = await this.notificationModel.find({
          type: 'USER_MENTIONED',
        }).lean();
        
        const relevantMentions = allMentionsWithComment.filter(notification => {
          if (!notification.data) return false;
          
          // Check all possible paths where the comment ID might be stored
          const commentMatches = 
            (notification.data.commentId && notification.data.commentId.toString() === commentId) ||
            (notification.data._id && notification.data._id.toString() === commentId) ||
            (notification.data.parentCommentId && notification.data.parentCommentId.toString() === commentId) ||
            (notification.data.comment && notification.data.comment._id && 
             notification.data.comment._id.toString() === commentId);
             
          return commentMatches;
        });
        
        console.log(`[DEBUG] Found ${relevantMentions.length} relevant mentions using manual filtering`);
        if (relevantMentions.length > 0) {
          console.log('[DEBUG] First relevant mention:', JSON.stringify(relevantMentions[0], null, 2));
          
          // Delete these mentions by ID
          const mentionIds = relevantMentions.map(m => m._id);
          const manualDeleteResult = await this.notificationModel.deleteMany({
            _id: { $in: mentionIds }
          });
          console.log(`[DEBUG] Manually deleted ${manualDeleteResult.deletedCount} mention notifications`);
        }
        
        // حذف robust لكل إشعارات المنشن المرتبطة بالتعليق أو الرد
        const mentionedDeleted = await this.notificationModel.deleteMany({
          type: 'USER_MENTIONED',
          $or: [
            { 'data.commentId': commentId },
            { 'data._id': commentId },
            { 'data.parentCommentId': commentId },
          ],
        });
        console.log('[DEBUG] USER_MENTIONED deleted count:', mentionedDeleted.deletedCount);

        // 🔥 حذف إشعارات التفاعلات (COMMENT_REACTION) المرتبطة بالتعليق المحذوف
        console.log('[DEBUG] Deleting COMMENT_REACTION notifications for commentId:', commentId);
        
        // أولاً، البحث عن جميع إشعارات التفاعلات التي قد تكون مرتبطة بهذا التعليق
        const allReactionNotifications = await this.notificationModel.find({
          type: 'COMMENT_REACTION'
        }).lean();
        
        console.log(`[DEBUG] Total COMMENT_REACTION notifications in database: ${allReactionNotifications.length}`);
        
        // فلترة الإشعارات المرتبطة بالتعليق المحذوف
        const relevantReactions = allReactionNotifications.filter(notification => {
          if (!notification.data) return false;
          
          // التحقق من جميع الطرق المحتملة لتخزين معرف التعليق
          const commentMatches = 
            (notification.data.commentId && notification.data.commentId.toString() === commentId) ||
            (notification.data._id && notification.data._id.toString() === commentId) ||
            (notification.data.comment && notification.data.comment._id && 
             notification.data.comment._id.toString() === commentId) ||
            (notification.data.comment && notification.data.comment.commentId && 
             notification.data.comment.commentId.toString() === commentId) ||
            // البحث في أي مكان في البيانات
            JSON.stringify(notification.data).includes(commentId);
             
          return commentMatches;
        });
        
        console.log(`[DEBUG] Found ${relevantReactions.length} relevant COMMENT_REACTION notifications`);
        
        if (relevantReactions.length > 0) {
          // عرض أمثلة على الإشعارات الموجودة
          relevantReactions.slice(0, 3).forEach((notif, index) => {
            console.log(`[DEBUG] Relevant reaction notification ${index + 1}:`, {
              _id: notif._id,
              type: notif.type,
              toUserId: notif.toUserId,
              fromUserId: notif.fromUserId,
              data: notif.data
            });
          });
          
          // حذف الإشعارات بالـ IDs
          const reactionIds = relevantReactions.map(r => r._id);
          const deletedReactionsResult = await this.notificationModel.deleteMany({
            _id: { $in: reactionIds }
          });
          
          console.log(`[DEBUG] Deleted ${deletedReactionsResult.deletedCount} COMMENT_REACTION notifications by ID`);
          
          // إرسال إشعار للمستخدمين المتأثرين
          const affectedUsers = new Set<string>();
          relevantReactions.forEach(notif => affectedUsers.add(notif.toUserId.toString()));
          
          for (const userId of affectedUsers) {
            console.log(`[DEBUG] Sending reaction delete notification to user: ${userId}`);
            this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
              type: 'COMMENT_REACTION',
              commentId: commentId,
            });
          }
        }
        
        // كذلك، حذف إضافي بالاستعلامات التقليدية للتأكد
        const reactionDeleteQueries = [
          { type: 'COMMENT_REACTION', 'data.commentId': commentId },
          { type: 'COMMENT_REACTION', 'data._id': commentId },
          { type: 'COMMENT_REACTION', 'data.comment._id': commentId },
          { type: 'COMMENT_REACTION', 'data.comment.commentId': commentId }
        ];
        
        let totalReactionsDeleted = relevantReactions.length;
        for (const [index, query] of reactionDeleteQueries.entries()) {
          try {
            const deletedResult = await this.notificationModel.deleteMany(query);
            if (deletedResult.deletedCount > 0) {
              totalReactionsDeleted += deletedResult.deletedCount;
              console.log(`[DEBUG] Additional reaction query ${index + 1} deleted ${deletedResult.deletedCount} notifications`);
            }
          } catch (error) {
            console.error(`[ERROR] Reaction query ${index + 1} failed:`, error.message);
          }
        }
        
        console.log(`[DEBUG] Total COMMENT_REACTION notifications deleted: ${totalReactionsDeleted}`);
        
        // 🔥 فحص خاص لإشعارات التفاعلات الخاصة بصاحب التعليق
        console.log('[DEBUG] Checking for remaining reaction notifications for comment owner...');
        const ownerReactionNotifications = await this.notificationModel.find({
          type: 'COMMENT_REACTION',
          toUserId: toUserId
        }).lean();
        
        console.log(`[DEBUG] Found ${ownerReactionNotifications.length} COMMENT_REACTION notifications for comment owner (${toUserId})`);
        
        if (ownerReactionNotifications.length > 0) {
          console.log('[DEBUG] Comment owner reaction notifications:');
          ownerReactionNotifications.forEach((notif, index) => {
            const isRelated = 
              (notif.data.commentId && notif.data.commentId.toString() === commentId) ||
              (notif.data._id && notif.data._id.toString() === commentId) ||
              (notif.data.comment && notif.data.comment._id && 
               notif.data.comment._id.toString() === commentId) ||
              JSON.stringify(notif.data).includes(commentId);
               
            console.log(`[DEBUG] Owner reaction ${index + 1} (Related: ${isRelated}):`, {
              _id: notif._id,
              toUserId: notif.toUserId,
              fromUserId: notif.fromUserId,
              data: notif.data
            });
            
            // إذا كان مرتبط بالتعليق المحذوف، احذفه فورياً
            if (isRelated) {
              console.log(`[DEBUG] Deleting related owner reaction notification: ${notif._id}`);
              this.notificationModel.findByIdAndDelete(notif._id).catch(error => {
                console.error(`[ERROR] Failed to delete owner reaction ${notif._id}:`, error);
              });
              
              // إرسال إشعار حذف للمالك
              this.gateway.server.to(`user:${toUserId}`).emit('notification:delete', {
                type: 'COMMENT_REACTION',
                commentId: commentId,
                notificationId: notif._id.toString()
              });
            }
          });
        }

        // 🔥 حذف إشعارات الردود (COMMENT_ADDED) اللي parentCommentId بتاعها هو التعليق المحذوف
        const repliesDeleted = await this.notificationModel.deleteMany({
          type: 'COMMENT_ADDED',
          $or: [
            { 'data.parentCommentId': commentId },
            { 'data.comment.parentCommentId': commentId },
            { 'data.commentId': commentId }, // أحياناً الرد نفسه متخزن كده
          ],
        });
        console.log('[DEBUG] COMMENT_ADDED deleted count (replies to deleted comment):', repliesDeleted.deletedCount);
        
        // 🔥 البحث عن الردود المرتبطة بالتعليق المحذوف وحذف تفاعلاتها أيضاً
        try {
          const Model = this.notificationModel.db.model('Comment');
          const replyComments = await Model.find({ parentCommentId: commentId }).select('_id').lean();
          const replyIds = replyComments.map((reply: any) => reply._id.toString());
          
          console.log(`[DEBUG] Found ${replyIds.length} reply comments to delete reactions for`);
          
          if (replyIds.length > 0) {
            console.log(`[DEBUG] Reply IDs: ${replyIds.join(', ')}`);
            
            // 🔥 استخدام نفس الطريقة المحسنة للبحث عن إشعارات تفاعلات الردود
            const allReactionNotifications = await this.notificationModel.find({
              type: 'COMMENT_REACTION'
            }).lean();
            
            console.log(`[DEBUG] Searching through ${allReactionNotifications.length} reaction notifications for replies`);
            
            let totalReplyReactionsDeleted = 0;
            const allReplyReactionIds: any[] = [];
            
            // البحث عن الإشعارات المرتبطة بكل رد
            for (const replyId of replyIds) {
              console.log(`[DEBUG] Processing reply ID: ${replyId}`);
              
              const relevantReplyReactions = allReactionNotifications.filter(notification => {
                if (!notification.data) return false;
                
                // التحقق من جميع الطرق المحتملة لتخزين معرف الرد
                const replyMatches = 
                  (notification.data.commentId && notification.data.commentId.toString() === replyId) ||
                  (notification.data._id && notification.data._id.toString() === replyId) ||
                  (notification.data.comment && notification.data.comment._id && 
                   notification.data.comment._id.toString() === replyId) ||
                  (notification.data.comment && notification.data.comment.commentId && 
                   notification.data.comment.commentId.toString() === replyId) ||
                  // البحث في أي مكان في البيانات
                  JSON.stringify(notification.data).includes(replyId);
                   
                return replyMatches;
              });
              
              console.log(`[DEBUG] Found ${relevantReplyReactions.length} reaction notifications for reply ${replyId}`);
              
              if (relevantReplyReactions.length > 0) {
                // عرض أمثلة على الإشعارات
                relevantReplyReactions.slice(0, 2).forEach((notif, index) => {
                  console.log(`[DEBUG] Reply reaction ${index + 1} for ${replyId}:`, {
                    _id: notif._id,
                    toUserId: notif.toUserId,
                    fromUserId: notif.fromUserId,
                    data: notif.data
                  });
                });
                
                // جمع IDs للحذف
                const replyReactionIds = relevantReplyReactions.map(r => r._id);
                allReplyReactionIds.push(...replyReactionIds);
                
                // إرسال إشعار للمستخدمين المتأثرين قبل الحذف
                const affectedUsers = new Set<string>();
                relevantReplyReactions.forEach(notif => affectedUsers.add(notif.toUserId.toString()));
                
                for (const userId of affectedUsers) {
                  console.log(`[DEBUG] Sending reply reaction delete notification to user: ${userId} for reply: ${replyId}`);
                  this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
                    type: 'COMMENT_REACTION',
                    commentId: replyId,
                  });
                }
              }
            }
            
            // حذف جميع إشعارات تفاعلات الردود دفعة واحدة
            if (allReplyReactionIds.length > 0) {
              const deletedReplyReactionsResult = await this.notificationModel.deleteMany({
                _id: { $in: allReplyReactionIds }
              });
              totalReplyReactionsDeleted = deletedReplyReactionsResult.deletedCount;
              console.log(`[DEBUG] Deleted ${totalReplyReactionsDeleted} reply reaction notifications by ID`);
            }
            
            // حذف إضافي بالاستعلامات التقليدية للتأكد
            for (const replyId of replyIds) {
              const replyReactionQueries = [
                { type: 'COMMENT_REACTION', 'data.commentId': replyId },
                { type: 'COMMENT_REACTION', 'data._id': replyId },
                { type: 'COMMENT_REACTION', 'data.comment._id': replyId }
              ];
              
              for (const query of replyReactionQueries) {
                try {
                  const additionalDeleted = await this.notificationModel.deleteMany(query);
                  if (additionalDeleted.deletedCount > 0) {
                    totalReplyReactionsDeleted += additionalDeleted.deletedCount;
                    console.log(`[DEBUG] Additional query deleted ${additionalDeleted.deletedCount} notifications for reply ${replyId}`);
                  }
                } catch (error) {
                  console.error(`[ERROR] Failed to delete additional reactions for reply ${replyId}:`, error.message);
                }
              }
            }
            
            console.log(`[DEBUG] Total reply COMMENT_REACTION notifications deleted: ${totalReplyReactionsDeleted}`);
          }
        } catch (error) {
          console.error('[ERROR] Failed to find and delete reply reactions:', error);
        }

        // حذف إشعارات COMMENT_ADDED بنفس الطريقة القديمة
        const deleteQueries = [
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data.commentId': commentId },
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data._id': commentId },
        ];
        let totalDeleted = 0;
        for (const query of deleteQueries) {
          const existing = await this.notificationModel.find(query);
          if (existing && existing.length > 0) {
            const deletedNotifications = await this.notificationModel.deleteMany(query);
            totalDeleted += deletedNotifications.deletedCount;
          }
        }
        
        // 🔥 محاولات حذف إضافية شاملة
        const additionalDeleteQueries = [
          // بدون تحديد المستخدم - للحذف الشامل
          { type: 'COMMENT_ADDED', 'data.commentId': commentId },
          { type: 'COMMENT_ADDED', 'data._id': commentId },
          { type: 'COMMENT_ADDED', 'data.comment._id': commentId },
          { type: 'COMMENT_ADDED', 'data.comment.commentId': commentId },
          
          // مع المستخدم المحدد
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data.comment._id': commentId },
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data.comment.commentId': commentId },
          
          // البحث في كامل الـ data object
          { type: 'COMMENT_ADDED', 'data': { $regex: commentId } },
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data': { $regex: commentId } }
        ];
        
        console.log('[DEBUG] Attempting additional deletion methods...');
        for (const [index, query] of additionalDeleteQueries.entries()) {
          try {
            const existing = await this.notificationModel.find(query).lean();
            console.log(`[DEBUG] Additional query ${index + 1} found ${existing.length} notifications:`, JSON.stringify(query));
            
            if (existing.length > 0) {
              const deletedResult = await this.notificationModel.deleteMany(query);
              totalDeleted += deletedResult.deletedCount;
              console.log(`[DEBUG] Additional query ${index + 1} deleted ${deletedResult.deletedCount} notifications`);
            }
          } catch (error) {
            console.error(`[ERROR] Additional query ${index + 1} failed:`, error.message);
          }
        }
        
        console.log(`[NOTIFICATION] Total deleted comment notifications: ${totalDeleted}`, {
          to: `user:${toUserId}`,
          type: 'COMMENT_ADDED',
          commentId: commentId,
        });
        console.log(`[NOTIFICATION] Total deleted reply notifications: ${repliesDeleted.deletedCount}`, {
          type: 'COMMENT_ADDED',
          parentCommentId: commentId,
        });
        // إرسال إشعار للعميل بالحذف للتعليق الأساسي
        this.gateway.server.to(`user:${toUserId}`).emit('notification:delete', {
          type: 'COMMENT_ADDED',
          commentId: commentId,
        });

        // 🔥 إرسال إشعار للعميل بحذف إشعارات الردود كمان
        if (repliesDeleted.deletedCount > 0) {
          console.log('[NOTIFICATION] Emitting socket event for deleted reply notifications');
          this.gateway.server.emit('notification:delete', {
            type: 'COMMENT_ADDED',
            commentId: commentId, // commentId هنا هو parentCommentId للردود
          });
        }
        
        // 🔥 فحص نهائي للإشعارات المتبقية
        console.log('[DEBUG] Final check for remaining notifications...');
        const remainingNotifications = await this.notificationModel.find({
          $or: [
            { toUserId: toUserId, type: 'COMMENT_ADDED' },
            { type: 'COMMENT_ADDED', 'data.commentId': commentId },
            { type: 'COMMENT_ADDED', 'data._id': commentId },
            { type: 'USER_MENTIONED', 'data.commentId': commentId },
            { type: 'USER_MENTIONED', 'data._id': commentId },
            // إضافة فحص إشعارات التفاعلات
            { type: 'COMMENT_REACTION', 'data.commentId': commentId },
            { type: 'COMMENT_REACTION', 'data._id': commentId },
            { type: 'COMMENT_REACTION', 'data.comment._id': commentId }
          ]
        }).lean();
        
        if (remainingNotifications.length > 0) {
          console.log(`⚠️ [WARNING] ${remainingNotifications.length} notifications still remain after deletion:`);
          
          // تجميع الإشعارات حسب النوع
          const remainingByType = remainingNotifications.reduce((acc, notif) => {
            acc[notif.type] = (acc[notif.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          console.log(`[WARNING] Remaining notifications by type:`, remainingByType);
          
          remainingNotifications.forEach((notif, index) => {
            console.log(`[WARNING] Remaining notification ${index + 1}:`, {
              _id: notif._id,
              type: notif.type,
              toUserId: notif.toUserId,
              fromUserId: notif.fromUserId,
              data: JSON.stringify(notif.data, null, 2)
            });
          });
          
          // محاولة حذف أخيرة للإشعارات المتبقية
          try {
            const forceDeleteIds = remainingNotifications.map(n => n._id);
            const forceDeleteResult = await this.notificationModel.deleteMany({
              _id: { $in: forceDeleteIds }
            });
            console.log(`🔥 [FORCE DELETE] Successfully deleted ${forceDeleteResult.deletedCount} remaining notifications by ID`);
            
            // إرسال إشعار حذف لكل نوع من الإشعارات المحذوفة
            const deletedByType = remainingNotifications.reduce((acc, notif) => {
              if (!acc[notif.type]) acc[notif.type] = new Set();
              acc[notif.type].add(notif.toUserId.toString());
              return acc;
            }, {} as Record<string, Set<string>>);
            
            for (const [type, userIds] of Object.entries(deletedByType)) {
              for (const userId of userIds) {
                this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
                  type: type,
                  commentId: commentId,
                  forceDeleted: true
                });
              }
            }
          } catch (forceError) {
            console.error('❌ [FORCE DELETE] Failed to delete remaining notifications:', forceError);
          }
        } else {
          console.log('✅ [SUCCESS] No notifications remaining - all deleted successfully');
        }
      }

      else if (data.type === 'POST' && data.postId) {
        try {
          const postId = data.postId;
          
           console.log('🔍 [DEBUG] Checking notifications for postId:', postId);
           
          // تحسين الاستعلام ليشمل جميع الحالات المحتملة
          const deleteQuery = {
             $or: [
              // الحالات الأساسية
              { 'data.postId': postId },           
              { 'data.postId._id': postId },       
              { 'data.post._id': postId },         
              { 'data._id': postId },              
              
              // حالات إضافية محتملة
              { 'data.post.postId': postId },
              { 'data.post.id': postId },
              { 'data.id': postId },
              
              // للتعليقات المرتبطة بالمنشور
              { 'data.comment.postId': postId },
              { 'data.comment.post._id': postId },
              { 'data.comment.post.postId': postId },
              
              // للـ mentions المرتبطة بالمنشور
              { 'data.postId': { $eq: postId } },
              
              // ObjectId comparison
              ...(postId.length === 24 ? [
                { 'data.postId': { $eq: new this.notificationModel.base.Types.ObjectId(postId) } },
                { 'data.post._id': { $eq: new this.notificationModel.base.Types.ObjectId(postId) } }
              ] : [])
            ]
          };
          
          // أولاً، البحث عن التعليقات المرتبطة بهذا المنشور لحذف إشعاراتها أيضًا
          let commentRelatedQueries: any[] = [];
          try {
            // البحث عن التعليقات المرتبطة بالمنشور
            const Model = this.notificationModel.db.model('Comment');
            const relatedComments = await Model.find({ postId: postId }).select('_id').lean();
            const commentIds = relatedComments.map((c: any) => c._id.toString());
            
            console.log(`🔍 [DEBUG] Found ${commentIds.length} comments related to post ${postId}`);
            
            if (commentIds.length > 0) {
              // إنشاء استعلامات منفصلة للتعليقات المرتبطة
              commentRelatedQueries = commentIds.flatMap(commentId => [
                { 'data.commentId': commentId },
                { 'data._id': commentId },
                { 'data.comment._id': commentId },
                { 'data.comment.commentId': commentId }
              ]);
              
              console.log(`🔍 [DEBUG] Created ${commentRelatedQueries.length} additional queries for related comments`);
            }
          } catch (commentError) {
            console.error('❌ Error finding related comments:', commentError);
          }
          
          // دمج جميع الاستعلامات
          const finalDeleteQuery = {
            $or: [
              ...deleteQuery.$or,
              ...commentRelatedQueries
            ]
          };
          
          // البحث عن كل الإشعارات المرتبطة بالبوست أولاً
          const allPostNotifications = await this.notificationModel.find(finalDeleteQuery).lean();
           
           console.log(`🔍 [DEBUG] Found ${allPostNotifications.length} notifications for postId: ${postId}`);
           
           if (allPostNotifications.length > 0) {
            console.log('🔍 [DEBUG] Sample notification structures:');
            
            // إظهار أمثلة على هياكل الإشعارات المختلفة
            const sampleTypes = new Map();
            allPostNotifications.forEach((notif, index) => {
              if (index < 3) { // أول 3 فقط
                console.log(`🔍 [DEBUG] Notification ${index + 1}:`, {
                  _id: notif._id,
                  type: notif.type,
                  toUserId: notif.toUserId,
                  data: notif.data,
                });
              }
              
              // تجميع حسب النوع
              const count = sampleTypes.get(notif.type) || 0;
              sampleTypes.set(notif.type, count + 1);
            });
            
            console.log('🔍 [DEBUG] Notification types found:', Object.fromEntries(sampleTypes));
          }

          // جمع المستخدمين المتأثرين قبل الحذف
           const affectedUsers = new Set<string>();
           allPostNotifications.forEach(n => affectedUsers.add(n.toUserId.toString()));

          // حذف كل الإشعارات باستخدام نفس الاستعلام
          const deletedResult = await this.notificationModel.deleteMany(finalDeleteQuery);
           const totalDeleted = deletedResult.deletedCount;

          console.log(`[NOTIFICATION] Deleted ${totalDeleted} notifications for postId: ${postId}`);
          console.log(`[NOTIFICATION] Affected users: ${Array.from(affectedUsers)}`);
          
          // التحقق من وجود إشعارات متبقية
          const remainingNotifications = await this.notificationModel.find(finalDeleteQuery).lean();
          if (remainingNotifications.length > 0) {
            console.log(`⚠️ [WARNING] ${remainingNotifications.length} notifications still remain after deletion:`, 
              remainingNotifications.map(n => ({
                _id: n._id,
                type: n.type,
                data: n.data
              }))
            );
            
            // محاولة حذف أخيرة بطريقة مختلفة
            const forceDeleteQuery = {
              $or: [
                ...finalDeleteQuery.$or,
                // محاولة البحث في كامل الـ data object
                { 'data': { $regex: postId } }
              ]
            };
            
            const forceDeleteResult = await this.notificationModel.deleteMany(forceDeleteQuery);
            console.log(`🔥 [FORCE DELETE] Deleted ${forceDeleteResult.deletedCount} additional notifications`);
          }

          // إرسال حدث الحذف لكل مستخدم متأثر
          for (const userId of affectedUsers) {
            console.log(`📡 [DEBUG] Sending delete event to user: ${userId}`);
            this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
              type: 'POST',
              postId: postId,
              affectedTypes: ['POST_CREATED', 'POST_REACTION', 'COMMENT_ADDED', 'COMMENT_REACTION', 'USER_MENTIONED']
            });
          }

        } catch (err) {
          this.logger.error('❌ Error deleting notifications for post:', err);
        }
      }

      this.logger.log(`✅ Successfully processed notification.source.deleted for type: ${data.type}`);
      channel.ack(originalMsg);

    } catch (error) {
      this.logger.error(
        `❌ Failed to process notification.source.deleted: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  @EventPattern('notification.mentioned')
  async handleMentioned(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥🔥🔥 Mention handler started', data);
    console.log('[DEBUG] Mention data structure:', JSON.stringify(data, null, 2));
    console.log('[DEBUG] Mention data.data:', JSON.stringify(data.data, null, 2));
    
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const toUserId = extractObjectId(data.toUserId);
      const fromUserId = extractObjectId(data.fromUserId);
      this.logger.log('Mention toUserId:', toUserId, 'fromUserId:', fromUserId);
      if (toUserId !== fromUserId) {
        this.logger.log('Calling notificationService.create', {
          toUserId,
          fromUserId,
          data: data.data,
          type: NotificationType.USER_MENTIONED,
          content: data.content || 'You were mentioned',
        });
        const notification = await this.notificationService.create({
          toUserId,
          fromUserId,
          data: data.data,
          type: NotificationType.USER_MENTIONED,
          content: data.content || 'You were mentioned',
        });
        this.logger.log('Notification created', notification);
        console.log('[DEBUG] Created mention notification structure:', JSON.stringify(notification, null, 2));
      } else {
        this.logger.log('Mention ignored: self-mention');
      }
      channel.ack(originalMsg);
      this.logger.log(`✅ Acknowledged notification.mentioned for`, data);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process notification.mentioned: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  // Add this handler if not present
  // This is for completeness, but the main change is to ensure notification:update is emitted from the service, not handled here.
  @EventPattern('notification.update')
  async handleNotificationUpdate(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥🔥 handleNotificationUpdate started', data);
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      // Use _id as the notification id
      const notificationId = (data as any)._id;
      if (!notificationId) {
        this.logger.warn('Received notification.update without _id', data);
        channel.ack(originalMsg);
        return;
      }

      const updatedNotification = await this.notificationModel.findByIdAndUpdate(
        notificationId,
        { $set: data },
        { new: true },
      );

      if (updatedNotification) {
        this.logger.log(`💾 Notification updated: ${updatedNotification._id}`);
        this.gateway.server.to(`user:${updatedNotification.toUserId}`).emit('notification:update', {
          notification: updatedNotification,
        });
      } else {
        this.logger.warn(`Notification with ID ${notificationId} not found for update`, data);
      }
      channel.ack(originalMsg);
      this.logger.log(`✅ Acknowledged notification.update for`, data);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process notification.update: ${error.message}`,
        error.stack,
      );
      channel.nack(originalMsg, false, true);
    }
  }

  // @EventPattern('#')
  // async handleUnknownEvent(@Payload() data: any, @Ctx() context: RmqContext) {
  //   const routingKey = context.getPattern();
  //   this.logger.warn(
  //     `⚠️ Unhandled event with routing key: ${routingKey}, data: ${JSON.stringify(data)}`,
  //   );
  //   const channel = context.getChannelRef();
  //   const originalMsg = context.getMessage();
  //   channel.ack(originalMsg);
  // }
}
