import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './shemas/user.schema';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    // MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeatureAsync([
      {
        name: User.name,
        useFactory: (configService: ConfigService) => {
          UserSchema.path('avatar').default(
            configService.get<string>('DEFAULT_AVATAR_IMAGE'),
          );
          UserSchema.path('cover').default(
            configService.get<string>('DEFAULT_COVER_IMAGE'),
          );
          return UserSchema;
        },
        inject: [ConfigService],
      },
    ]),
    ClientsModule.register([
      {
        name: 'RABBITMQ_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RMQ_URL ?? 'amqp://localhost:5672'],
          queue: process.env.RMQ_QUEUE ?? 'notifications_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
    NotificationModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
