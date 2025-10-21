import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EarningsEscrow, EarningsEscrowDocument } from './schemas/earnings-escrow.schema';
import { MeetingPurchase, MeetingPurchaseDocument } from 'src/livekit/schemas/meeting-purchase.schema';
import { NotificationService } from 'src/notification/notification.service';
import { EscrowStatus } from './dto/earnings-escrow.dto';
import { NotificationType } from 'src/notification/entities/notification.schema';

@Injectable()
export class EscrowCronService {
  private readonly logger = new Logger(EscrowCronService.name);

  constructor(
    @InjectModel(EarningsEscrow.name)
    private readonly earningsEscrowModel: Model<EarningsEscrowDocument>,
    @InjectModel(MeetingPurchase.name)
    private readonly meetingPurchaseModel: Model<MeetingPurchaseDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE) // Run every minute
  async handleCron() {
    this.logger.log('Running Escrow Release Cron Job...');
    const now = new Date();
    this.logger.log(`Current time: ${now.toISOString()}`);

    try {
      const maturedEscrows = await this.earningsEscrowModel.find({
        status: 'pending',
        releaseDate: { $lte: now }
      }).limit(50); // Process max 50 escrows per run to prevent overload

      this.logger.log(`Found ${maturedEscrows.length} matured escrows to process`);

      if (maturedEscrows.length > 0) {
        this.logger.log('Matured escrows details:', maturedEscrows.map(e => ({
          id: e._id,
          amount: e.amount,
          releaseDate: e.releaseDate,
          purchaseId: e.purchaseId
        })));
      }

      let releasedCount = 0;
      let refundedCount = 0;

      for (const escrow of maturedEscrows) {
        try {
          // التحقق من حالة الشراء
          const purchase = await this.meetingPurchaseModel.findById(escrow.purchaseId);

          if (!purchase || purchase.status !== 'completed') {
            // إذا كان الشراء ملغى أو غير مكتمل، يتم رد الأموال
            escrow.status = EscrowStatus.REFUNDED;
            escrow.refundedAt = new Date();
            await escrow.save();
            refundedCount++;

            // إنشاء إشعار للمستخدم
            await this.notificationService.addNotifications([{
              toUserId: (escrow.creatorId as Types.ObjectId).toString(),
              content: 'Escrow release cancelled due to purchase issue',
              type: NotificationType.SESSION_REFUNDED,
              data: {
                roomId: (escrow.roomId as Types.ObjectId).toString(),
                amount: escrow.amount
              }
            }]);

            continue;
          }

          // تحرير الأرباح
          escrow.status = EscrowStatus.RELEASED;
          escrow.releasedAt = new Date();
          await escrow.save();
          releasedCount++;

          // إنشاء إشعار للمستخدم
          await this.notificationService.addNotifications([{
            toUserId: (escrow.creatorId as Types.ObjectId).toString(),
            content: `Your earnings of $${escrow.amount} have been released and are now available for withdrawal`,
            type: NotificationType.SESSION_DETAILS_CHANGED,
            data: {
              roomId: (escrow.roomId as Types.ObjectId).toString(),
              amount: escrow.amount,
              currency: escrow.currency,
              escrowId: (escrow._id as Types.ObjectId).toString()
            }
          }]);

        } catch (error) {
          this.logger.error(`Error processing escrow ${escrow._id}:`, error);
        }
      }

      if (releasedCount > 0 || refundedCount > 0) {
        this.logger.log(`Escrow Release Cron Job completed. Released: ${releasedCount}, Refunded: ${refundedCount}`);
      } else {
        this.logger.log('No pending escrow earnings to release.');
      }
    } catch (error) {
      this.logger.error('Error in Escrow Release Cron Job:', error.message, error.stack);
    }
  }
}
