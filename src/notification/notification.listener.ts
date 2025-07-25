import { Controller, Logger } from '@nestjs/common';
import {
  EventPattern,
  Payload,
  Ctx,
  RmqContext,
  MessagePattern,
} from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './entities/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { Comment } from '../posts/shemas/comment.schema';

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
  private readonly isDebugMode: boolean;

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    private readonly notificationService: NotificationService,
    private readonly gateway: NotificationGateway,
    private readonly userService: UsersService,
    private readonly configService: ConfigService,
    @InjectModel('Comment')
    private readonly commentModel: Model<Comment>,
  ) {
    // Only enable debug logging in development
    this.isDebugMode = this.configService.get('NODE_ENV') === 'development';
  }

  private debugLog(message: string, data?: any) {
    if (this.isDebugMode) {
      if (data && typeof data === 'object') {
        // Only log essential fields to prevent memory issues
        const safeData = {
          _id: data._id,
          type: data.type,
          toUserId: data.toUserId,
          fromUserId: data.fromUserId,
          // Don't log full data object
        };
        this.logger.debug(`${message}: ${JSON.stringify(safeData)}`);
      } else {
        this.logger.debug(message);
      }
    }
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
        this.debugLog('Notification created', createdNotification);
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
      const userService = this.userService; // Use the injected userService directly
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
        this.debugLog('Notification created', notification);
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
      this.logger.error('Error in user.followed', error);
      channel.nack(originalMsg);
    }
  }

  //---------------> 6
  @EventPattern('message.received')
  async handleMessageReceived(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.debugLog('In handleMessageReceived', { toUserId: data?.toUserId, fromUserId: data?.fromUserId });
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
      this.logger.error('Error in handleMessageReceived', error);
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
        this.debugLog('Notification created', createdNotification);
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
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    
    try {
      this.debugLog('Processing notification.source.deleted', { type: data.type });
      
      if (data.notificationId) {
        await this.notificationModel.findByIdAndDelete(data.notificationId);
        this.logger.log(`[NOTIFICATION] Deleted notification by ID: ${data.notificationId}`);
        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          notificationId: data.notificationId,
        });
      }
      else if (data.type === 'USER_MENTIONED' && data.commentId) {
        this.debugLog('Deleting USER_MENTIONED notifications', { commentId: data.commentId });
        
        const commentId = typeof data.commentId === 'object' && data.commentId._id
          ? data.commentId._id.toString()
          : data.commentId.toString();
        
        // Find mentions for this specific comment (with reasonable limit)
        const mentionsForComment = await this.notificationModel.find({
          type: 'USER_MENTIONED',
          $or: [
            { 'data.commentId': commentId },
            { 'data._id': commentId },
            { 'data.parentCommentId': commentId },
          ]
        }).limit(100).lean();
        
        this.debugLog(`Found ${mentionsForComment.length} USER_MENTIONED notifications for comment`, { commentId });
        
        // If we have the comment text, try to extract mentions and delete notifications for those users
        if (data.text) {
          const extractMentions = (text) => {
            if (!text) return [];
            return Array.from(new Set((text.match(/@([a-zA-Z0-9_]+)/g) || []).map(m => m.slice(1))));
          };
          
          const mentions = extractMentions(data.text);
          this.debugLog(`Extracted ${mentions.length} mentions from comment text`);
          
          if (mentions.length > 0) {
            try {
              // Find users by usernames
              const users = await this.userService.findByUsernames(mentions as string[]);
              this.debugLog(`Found ${users.length} mentioned users`);
              
              if (users.length > 0) {
                const userIds = users.map(user => (user as any)._id.toString());
                
                // Delete USER_MENTIONED notifications for these specific users related to this comment
                const mentionDeleteResult = await this.notificationModel.deleteMany({
                  type: 'USER_MENTIONED',
                  toUserId: { $in: userIds },
                  $or: [
                    { 'data.commentId': commentId },
                    { 'data._id': commentId },
                    { 'data.parentCommentId': commentId },
                    { 'data.comment._id': commentId },
                  ]
                });
                
                this.logger.log(`Deleted ${mentionDeleteResult.deletedCount} mention notifications using extracted mentions`);
                
                // Notify these users about the deletion
                for (const userId of userIds) {
                  this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
                    type: 'USER_MENTIONED',
                    commentId: commentId,
                  });
                }
              }
            } catch (error) {
              this.logger.error('Error finding mentioned users:', error);
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
            { 'data.comment._id': commentId },
          ],
        });
        
        this.logger.log(`USER_MENTIONED deleted count: ${mentionedDeleted.deletedCount}`);
      }
      else if (data.type === 'USER_MENTIONED' && data.postId) {
        this.debugLog('Deleting USER_MENTIONED notifications for post', { postId: data.postId });
        
        const postId = typeof data.postId === 'object' && data.postId._id
          ? data.postId._id.toString()
          : data.postId.toString();
        
        // Simple deletion without extensive debugging
        const mentionedDeleted = await this.notificationModel.deleteMany({
          type: 'USER_MENTIONED',
          $or: [
            { 'data.postId': postId },
            { 'data._id': postId },
            { 'data.post._id': postId },
          ],
        });
        
        this.logger.log(`Deleted ${mentionedDeleted.deletedCount} mention notifications for post ${postId}`);
      }
      else if (data.type === 'COMMENT_REACTION') {
        this.debugLog('Deleting COMMENT_REACTION notifications', { commentId: data.commentId });
        
        const commentId = typeof data.commentId === 'object' && data.commentId._id
          ? data.commentId._id.toString()
          : data.commentId.toString();
        
        // Find relevant reactions (with reasonable limit)
        const reactionNotifications = await this.notificationModel.find({
          type: 'COMMENT_REACTION'
        }).limit(1000).lean();
        
        const relevantReactions = reactionNotifications.filter(notification => {
          if (!notification.data) return false;
          return (
            (notification.data.commentId && notification.data.commentId.toString() === commentId) ||
            (notification.data._id && notification.data._id.toString() === commentId) ||
            (notification.data.comment && notification.data.comment._id && 
             notification.data.comment._id.toString() === commentId)
          );
        });
        
        this.debugLog(`Found ${relevantReactions.length} relevant COMMENT_REACTION notifications`);
        
        if (relevantReactions.length > 0) {
          const reactionIds = relevantReactions.map(r => r._id);
          const deletedResult = await this.notificationModel.deleteMany({
            _id: { $in: reactionIds }
          });
          
          this.logger.log(`Deleted ${deletedResult.deletedCount} COMMENT_REACTION notifications for comment ${commentId}`);
          
          // Notify affected users
          const affectedUsers = new Set(relevantReactions.map(r => r.toUserId.toString()));
          for (const userId of affectedUsers) {
            this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
              type: 'COMMENT_REACTION',
              commentId: commentId,
            });
          }
        }
      }
      else if (data.type === 'POST_REACTION' && data.postId) {
        const postId = typeof data.postId === 'object' && data.postId._id
          ? data.postId._id.toString()
          : data.postId.toString();
        // Remove all previous reaction notifications for this user and post, regardless of reaction type
        const deletedNotifications = await this.notificationModel.deleteMany({
          toUserId: data.toUserId,
          fromUserId: data.fromUserId,
          type: 'POST_REACTION',
          'data.postId': postId,
        });
        this.logger.log(`Deleted ${deletedNotifications.deletedCount} post reaction notifications`);
        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          type: 'POST_REACTION',
          postId: postId,
          fromUserId: data.fromUserId,
        });
      }
      else if (data.type === 'FOLLOWED_USER' && data.followId) {
        const deletedNotifications = await this.notificationModel.deleteMany({
          toUserId: data.toUserId,
          type: 'FOLLOWED_USER',
          'data.followerId': data.followId,
        });

        this.logger.log(`Deleted ${deletedNotifications.deletedCount} follow notifications`);

        this.gateway.server.to(`user:${data.toUserId}`).emit('notification:delete', {
          type: 'FOLLOWED_USER',
          followId: data.followId,
        });
      }
      else if (data.type === 'COMMENT_ADDED' && data.commentId) {
        this.debugLog('Deleting COMMENT_ADDED notifications', { commentId: data.commentId, toUserId: data.toUserId });
        
        const toUserId = typeof data.toUserId === 'object' && data.toUserId._id
          ? data.toUserId._id.toString()
          : data.toUserId.toString();
        const commentId = typeof data.commentId === 'object' && data.commentId._id
          ? data.commentId._id.toString()
          : data.commentId.toString();
        
        // Simplified deletion without extensive debugging
        const deleteQueries = [
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data.commentId': commentId },
          { toUserId: toUserId, type: 'COMMENT_ADDED', 'data._id': commentId },
          { type: 'COMMENT_ADDED', 'data.commentId': commentId },
          { type: 'COMMENT_ADDED', 'data._id': commentId },
        ];
        
        let totalDeleted = 0;
        for (const query of deleteQueries) {
          const deletedResult = await this.notificationModel.deleteMany(query);
          totalDeleted += deletedResult.deletedCount;
        }
        
        // Delete related reply notifications
        const repliesDeleted = await this.notificationModel.deleteMany({
          type: 'COMMENT_ADDED',
          $or: [
            { 'data.parentCommentId': commentId },
            { 'data.comment.parentCommentId': commentId },
          ],
        });
        
        this.logger.log(`Total deleted comment notifications: ${totalDeleted}`);
        this.logger.log(`Total deleted reply notifications: ${repliesDeleted.deletedCount}`);
        
        // Send delete events
        this.gateway.server.to(`user:${toUserId}`).emit('notification:delete', {
          type: 'COMMENT_ADDED',
          commentId: commentId,
        });
        
        if (repliesDeleted.deletedCount > 0) {
          this.gateway.server.emit('notification:delete', {
            type: 'COMMENT_ADDED',
            commentId: commentId,
          });
        }
      }
      else if (data.type === 'POST' && data.postId) {
        this.debugLog('Deleting POST notifications', { postId: data.postId });
        const postIdStr = typeof data.postId === 'object' && data.postId._id
          ? data.postId._id.toString()
          : data.postId.toString();
        const deleteQuery = {
          $or: [
            { 'data.postId': postIdStr },
            { 'data.postId._id': postIdStr },
            { 'data._id': postIdStr },
            { 'data.post._id': postIdStr },
          ]
        };
        // Get affected users before deletion
        const affectedNotifications = await this.notificationModel.find(deleteQuery)
          .select('toUserId')
          .limit(1000)
          .lean();
        const affectedUsers = new Set<string>();
        affectedNotifications.forEach(n => affectedUsers.add(n.toUserId.toString()));
        // Delete notifications
        const deletedResult = await this.notificationModel.deleteMany(deleteQuery);
        const totalDeleted = deletedResult.deletedCount;
        this.logger.log(`Deleted ${totalDeleted} notifications for post: ${postIdStr}`);
        this.logger.log(`Affected users: ${affectedUsers.size}`);
        // Send delete events to affected users
        for (const userId of affectedUsers) {
          this.gateway.server.to(`user:${userId}`).emit('notification:delete', {
            type: 'POST',
            postId: postIdStr,
            affectedTypes: ['POST_CREATED', 'POST_REACTION', 'COMMENT_ADDED', 'COMMENT_REACTION', 'USER_MENTIONED']
          });
        }
        // Also delete COMMENT_REACTION and COMMENT_ADDED notifications for comments/replies on this post
        const commentRelatedQuery = {
          $or: [
            { 'data.postId': postIdStr },
            { 'data.postId._id': postIdStr },
            { 'data.post._id': postIdStr },
          ],
          type: { $in: ['COMMENT_REACTION', 'COMMENT_ADDED'] }
        };
        const deletedCommentRelated = await this.notificationModel.deleteMany(commentRelatedQuery);
        this.logger.log(`Deleted ${deletedCommentRelated.deletedCount} comment/reply notifications for post: ${postIdStr}`);
        // Get all comment IDs for this post from the comments collection
        const commentDocs = await this.commentModel.find({ postId: postIdStr }).select('_id').lean();
        const commentIds = commentDocs.map(c => c._id.toString());
        // Delete notifications for these commentIds
        if (commentIds.length > 0) {
          const commentReactionDeleteQuery = {
            $or: [
              { 'data.commentId': { $in: commentIds } },
              { 'data._id': { $in: commentIds } },
              { 'data.comment._id': { $in: commentIds } },
              { 'data.parentCommentId': { $in: commentIds } },
              { 'data.comment.parentCommentId': { $in: commentIds } },
            ],
            type: 'COMMENT_REACTION'
          };
          const deletedCommentReactions = await this.notificationModel.deleteMany(commentReactionDeleteQuery);
          this.logger.log(`Deleted ${deletedCommentReactions.deletedCount} COMMENT_REACTION notifications for comments/replies on post: ${postIdStr}`);
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
        this.debugLog('Notification created', notification);
        this.debugLog('Created mention notification');
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
