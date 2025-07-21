// import { IsEnum } from 'class-validator';
// import { NotificationType } from '../entities/notification.schema';

// export class CreateNotificationDto {
//   toUserId: string;
//   fromUserId?: string;
//   content: string;
//   @IsEnum(NotificationType)
//   type: NotificationType;
//   data: Record<string, any>;
// }

import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { NotificationType } from '../entities/notification.schema';

export class CreateNotificationDto {
  @IsString()
  toUserId: string;

  @IsOptional()
  @IsString()
  fromUserId?: string;

  @IsString()
  content: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsOptional()
  @IsObject()
  data: Record<string, any>;
}

