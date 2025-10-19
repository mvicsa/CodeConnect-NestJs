import { Module } from '@nestjs/common';
import { LivekitController } from './livekit.controller';
import { LivekitService } from './livekit.service';

import { RatingService } from './rating.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { LivekitSession, LivekitSessionSchema } from './session.schema';
import { LivekitRoom, LivekitRoomSchema } from './room.schema';
import { User, UserSchema } from '../users/shemas/user.schema';
import { Rating, RatingSchema } from './schemas/rating.schema';
import { NotificationModule } from '../notification/notification.module';
import { MeetingPurchase, MeetingPurchaseSchema } from './schemas/meeting-purchase.schema';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    ConfigModule,
    NotificationModule,
    PaymentsModule,
    MongooseModule.forFeature([
      { name: LivekitSession.name, schema: LivekitSessionSchema },
      { name: LivekitRoom.name, schema: LivekitRoomSchema },
      { name: User.name, schema: UserSchema },
      { name: Rating.name, schema: RatingSchema },
      { name: MeetingPurchase.name, schema: MeetingPurchaseSchema },
    ]),
  ],
  controllers: [LivekitController],
  providers: [LivekitService, RatingService],
  exports: [LivekitService, RatingService],
})
export class LivekitModule {}
