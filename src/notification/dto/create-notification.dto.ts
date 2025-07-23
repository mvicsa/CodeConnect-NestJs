import { IsEnum, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../entities/notification.schema';

export class CreateNotificationDto {
  @ApiProperty({ description: 'The user ID to receive the notification', example: '60f7c0b8e1d2c8001c8e4b1a' })
  @IsString()
  @IsNotEmpty()
  toUserId: string;

  @ApiPropertyOptional({ description: 'The user ID who triggered the notification', example: '60f7c0b8e1d2c8001c8e4b1b' })
  @IsOptional()
  @IsString()
  fromUserId?: string;

  @ApiProperty({ description: 'Notification content', example: 'You have a new follower!' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ enum: NotificationType, description: 'Type of notification', example: NotificationType.POST_CREATED })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Additional data for the notification', example: '{ "postId": "60f7c0b8e1d2c8001c8e4b1c" }' })
  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;
}
