import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';

@Controller()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor() {
    this.logger.log('✅ NotificationListener initialized');
  }
  //   @EventPattern('#') // Match all events (user.*, post.*, comment.*)
  //   async handleEvent(@Payload() data: any, @Ctx() context: RmqContext) {
  //     const routingKey = context.getPattern();
  //     this.logger.log(`🔥 Event triggered with routing key: ${routingKey}`);
  //     this.logger.log(`📨 Received event with data: ${JSON.stringify(data)}`);
  //     try {
  //       switch (routingKey) {
  //         case 'user.login':
  //           this.logger.log(`Processing user.login for email: ${data.email}`);
  //           // Add processing logic (e.g., save to database)
  //           break;
  //         case 'post.created':
  //           this.logger.log(`Processing post.created for postId: ${data.postId}`);
  //           // Add processing logic
  //           break;
  //         case 'post.liked':
  //           this.logger.log(`Processing post.liked for postId: ${data.postId}`);
  //           // Add processing logic
  //           break;
  //         case 'comment.added':
  //           this.logger.log(
  //             `Processing comment.added for commentId: ${data.commentId}`,
  //           );
  //           // Add processing logic
  //           break;
  //         default:
  //           this.logger.warn(`Unknown routing key: ${routingKey}`);
  //       }

  //       // Acknowledge the message
  //       const channel = context.getChannelRef();
  //       const originalMsg = context.getMessage();
  //       channel.ack(originalMsg);
  //       this.logger.log(`✅ Acknowledged event: ${routingKey}`);
  //     } catch (error) {
  //       this.logger.error(
  //         `❌ Failed to process event ${routingKey}: ${error.message}`,
  //         error.stack,
  //       );
  //       // Optionally, reject and requeue
  //       // channel.nack(originalMsg, false, true);
  //     }
  //   }
  @EventPattern('user.login')
  async handleUserLogin(
    @Payload() data: { email: string },
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handleUserLogin triggered');
    this.logger.log(`📨 Received user.login event for: ${data.email}`);
    try {
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
      this.logger.error(`❌ Ack failed: ${err.message}`, err.stack);
    }
  }

  @EventPattern('post.created')
  async handlePostCreated(
    @Payload() data: { postId: string; userId: string },
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostCreated triggered');
    this.logger.log(
      `📨 Received post.created event for postId: ${data.postId}`,
    );
    try {
      // Simulate processing
      this.logger.log(`Processing post.created for postId: ${data.postId}`);

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
    }
  }

  @EventPattern('post.liked')
  async handlePostLiked(
    @Payload() data: { postId: string; userId: string },
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handlePostLiked triggered');
    this.logger.log(`📨 Received post.liked event for postId: ${data.postId}`);
    try {
      // Simulate processing
      this.logger.log(`Processing post.liked for postId: ${data.postId}`);

      // Acknowledge the message
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.ack(originalMsg);
      this.logger.log(`✅ Acknowledged post.liked for postId: ${data.postId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process post.liked: ${error.message}`,
        error.stack,
      );
    }
  }

  @EventPattern('comment.added')
  async handleCommentAdded(
    @Payload() data: { commentId: string; postId: string; userId: string },
    @Ctx() context: RmqContext,
  ) {
    this.logger.log('🔥 handleCommentAdded triggered');
    this.logger.log(
      `📨 Received comment.added event for commentId: ${data.commentId}`,
    );
    try {
      // Simulate processing
      this.logger.log(
        `Processing comment.added for commentId: ${data.commentId}`,
      );

      // Acknowledge the message
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.ack(originalMsg);
      this.logger.log(
        `✅ Acknowledged comment.added for commentId: ${data.commentId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process comment.added: ${error.message}`,
        error.stack,
      );
    }
  }
}
