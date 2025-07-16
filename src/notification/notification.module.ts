import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationSchema } from './entities/notification.schema';
import { NotificationService } from './notification.service';
import { NotificationListener } from './notification.listener';
import { RabbitMQModule } from 'src/rabbitmq/rabbitmq.module';

@Module({
  imports: [
    RabbitMQModule,
    MongooseModule.forFeature([
      {
        name: 'Notification',
        schema: NotificationSchema,
      },
    ]),
  ],
  controllers: [NotificationListener], // Explicitly declare NotificationListener as a controller The @Controller() decorator marks a class as a controller, which can handle HTTP routes or microservice events (with @EventPattern or @MessagePattern).
  providers: [NotificationService, NotificationListener],
  exports: [NotificationService, NotificationListener],
})
export class NotificationModule {}
