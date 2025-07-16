import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationSchema } from './entities/notification.schema';
import { NotificationService } from './notification.service';
import { NotificationListener } from './notification.listener';
import { RabbitMQModule } from 'src/rabbitmq/rabbitmq.module';
import { NotificationGateway } from './notification.gateway';
import { NotificationController } from './notification.controller';
import { Notification } from './entities/notification.schema';

@Module({
  imports: [
    RabbitMQModule,
    MongooseModule.forFeature([
      {
        name: Notification.name,
        schema: NotificationSchema,
      },
    ]),
  ],
  controllers: [NotificationListener, NotificationController], // Explicitly declare NotificationListener as a controller The @Controller() decorator marks a class as a controller, which can handle HTTP routes or microservice events (with @EventPattern or @MessagePattern).
  providers: [NotificationService, NotificationListener, NotificationGateway],
  exports: [NotificationService, NotificationListener, NotificationGateway],
})
export class NotificationModule {}
