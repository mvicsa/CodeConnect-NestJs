import { Module } from '@nestjs/common';
import { LivekitController } from './livekit.controller';
import { LivekitService } from './livekit.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { LivekitSession, LivekitSessionSchema } from './session.schema';
import { LivekitRoom, LivekitRoomSchema } from './room.schema';
import { User, UserSchema } from '../users/shemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: LivekitSession.name, schema: LivekitSessionSchema },
      { name: LivekitRoom.name, schema: LivekitRoomSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [LivekitController],
  providers: [LivekitService],
  exports: [LivekitService],
})
export class LivekitModule {}
