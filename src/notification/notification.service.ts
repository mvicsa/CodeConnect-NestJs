// notification.service.ts
import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const saved = await created.save();
    this.gateway.sendNotificationToUser(dto?.toUserId, saved);
    return saved;
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
      this.gateway.sendToUsers(created);
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

  async deleteOne(id: string, userId: string) {
    const notification = await this.notificationModel.findById(id);
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.toUserId.toString() !== userId)
      throw new ForbiddenException(
        'You can only delete your own notifications',
      );
    return this.notificationModel.deleteOne({ _id: id, toUserId: userId });
  }
}
