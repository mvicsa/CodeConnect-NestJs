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
import { NotificationGateway } from './notification.gateway';

@Controller()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly moduleRef: ModuleRef,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly gateway: NotificationGateway,
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
    );
    this.logger.log(
      `📨 Received user.login event for: ${notificationDto.toUserId}`,
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

  //---------------> 2
  @EventPattern('post.created')
  async handlePostCreated(
    @Payload() data: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostCreated triggered');
    this.logger.log(
      `📨 Received post.created event for postId: ${data.content}`,
    );
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      this.logger.log(`Processing post.created for postId: ${data.content}`);

      // Save notification to the database
      //     // Fetch followers (import UserService or use a message pattern to communicate with UserModule)
      //     // const userService = this.moduleRef.get<UserService>(UserService, {
      //     //   strict: false,
      //     // }); // Or use RabbitMQ to fetch followers
      //     // const followers: string[] = await userService.getFollowers(data.toUserId);

      // if (notifications.length === 0) {
      //   this.logger.log('⚠️ No followers found, skipping notification creation');
      //   channel.ack(originalMsg);
      //   return;
      // }

      //     // Create notifications for each follower
      //     // const notifications: CreateNotificationDto[] = followers.map(
      //     //   (followerId) => ({
      //     //     toUserId: followerId,
      //     //     fromUserId: data.toUserId,
      //     //     content: `User ${data.toUserId} created a new post: ${data.content || data.postId}`,
      //     //     type: NotificationType.POST_CREATED,
      //     //     data: { postId: data.postId },
      //     //   }),
      //     // );

      //     //const notificationPromises = await this.notificationService.addNotifications(notifications);
      // console.log('we created a notifications', notificationPromises);
      // await Promise.all(notificationPromises);
      //     // this.logger.log(
      //     //   `💾 Created notifications for ${followers.length} followers`,
      //     // );

      // Acknowledge the message

      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged post.created for postId: ${data.data.postId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.created: ${error.message}`,
        error.stack,
      );
      // Optionally requeue: channel.nack(originalMsg, false, true);
      channel.nack(originalMsg, false, true);
    }
  }

  //---------------> 3
  @EventPattern('post.reaction')
  async handlePostLiked(
    @Payload() notificationDto: CreateNotificationDto,
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostLiked triggered');
    this.logger.log(
      `📨 Received post.reaction event for postId: ${notificationDto.data?.postId}`,
    );

    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const createdNotification = await this.notificationService.create({
        ...notificationDto,
        type: NotificationType.POST_REACTION,
        content: `Your post was reaction by ${notificationDto.fromUserId || 'someone'}`,
      });
      this.logger.log(`💾 Notification saved: ${createdNotification._id}`);
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged post.reaction for postId: ${notificationDto.data?.postId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.reaction: ${error.message}`,
        error.stack,
      );
      // Optionally requeue:
      channel.nack(originalMsg, false, true);
    }
  }

  //---------------> 4

  // @EventPattern('comment.added') ===> correct ok
  // async handleCommentAdded(
  //   @Payload() data: createNotificationDto,
  //   @Ctx() context: RmqContext,
  // ) {
  //   this.logger.log('🔥 handleCommentAdded triggered');
  //   this.logger.log(
  //     `📨 Received comment.added event for commentId: ${data.commentId}`,
  //   );

  //     const channel = context.getChannelRef();
  //     const originalMsg = context.getMessage();
  //   try {
  //     // Fetch post owner (requires UserService or PostService)
  //     // const postService = this.moduleRef.get(PostService); // Assume PostService exists
  //     // const post = await postService.findById(data.postId);
  //     const notification = await this.notificationService.create({
  //       toUserId: post.toUserId, // Notify post owner
  //       fromUserId: data.toUserId,
  //       content: `Your post received a new comment from ${data.toUserId}`,
  //       type: NotificationType.COMMENT_ADDED,
  //       data: { commentId: data.commentId, postId: data.postId },
  //     });
  //     this.logger.log(`💾 Notification saved: ${notification._id}`);

  //     channel.ack(originalMsg);
  //     this.logger.log(
  //       `✅ Acknowledged comment.added for commentId: ${data.commentId}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `❌ Failed to process comment.added: ${error.message}`,
  //       error.stack,
  //     );
  //     // Optionally requeue:
  //  channel.nack(originalMsg, false, true);
  //   }
  // }

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
        content: `You were followed by ${data.fromUserId}`,
        type: NotificationType.FOLLOWED_USER,
        data: { follower: data.fromUserId },
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
      await this.notificationService.create({
        toUserId: data.toUserId,
        content: `You have received a message from ${data.fromUserId}`,
        type: NotificationType.MESSAGE_RECEIVED,
        data: data.data,
        fromUserId: data.fromUserId,
      });
      channel.ack(originalMsg);
    } catch (error) {
      console.log('Error in the part of handleMessage received ok ', error);
      channel.nack(originalMsg);
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
