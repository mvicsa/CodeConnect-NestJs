import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentController } from './payment.controller';
import { EarningsEscrowController } from './earnings-escrow.controller';
import { BalanceController } from './balance.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentService } from './payment.service';
import { EarningsEscrowService } from './earnings-escrow.service';
import { LivekitRoom, LivekitRoomSchema } from 'src/livekit/room.schema';
import { MeetingPurchase, MeetingPurchaseSchema } from 'src/livekit/schemas/meeting-purchase.schema';
import { EarningsEscrow, EarningsEscrowSchema } from './schemas/earnings-escrow.schema';
import { Withdrawal, WithdrawalSchema } from './schemas/withdrawal.schema';
import { User, UserSchema } from 'src/users/shemas/user.schema';
import { NotificationModule } from 'src/notification/notification.module';
import { StripeConnectService } from './stripe-connect.service';
import { StripeConnectController } from './stripe-connect.controller';
import { EscrowCronService } from './escrow-cron.service'; // Import EscrowCronService
import { AdminModule } from 'src/admin/admin.module'; // Import AdminModule

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LivekitRoom.name, schema: LivekitRoomSchema },
      { name: MeetingPurchase.name, schema: MeetingPurchaseSchema },
      { name: EarningsEscrow.name, schema: EarningsEscrowSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: User.name, schema: UserSchema }
    ]),
    NotificationModule,
    AdminModule // Add AdminModule here
  ],
  controllers: [
    PaymentController, 
    EarningsEscrowController,
    BalanceController,
    StripeConnectController,
    AdminPaymentsController
  ],
  providers: [
    PaymentService, 
    EarningsEscrowService,
    StripeConnectService,
    EscrowCronService // Add EscrowCronService here
  ],
  exports: [PaymentService, EarningsEscrowService, StripeConnectService]
})
export class PaymentsModule {}
