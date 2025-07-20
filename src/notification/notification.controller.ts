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
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import {
  NotificationDocument,
  NotificationModel,
} from './entities/notification.schema';
import { isValidObjectId, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Notification } from './entities/notification.schema';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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

  @Get(':toUserId')
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'skip', type: Number, required: false })
  @ApiQuery({ name: 'isRead', type: String, required: false })
  async getUserNotifications(
    @Param('toUserId') toUserId: string,
    @Query('limit') limit = 20,
    @Query('skip') skip = 0,
    @Query('isRead') isRead?: string, // Change to string
  ) {
    const query: any = { toUserId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true'; // Convert string to boolean
    }
    return this.notificationService
      .findByUser(toUserId)
      .skip(Number(skip)) // Ensure number type
      .limit(Number(limit)) // Ensure number type
      .exec();
  }
  //  6 user status, 7 notification status
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(notificationId: string, toUserId?: string) {
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
    return this.notificationModel.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true },
    );
  }

  @Patch(':toUserId/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Param('toUserId') toUserId: string) {
    console.log('here in the part of mark all as read', toUserId);
    return this.notificationModel.markAllAsRead(toUserId);
  }
}

// Frontend Usage: When the user logs in, call the API (e.g., GET /notifications/:toUserId?limit=20&skip=0&isRead=false

//   if (isRead === undefined) {
//   query.isRead = false; // Default to unread notifications
// }
//   async markNotificationAsRead(@Param('id') id: string) {
//     return this.notificationService.markAsRead(id);
//   }
