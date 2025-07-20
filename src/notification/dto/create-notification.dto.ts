import { IsEnum } from 'class-validator';
import { NotificationType } from '../entities/notification.schema';

export class CreateNotificationDto {
  toUserId: string;
  fromUserId?: string;
  content: string;
  @IsEnum(NotificationType)
  type: NotificationType;
  data: Record<string, any>;
}
