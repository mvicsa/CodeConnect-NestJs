// notification.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationDocument } from './entities/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(dto: CreateNotificationDto) {
    const created = new this.notificationModel(dto);
    return created.save();
  }

  async findByUser(userId: string) {
    return this.notificationModel.find({ userId }).sort({ createdAt: -1 });
  }
}
