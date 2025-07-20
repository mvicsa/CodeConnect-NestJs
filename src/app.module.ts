import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { ChatModule } from './chat/chat.module';
import { MessageModule } from './messages/message.module';
import { GroupModule } from './group/group.module';
import { LivekitModule } from './livekit/livekit.module';
import { NotificationModule } from './notification/notification.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    PostsModule,
    AiAgentModule,
    ChatModule,
    MessageModule,
    GroupModule,
    LivekitModule,
    NotificationModule,
    RabbitMQModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
