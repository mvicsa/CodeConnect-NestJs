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
    @Inject(forwardRef(() => NotificationGateway)) // ✅ use forwardRef here
    private readonly gateway: NotificationGateway,
  ) {}

  async create(dto: CreateNotificationDto) {
    const created = new this.notificationModel(dto);
    this.gateway.sendNotificationToUser(dto.userId, created);
    return created.save();
  }

  findByUser(userId: string) {
    return this.notificationModel.find({ userId }).sort({ createdAt: -1 });
  }
  // notification.service.ts
  async markAsRead(notificationId: string) {
    return this.notificationModel.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true },
    );
  }

  async addNotifications(notifications: CreateNotificationDto[]) {
    return this.notificationModel.insertMany(notifications);
  }
}
