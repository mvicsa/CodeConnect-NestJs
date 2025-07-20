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
    this.gateway.sendNotificationToUser(dto.toUserId, created);
    console.log('we created a notification', created);
    return created.save();
  }

  findByUser(toUserId: string) {
    return this.notificationModel.find({ toUserId }).sort({ createdAt: -1 });
  }

  async markAsRead(notificationId: string) {
    return this.notificationModel.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true },
    );
  }

  async addNotifications(notifications: CreateNotificationDto[]) {
    try {
      const created = await this.notificationModel.insertMany(notifications);
      this.gateway.sendToUsers(created); // (dto.toUserId, created);
      return created;
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
