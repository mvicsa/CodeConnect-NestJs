export class CreateNotificationDto {
  userId: string;
  content: string;
  type: string;
  data: Record<string, unknown>;
  fromUserId?: string;
}
