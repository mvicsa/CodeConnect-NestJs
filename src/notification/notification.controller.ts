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
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  NotificationDocument,
  NotificationModel,
} from './entities/notification.schema';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Notification } from './entities/notification.schema';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    @InjectModel(Notification.name)
    private readonly notificationModel: NotificationModel,
  ) {}

  @Get(':userId')
  async getUserNotifications(
    @Param('userId') userId: string,
    @Query('limit') limit = 20,
    @Query('skip') skip = 0,
    @Query('isRead') isRead?: string, // Change to string
  ) {
    const query: any = { userId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true'; // Convert string to boolean
    }
    return this.notificationService
      .findByUser(userId)
      .skip(Number(skip)) // Ensure number type
      .limit(Number(limit)) // Ensure number type
      .exec();
  }
  //  6 user status, 7 notification status
  @Patch(':id/read')
  async markAsRead(notificationId: string, userId?: string) {
    if (!isValidObjectId(notificationId)) {
      throw new BadRequestException('Invalid notification ID');
    }
    const notification = await this.notificationModel.findById(notificationId);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (userId && notification.userId !== userId) {
      throw new UnauthorizedException(
        'Not authorized to mark this notification as read',
      );
    }
    return this.notificationModel.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true },
    );
  }

  @Patch(':userId/read-all')
  async markAllAsRead(@Param('userId') userId: string) {
    return this.notificationModel.markAllAsRead(userId);
  }
}

// Frontend Usage: When the user logs in, call the API (e.g., GET /notifications/:userId?limit=20&skip=0&isRead=false

//   if (isRead === undefined) {
//   query.isRead = false; // Default to unread notifications
// }
//   async markNotificationAsRead(@Param('id') id: string) {
//     return this.notificationService.markAsRead(id);
//   }
