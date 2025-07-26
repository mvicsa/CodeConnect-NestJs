// notification.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UnauthorizedException,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  NotificationDocument,
  NotificationModel,
} from './entities/notification.schema';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Notification } from './entities/notification.schema';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    @InjectModel(Notification.name)
    private readonly notificationModel: NotificationModel,
  ) {}

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get user notifications',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'skip', type: Number, required: false })
  @ApiQuery({ name: 'isRead', type: String, required: false })
  @ApiResponse({ status: 200, description: 'List of user notifications.' })
  @ApiBadRequestResponse({
    description: 'Invalid user ID or query parameters.',
  })
  async getUserNotifications(
    @Param('userId') userId: string,
    @Query('limit') limit = 20,
    @Query('skip') skip = 0,
    @Query('isRead') isRead?: string, // Change to string
  ) {
    if (!userId || typeof userId !== 'string' || !isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const query: any = { toUserId: userId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true'; // Convert string to boolean
    }
    const notifications = await this.notificationService.findByUser(userId);

    // تطبيق pagination يدوياً
    const startIndex = Number(skip);
    const endIndex = startIndex + Number(limit);
    const paginatedNotifications = notifications.slice(startIndex, endIndex);

    return paginatedNotifications;
  }
  //  6 user status, 7 notification status
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @ApiBadRequestResponse({ description: 'Invalid notification ID.' })
  @ApiUnauthorizedResponse({
    description: 'Not authorized to mark this notification as read.',
  })
  @ApiNotFoundResponse({ description: 'Notification not found.' })
  async markAsRead(
    @Param('id') notificationId: string,
    @Query('toUserId') toUserId?: string,
  ) {
    console.log('Marking notification as read:', { notificationId, toUserId });

    if (!isValidObjectId(notificationId)) {
      throw new BadRequestException('Invalid notification ID');
    }

    const notification = await this.notificationModel.findById(notificationId);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (toUserId && notification.toUserId !== toUserId) {
      throw new UnauthorizedException(
        'Not authorized to mark this notification as read',
      );
    }

    const updatedNotification = await this.notificationModel
      .findByIdAndUpdate(notificationId, { isRead: true }, { new: true })
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
      .lean()
      .exec();

    if (!updatedNotification) {
      throw new NotFoundException('Failed to update notification');
    }

    // تحويل البيانات لتكون في الشكل المطلوب
    const result = { ...updatedNotification };

    // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
    if (
      result.data &&
      result.data.postId &&
      typeof result.data.postId === 'object'
    ) {
      const postData = result.data.postId as any;
      result.data.post = postData;
      result.data.postId = postData._id;
    }

    // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
    if (
      result.data &&
      result.data.commentId &&
      typeof result.data.commentId === 'object'
    ) {
      const commentData = result.data.commentId as any;
      result.data.comment = commentData;
      result.data.commentId = commentData._id;
    }

    console.log('Notification marked as read successfully:', result._id);
    return result;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get specific notification',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({ status: 200, description: 'Notification found.' })
  @ApiBadRequestResponse({ description: 'Invalid notification ID.' })
  @ApiNotFoundResponse({ description: 'Notification not found.' })
  async getNotification(@Param('id') id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid notification ID');
    }
    const notification = await this.notificationModel
      .findById(id)
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
      .lean()
      .exec();

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // تحويل البيانات لتكون في الشكل المطلوب
    const result = { ...notification };

    // إذا كان هناك postId وتم populate له، انسخ البيانات إلى data.post
    if (
      result.data &&
      result.data.postId &&
      typeof result.data.postId === 'object'
    ) {
      const postData = result.data.postId as any;
      result.data.post = postData;
      result.data.postId = postData._id;
    }

    // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
    if (
      result.data &&
      result.data.commentId &&
      typeof result.data.commentId === 'object'
    ) {
      const commentData = result.data.commentId as any;
      result.data.comment = commentData;
      result.data.commentId = commentData._id;
    }

    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete notification',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully.',
  })
  @ApiBadRequestResponse({ description: 'Invalid notification ID.' })
  @ApiNotFoundResponse({ description: 'Notification not found.' })
  async deleteNotification(@Param('id') id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid notification ID');
    }
    const result = await this.notificationModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Notification not found');
    }
    return { message: 'Notification deleted successfully' };
  }

  @Delete('user/:userId')
  @ApiOperation({
    summary: 'Delete all user notifications',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({ status: 200, description: 'All user notifications deleted.' })
  @ApiBadRequestResponse({ description: 'Invalid user ID.' })
  async deleteAllUserNotifications(@Param('userId') userId: string) {
    if (!userId || typeof userId !== 'string' || !isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    const result = await this.notificationModel.deleteMany({
      toUserId: userId,
    });
    return {
      message: `Deleted ${result.deletedCount} notifications`,
      deletedCount: result.deletedCount,
    };
  }

  @Patch('user/:userId/read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read.',
  })
  @ApiBadRequestResponse({ description: 'Invalid user ID.' })
  async markAllAsRead(@Param('userId') userId: string) {
    if (!userId || typeof userId !== 'string' || !isValidObjectId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    console.log('here in the part of mark all as read', userId);
    const result = await this.notificationModel.markAllAsRead(userId);

    // جلب الإشعارات المحدثة مع populate
    const updatedNotifications = await this.notificationModel
      .find({ toUserId: userId })
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
            const postData = result.data.postId as any;
            result.data.post = postData;
            result.data.postId = postData._id;
          }

          // إذا كان هناك commentId وتم populate له، انسخ البيانات إلى data.comment
          if (
            result.data &&
            result.data.commentId &&
            typeof result.data.commentId === 'object'
          ) {
            const commentData = result.data.commentId as any;
            result.data.comment = commentData;
            result.data.commentId = commentData._id;
          }

          return result;
        });
      });

    return {
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount,
      notifications: updatedNotifications,
    };
  }
}

// Frontend Usage: When the user logs in, call the API (e.g., GET /notifications/:toUserId?limit=20&skip=0&isRead=false

//   if (isRead === undefined) {
//   query.isRead = false; // Default to unread notifications
// }
//   async markNotificationAsRead(@Param('id') id: string) {
//     return this.notificationService.markAsRead(id);
//   }
