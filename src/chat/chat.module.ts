import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatRoom, ChatRoomSchema } from './schemas/chat-room.schema';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { User, UserSchema } from '../users/shemas/user.schema';
import { JwtService } from '@nestjs/jwt';
import { FileUploadService } from './file-upload.service';
import { ChatController } from './chat.controller';
import { Schema as MongooseSchema } from 'mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

const UploadedFileSchema = new MongooseSchema({
  data: String,
  mimetype: String,
  originalname: String,
});

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatRoom.name, schema: ChatRoomSchema },
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
      { name: 'UploadedFile', schema: UploadedFileSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES') || '1d',
        },
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, JwtService, FileUploadService],
  exports: [ChatService, FileUploadService],
})
export class ChatModule {} 