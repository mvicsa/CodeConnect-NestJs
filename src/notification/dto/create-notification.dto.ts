import { IsEnum } from 'class-validator';
import { NotificationType } from '../entities/notification.schema';

export class CreateNotificationDto {
  userId: string;
  fromUserId?: string;
  content: string;
  @IsEnum(NotificationType)
  type: NotificationType;
  data: Record<string, any>;
}
