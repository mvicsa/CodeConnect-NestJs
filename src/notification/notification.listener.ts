import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationService } from './notification.service';
import { ModuleRef } from '@nestjs/core';
import {
  NotificationDocument,
  NotificationType,
} from './entities/notification.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Notification } from './entities/notification.schema';

@Controller()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly moduleRef: ModuleRef,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {
    this.logger.log('✅ NotificationListener initialized');
  }
  @EventPattern('#')
  async handleUnknownEvent(@Payload() data: any, @Ctx() context: RmqContext) {
    const routingKey = context.getPattern();
    this.logger.warn(
      `⚠️ Unhandled event with routing key: ${routingKey}, data: ${JSON.stringify(data)}`,
    );
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    channel.ack(originalMsg);
  }

  @EventPattern('user.login')
  async handleUserLogin(
    @Payload() notificationDto: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handleUserLogin triggered');
    this.logger.log(
      `📨 Received user.login event for: ${notificationDto.content}`,
    );
    this.logger.log(
      `📨 Received user.login event for: ${notificationDto.userId}`,
    );

    try {
      // Save notification to the database
      const createdNotification = await this.notificationService.create({
        ...notificationDto,
        type: NotificationType.LOGIN,
      });
      // await this.notificationService.create(notificationDto);
      this.logger.log(`💾 Notification saved: ${createdNotification._id}`);

      // Acknowledge the message
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();

      if (originalMsg?.fields?.deliveryTag) {
        channel.ack(originalMsg);
        this.logger.log(
          `✅ Acknowledged message with tag: ${originalMsg.fields.deliveryTag}`,
        );
      } else {
        this.logger.warn(`⚠️ No deliveryTag found, skipping ack`);
      }
    } catch (err) {
      this.logger.error(`❌ Ack or Save failed: ${err.message}`, err.stack);
    }
  }

  // const recentNotifications = await this.notificationService.findByUser(notificationDto.userId);
  // recentNotifications.forEach((notification) =>
  //   this.notificationGateway.sendNotificationToUser(notificationDto.userId, notification),
  // );

  // @EventPattern('post.created')
  // async handlePostCreated(
  //   @Payload() data: { postId: string; userId: string },
  //   @Ctx() context: RmqContext,
  // ) {
  //   this.logger.log('🔥 handlePostCreated triggered');
  //   this.logger.log(
  //     `📨 Received post.created event for postId: ${data.postId}`,
  //   );
  //   try {
  //     // Simulate processing
  //     this.logger.log(`Processing post.created for postId: ${data.postId}`);

  //     // Acknowledge the message
  //     const channel = context.getChannelRef();
  //     const originalMsg = context.getMessage();
  //     channel.ack(originalMsg);
  //     this.logger.log(
  //       `✅ Acknowledged post.created for postId: ${data.postId}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `❌ Failed to process post.created: ${error.message}`,
  //       error.stack,
  //     );
  //   }
  // }

  @EventPattern('post.created')
  async handlePostCreated(
    @Payload() data: { postId: string; userId: string; content?: string },
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostCreated triggered');
    this.logger.log(
      `📨 Received post.created event for postId: ${data.postId}`,
    );

    try {
      // Fetch followers (import UserService or use a message pattern to communicate with UserModule)
      // const userService = this.moduleRef.get<UserService>(UserService, {
      //   strict: false,
      // }); // Or use RabbitMQ to fetch followers
      // const followers: string[] = await userService.getFollowers(data.userId);

      // Create notifications for each follower
      // const notifications: CreateNotificationDto[] = followers.map(
      //   (followerId) => ({
      //     userId: followerId,
      //     fromUserId: data.userId,
      //     content: `User ${data.userId} created a new post: ${data.content || data.postId}`,
      //     type: NotificationType.POST_CREATED,
      //     data: { postId: data.postId },
      //   }),
      // );

      // await this.notificationService.addNotifications(notifications);

      // await Promise.all(notificationPromises);
      // this.logger.log(
      //   `💾 Created notifications for ${followers.length} followers`,
      // );

      // Acknowledge the message
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged post.created for postId: ${data.postId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.created: ${error.message}`,
        error.stack,
      );
      // Optionally requeue: channel.nack(originalMsg, false, true);
    }
  }

  // @EventPattern('post.liked')
  // async handlePostLiked(
  //   @Payload() notificationDto: CreateNotificationDto,
  //   @Ctx() context: RmqContext,
  // ) {
  //   this.logger.log('🔥 handlePostLiked triggered');
  //   this.logger.log(
  //     `📨 Received post.liked event for postId: ${notificationDto.content}`,
  //   );
  //   try {
  //     // Simulate processing
  //     this.logger.log(
  //       `Processing post.liked for postId: ${notificationDto.data}`,
  //     );

  //     // Acknowledge the message
  //     const channel = context.getChannelRef();
  //     const originalMsg = context.getMessage();
  //     channel.ack(originalMsg);
  //     this.logger.log(
  //       `✅ Acknowledged post.liked for postId: ${notificationDto}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `❌ Failed to process post.liked: ${error?.message ?? 'Unknown error'}`,
  //       error?.stack,
  //     );
  //   }
  // }
  @EventPattern('post.liked')
  async handlePostLiked(
    @Payload() notificationDto: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostLiked triggered');
    this.logger.log(
      `📨 Received post.liked event for postId: ${notificationDto.data?.postId}`,
    );

    try {
      const createdNotification = await this.notificationService.create({
        ...notificationDto,
        type: NotificationType.POST_LIKED,
        content: `Your post was liked by ${notificationDto.fromUserId || 'someone'}`,
      });
      this.logger.log(`💾 Notification saved: ${createdNotification._id}`);

      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged post.liked for postId: ${notificationDto.data?.postId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.liked: ${error.message}`,
        error.stack,
      );
      // Optionally requeue: channel.nack(originalMsg, false, true);
    }
  }

  // @EventPattern('comment.added') ===> correct ok
  // @EventPattern('comment.added')
  // async handleCommentAdded(
  //   @Payload() data: { commentId: string; postId: string; userId: string },
  //   @Ctx() context: RmqContext,
  // ) {
  //   this.logger.log('🔥 handleCommentAdded triggered');
  //   this.logger.log(
  //     `📨 Received comment.added event for commentId: ${data.commentId}`,
  //   );

  //   try {
  //     // Fetch post owner (requires UserService or PostService)
  //     // const postService = this.moduleRef.get(PostService); // Assume PostService exists
  //     // const post = await postService.findById(data.postId);
  //     const notification = await this.notificationService.create({
  //       userId: post.userId, // Notify post owner
  //       fromUserId: data.userId,
  //       content: `Your post received a new comment from ${data.userId}`,
  //       type: NotificationType.COMMENT_ADDED,
  //       data: { commentId: data.commentId, postId: data.postId },
  //     });
  //     this.logger.log(`💾 Notification saved: ${notification._id}`);

  //     const channel = context.getChannelRef();
  //     const originalMsg = context.getMessage();
  //     channel.ack(originalMsg);
  //     this.logger.log(
  //       `✅ Acknowledged comment.added for commentId: ${data.commentId}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `❌ Failed to process comment.added: ${error.message}`,
  //       error.stack,
  //     );
  //     // Optionally requeue: channel.nack(originalMsg, false, true);
  //   }
  // }

  // notification.service.ts
  async deleteOldNotifications(days: number) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    return this.notificationModel
      .deleteMany({ createdAt: { $lt: threshold } })
      .exec();
  }

  @EventPattern('user.followed')
  async handleUserFollowed(
    @Payload() data: { userId: string; followerId: string },
    @Ctx() context: RmqContext,
  ) {
    await this.notificationService.create({
      userId: data.userId,
      fromUserId: data.followerId,
      content: `You were followed by ${data.followerId}`,
      type: NotificationType.FOLLOWED_USER,
      data: { followerId: data.followerId },
    });
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    channel.ack(originalMsg);
  }
}
