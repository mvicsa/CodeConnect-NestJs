import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LivekitRoom, LivekitRoomDocument } from 'src/livekit/room.schema';
import { MeetingPurchase, MeetingPurchaseDocument } from 'src/livekit/schemas/meeting-purchase.schema';
import { PurchaseStatus } from 'src/livekit/enums/purchase-status.enum';
import { MyEarningsQueryDto, MyEarningsResponseDto, CreatorEarningDto } from './dto/my-earnings.dto';
import { MyPurchasesQueryDto, MyPurchasesResponseDto, UserPurchaseDto } from './dto/my-purchases.dto';
import { DashboardResponseDto, DashboardStatsDto, RecentActivityDto, QuickStatsDto } from './dto/dashboard.dto';
import { plainToInstance } from 'class-transformer';
import { EarningsEscrow, EarningsEscrowDocument } from './schemas/earnings-escrow.schema';
import { Withdrawal, WithdrawalDocument } from './schemas/withdrawal.schema';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { User, UserDocument } from 'src/users/shemas/user.schema';
import { PlatformSettingsService } from 'src/admin/platform-settings.service'; // Import PlatformSettingsService
import { EarningsEscrowService } from './earnings-escrow.service';
import { StripeConnectService } from './stripe-connect.service';

interface AggregatedEarning {
  _id: string;
  roomId: string;
  roomName: string;
  amountPaid: number;
  currencyUsed: string;
  purchaseDate: Date;
  status: string;
  platformFeePercentage?: number; // Added this property
  grossAmount?: number; // Added this property
}

interface AggregatedPurchase {
  _id: string;
  roomId: string;
  roomName: string;
  amountPaid: number;
  currencyUsed: string;
  purchaseDate: Date;
  status: string;
  failureReason?: string;
}

@Injectable()
export class PaymentService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoomDocument>,
    @InjectModel(MeetingPurchase.name)
    private readonly meetingPurchaseModel: Model<MeetingPurchaseDocument>,
    @InjectModel(EarningsEscrow.name)
    private readonly earningsEscrowModel: Model<EarningsEscrowDocument>,
    @InjectModel(Withdrawal.name)
    private readonly withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
    private readonly platformSettingsService: PlatformSettingsService, // Inject PlatformSettingsService
    private readonly earningsEscrowService: EarningsEscrowService, // Inject EarningsEscrowService
    private readonly stripeConnectService: StripeConnectService, // Inject StripeConnectService
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables.');
    }
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-09-30.clover',
    });
  }

  async refundPurchase(
    purchaseId: string,
    reason?: string
  ): Promise<void> {
    console.log('=== REFUND PURCHASE DEBUG ===');
    console.log('Purchase ID:', purchaseId);
    console.log('Reason:', reason);

    const purchase = await this.meetingPurchaseModel.findById(purchaseId);
    
    if (!purchase) {
      console.log('❌ Purchase not found');
      throw new NotFoundException('Purchase not found');
    }

    console.log('✅ Purchase found:', {
      id: purchase._id,
      userId: purchase.userId,
      amount: purchase.amountPaid,
      status: purchase.status,
      transactionId: purchase.transactionId
    });

    try {
      // التحقق من حالة الشراء
      if (purchase.status !== PurchaseStatus.COMPLETED) {
        console.log('❌ Purchase is not completed, status:', purchase.status);
        throw new BadRequestException('Only completed purchases can be refunded');
      }

      // 👈 تحديث حالة الشراء إلى REFUNDED
      purchase.status = PurchaseStatus.REFUNDED;
      await purchase.save();

      console.log('✅ Purchase status updated to REFUNDED');

      console.log('✅ Purchase is completed, processing refund...');

      // حساب المبلغ اللي يروح للـ creator (المبلغ المدفوع ناقص عمولة المنصة)
      const platformSettings = await this.platformSettingsService.getPlatformSettings();
      const creatorAmount = purchase.amountPaid * (1 - platformSettings.platformFeePercentage / 100);

      console.log(`💰 Amount calculation:
        Customer paid: $${purchase.amountPaid}
        Platform fee (${platformSettings.platformFeePercentage}%): $${purchase.amountPaid * platformSettings.platformFeePercentage / 100}
        Creator gets: $${creatorAmount}`);

      // التحقق من نوع الـ transactionId
      let paymentIntentId = purchase.transactionId;
      
      if (purchase.transactionId.startsWith('cs_test_') || purchase.transactionId.startsWith('cs_live_')) {
        // إذا كان checkout session، نحتاج لجلب الـ payment_intent
        console.log('🔄 Transaction ID is checkout session, retrieving payment intent...');
        try {
          const session = await this.stripe.checkout.sessions.retrieve(purchase.transactionId);
          if (session.payment_intent) {
            paymentIntentId = session.payment_intent as string;
            console.log('✅ Payment intent ID retrieved:', paymentIntentId);
          } else {
            throw new Error('No payment intent found in checkout session');
          }
        } catch (sessionError) {
          console.error('❌ Error retrieving checkout session:', sessionError);
          throw new Error(`Failed to retrieve payment intent from checkout session: ${sessionError.message}`);
        }
      }

      // إنشاء عملية رد الأموال في Stripe
      // العميل ياخد المبلغ الكامل اللي دفعه بالضبط

      console.log(`💰 Refund Process:
        Customer paid: $${purchase.amountPaid}
        Customer gets back: $${purchase.amountPaid} (full amount)
        Platform will recover ${creatorAmount} from creator`);

      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(purchase.amountPaid * 100), // المبلغ الكامل بالسنت
        reason: 'requested_by_customer',
        metadata: {
          refund_type: 'full_refund_with_creator_recovery',
          original_amount: purchase.amountPaid,
          creator_recovery_amount: creatorAmount,
          refund_reason: reason || 'Session cancelled',
          purchase_id: purchaseId
        }
      });

      console.log('✅ Stripe refund created:', refund.id);

      // استرجاع الفلوس من الـ creator باستخدام Transfer Reversal
      try {
        // البحث عن الـ escrow للمُبدع المرتبط بالشراء
        const creatorEscrow = await this.earningsEscrowModel.findOne({
          purchaseId: (purchase._id as Types.ObjectId),
          type: 'creator'
        });

        if (creatorEscrow && creatorEscrow.originalTransferId) {
          console.log(`🔄 Recovering ${creatorAmount} from creator using Transfer Reversal`);
          console.log(`Original Transfer ID: ${creatorEscrow.originalTransferId}`);
          
          // 👈 جلب معرّف حساب المُبدع المرتبط
          const room = await this.roomModel.findById(purchase.roomId);
          if (!room) {
            throw new Error('Room not found for refund processing');
          }
          
          const creator = await this.userModel.findById(room.createdBy.toString());
          if (!creator || !creator.stripeConnectAccountId) {
            throw new Error('Creator or creator Stripe account not found');
          }
          
          const creatorConnectAccountId = creator.stripeConnectAccountId;
          console.log(`Creator Connect Account ID: ${creatorConnectAccountId}`);
          
          // استخدام Transfer Reversal الصحيح مع معرّف حساب المُبدع
          const reversal = await this.stripeConnectService.createTransferReversal(
            creatorEscrow.originalTransferId,
            Math.round(creatorAmount * 100), // تحويل لسنت
            `Refund recovery for purchase ${purchaseId}`
          );

          console.log(`✅ Transfer reversal created: ${reversal.id}`);

          // تحديث حالة الـ escrow
          creatorEscrow.status = 'refunded';
          creatorEscrow.refundedAt = new Date();
          creatorEscrow.reason = reason || 'Refund processed';
          await creatorEscrow.save();

          // إرسال إشعار للمُبدع
          await this.notificationService.addNotifications([{
            toUserId: creatorEscrow.creatorId.toString(),
            content: `$${creatorAmount} has been recovered from your account due to a refund for purchase ${purchaseId}`,
            type: NotificationType.SESSION_REFUNDED,
            data: {
              amount: creatorAmount,
              purchaseId: purchaseId,
              reversalId: reversal.id,
              reason: 'Refund recovery'
            }
          }]);

        } else {
          console.warn('⚠️ No creator escrow found or no original transfer ID available for refund recovery');
        }
      } catch (recoveryError) {
        console.error('❌ Error recovering funds from creator using transfer reversal:', recoveryError);
        // نستمر في العملية حتى لو فشل استرجاع الفلوس
      }

      // تحديث حالة الشراء
      purchase.status = PurchaseStatus.REFUNDED;
      await purchase.save();

      console.log(`✅ Refund processed successfully for purchase ${purchaseId}`);

      // إرسال إشعار تأكيد الـ refund
      try {
        // جلب بيانات الجلسة
        const room = await this.roomModel.findById(purchase.roomId);
        if (room) {
          await this.notificationService.addNotifications([{
            toUserId: purchase.userId.toString(),
            // fromUserId: null, // إشعار من النظام - لا نحتاج fromUserId
            content: `Your payment of $${purchase.amountPaid} has been successfully refunded for session "${room.name}"`,
            type: NotificationType.SESSION_REFUNDED,
            data: {
              roomId: (room._id as Types.ObjectId).toString(),
              roomName: room.name,
              originalAmount: purchase.amountPaid,
              refundAmount: purchase.amountPaid,
              refundId: refund.id,
              refundDate: new Date().toISOString(),
              reason: reason || 'Session cancelled',
              refundStrategy: 'full_refund'
            }
          }]);
          console.log(`✅ Refund confirmation notification sent to user ${purchase.userId}`);
        }
      } catch (notificationError) {
        console.error('❌ Error sending refund confirmation notification:', notificationError);
        // لا نريد أن نفشل العملية بسبب خطأ في الإشعار
      }
    } catch (error) {
      console.error(`❌ Error processing refund for purchase ${purchaseId}:`, error);
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  // التحقق من maxParticipants قبل إنشاء جلسة الدفع
  async createCheckoutSession(
    roomId: string,
    userId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ checkoutUrl: string }> {
    const room = await this.roomModel.findById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // التحقق من عدد المشاركين
    const completedPurchasesCount = await this.meetingPurchaseModel.countDocuments({
      roomId: new Types.ObjectId(roomId),
      status: PurchaseStatus.COMPLETED
    });

    if (room.maxParticipants && completedPurchasesCount >= room.maxParticipants) {
      throw new BadRequestException('This room has reached its maximum number of participants');
    }

    // التحقق من وجود purchase سابق بحالة COMPLETED فقط
    const existingCompletedPurchase = await this.meetingPurchaseModel.findOne({
      userId: new Types.ObjectId(userId),
      roomId: new Types.ObjectId(roomId),
      status: PurchaseStatus.COMPLETED,
    });

    if (existingCompletedPurchase) {
      throw new BadRequestException('You have already purchased this session');
    }

    // Get creator information for paid rooms
    let creator: any = null;
    if (room.isPaid && room.price > 0) {
      creator = await this.userModel.findById(room.createdBy.toString());
      if (!creator || !creator.stripeConnectAccountId) {
        throw new BadRequestException('Creator has not connected their Stripe account. Cannot create a paid session.');
      }
    }

    // Only apply logic for paid rooms
    if (room.isPaid && room.price > 0) {
      const platformSettings = await this.platformSettingsService.getPlatformSettings();
      const platformFeePercentage = platformSettings.platformFeePercentage / 100; // e.g., 20 / 100 = 0.2

      const totalAmountCents = Math.round(room.price * 100);
      const applicationFeeAmountCents = Math.round(totalAmountCents * platformFeePercentage);

      // Create Stripe Checkout Session with transfer_data and application_fee_amount
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: room.name,
              description: room.description,
            },
              unit_amount: totalAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { // ✅ إعادة metadata هنا لـ checkout.session.completed webhook
        roomId: (room._id as Types.ObjectId).toString(),
        userId: userId,
      },
      payment_intent_data: {
        transfer_data: {
          destination: creator!.stripeConnectAccountId,
          amount: totalAmountCents - applicationFeeAmountCents, // Net amount for the creator
        },
        metadata: {
          roomId: (room._id as Types.ObjectId).toString(),
          userId: userId,
          creatorAccountId: creator!.stripeConnectAccountId,
        },
      },
    });

    if (!session.url) {
      throw new BadRequestException('Failed to retrieve Stripe checkout URL.');
    }
      console.log('🎉 Checkout session created with split payment:', session.id);
      return { checkoutUrl: session.url };
    } else {
      // For free rooms, proceed without application_fee_amount or transfer_data
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: room.name,
                description: room.description,
              },
              unit_amount: Math.round(room.price * 100), // Stripe expects amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { // ✅ إعادة metadata هنا لـ checkout.session.completed webhook
          roomId: (room._id as Types.ObjectId).toString(),
          userId: userId,
          creatorAccountId: creator.stripeConnectAccountId,
        },
        payment_intent_data: {
          metadata: {
            roomId: (room._id as Types.ObjectId).toString(),
            userId: userId,
            creatorAccountId: creator.stripeConnectAccountId,
          },
        },
      });

      if (!session.url) {
        throw new BadRequestException('Failed to retrieve Stripe checkout URL.');
      }
      console.log('🎉 Checkout session created for free room:', session.id);
    return { checkoutUrl: session.url };
  }
  }


  // Method to get available actions for a purchase based on its status
  private getPurchaseActions(status: string): any {
    switch (status) {
      case PurchaseStatus.COMPLETED:
        return {
          message: 'Payment successful'
        };
        
      case PurchaseStatus.FAILED:
        return {
          message: 'Payment failed. You can try again by initiating a new purchase.'
        };
        
      case PurchaseStatus.CANCELLED:
        return {
          message: 'Purchase cancelled. You can try again by initiating a new purchase.'
        };
        
      case PurchaseStatus.REFUNDED:
        return {
          message: 'Payment refunded'
        };
      
      default:
        return {
          message: 'Unknown status'
        };
    }
  }

  // Method to send purchase status notifications
  private async sendPurchaseStatusNotification(
    userId: string,
    roomId: string,
    status: PurchaseStatus,
    additionalData?: any
  ): Promise<void> {
    try {
      const room = await this.roomModel.findById(roomId);
      if (!room) return;

      let notificationContent = '';
      let notificationType: NotificationType; // Explicitly declare as NotificationType

      switch (status) {
        case PurchaseStatus.COMPLETED:
          notificationContent = `Successfully purchased session "${room.name}"! You can now join the session.`;
          notificationType = NotificationType.SESSION_PURCHASED;
          break;
          
        case PurchaseStatus.FAILED:
          notificationContent = `Payment failed for "${room.name}". Please try again.`;
          notificationType = NotificationType.SESSION_PURCHASE_FAILED;
          break;
          
        case PurchaseStatus.CANCELLED:
          notificationContent = `Your purchase for "${room.name}" was cancelled. You can try again.`;
          notificationType = NotificationType.SESSION_PURCHASE_CANCELLED;
          break;
          
        case PurchaseStatus.REFUNDED:
          notificationContent = `Your payment for "${room.name}" has been refunded.`;
          notificationType = NotificationType.SESSION_REFUNDED;
          break;
        
        default:
          notificationContent = `An update for your purchase of "${room.name}" has occurred. Status: ${status}.`;
          notificationType = NotificationType.GENERAL_NOTIFICATION;
          break;
      }

      await this.notificationService.addNotifications([{
        toUserId: userId,
        content: notificationContent,
        type: notificationType,
        data: {
          roomId: (room._id as Types.ObjectId).toString(), // Explicitly cast room._id
          roomName: room.name,
          status: status,
          ...additionalData
        }
      }]);

      console.log(`📧 Purchase status notification sent to user ${userId}: ${status}`);
    } catch (error) {
      console.error('Error sending purchase status notification:', error);
    }
  }

  // ==================== ADMIN METHODS ====================

  async getPlatformEarningsSummary(startDate?: string, endDate?: string) {
    const platformUserId = this.configService.get<string>('PLATFORM_USER_ID');
    if (!platformUserId) {
      throw new BadRequestException('Platform user ID not configured');
    }

    const matchQuery: any = {
      creatorId: new Types.ObjectId(platformUserId),
      type: 'platform'
    };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const summary = await this.earningsEscrowModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' },
          totalGrossAmount: { $sum: '$grossAmount' },
          totalStripeFees: { $sum: '$stripeFees' },
          totalTransactions: { $sum: 1 },
          releasedEarnings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'released'] }, '$amount', 0]
            }
          },
          pendingEarnings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
            }
          },
          withdrawnEarnings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'withdrawn'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    return summary[0] || {
      totalEarnings: 0,
      totalGrossAmount: 0,
      totalStripeFees: 0,
      totalTransactions: 0,
      releasedEarnings: 0,
      pendingEarnings: 0,
      withdrawnEarnings: 0
    };
  }

  async getPlatformWithdrawals(startDate?: string, endDate?: string, status?: string) {
    const platformUserId = this.configService.get<string>('PLATFORM_USER_ID');
    if (!platformUserId) {
      throw new BadRequestException('Platform user ID not configured');
    }

    const matchQuery: any = {
      creatorId: new Types.ObjectId(platformUserId),
      type: 'platform',
      status: 'withdrawn'
    };

    if (startDate || endDate) {
      matchQuery.withdrawnAt = {};
      if (startDate) matchQuery.withdrawnAt.$gte = new Date(startDate);
      if (endDate) matchQuery.withdrawnAt.$lte = new Date(endDate);
    }

    if (status) {
      matchQuery.status = status;
    }

    return this.earningsEscrowModel.find(matchQuery)
      .populate('roomId', 'name')
      .populate('purchaseId', 'amountPaid currencyUsed purchaseDate')
      .sort({ withdrawnAt: -1 });
  }

  async getTransactionAnalytics(period: string = 'monthly') {
    const platformUserId = this.configService.get<string>('PLATFORM_USER_ID');
    if (!platformUserId) {
      throw new BadRequestException('Platform user ID not configured');
    }

    let groupFormat: any;
    switch (period) {
      case 'daily':
        groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      case 'weekly':
        groupFormat = { $dateToString: { format: '%Y-W%U', date: '$createdAt' } };
        break;
      case 'monthly':
      default:
        groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
    }

    const analytics = await this.earningsEscrowModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(platformUserId),
          type: 'platform'
        }
      },
      {
        $group: {
          _id: groupFormat,
          totalEarnings: { $sum: '$amount' },
          totalGrossAmount: { $sum: '$grossAmount' },
          totalStripeFees: { $sum: '$stripeFees' },
          transactionCount: { $sum: 1 },
          avgTransactionValue: { $avg: '$grossAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return analytics;
  }

  async getCreatorEarningsDetails(creatorId: string, startDate?: string, endDate?: string) {
    const matchQuery: any = {
      creatorId: new Types.ObjectId(creatorId),
      type: 'creator'
    };

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const earnings = await this.earningsEscrowModel.find(matchQuery)
      .populate('roomId', 'name')
      .populate('purchaseId', 'amountPaid currencyUsed purchaseDate')
      .sort({ createdAt: -1 });

    const summary = await this.earningsEscrowModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' },
          totalGrossAmount: { $sum: '$grossAmount' },
          totalStripeFees: { $sum: '$stripeFees' },
          totalTransactions: { $sum: 1 },
          releasedEarnings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'released'] }, '$amount', 0]
            }
          },
          pendingEarnings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
            }
          },
          withdrawnEarnings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'withdrawn'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    return {
      summary: summary[0] || {
        totalEarnings: 0,
        totalGrossAmount: 0,
        totalStripeFees: 0,
        totalTransactions: 0,
        releasedEarnings: 0,
        pendingEarnings: 0,
        withdrawnEarnings: 0
      },
      transactions: earnings
    };
  }

  async getStripeFeesSummary(startDate?: string, endDate?: string) {
    const matchQuery: any = {};

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const feesSummary = await this.earningsEscrowModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalStripeFees: { $sum: '$stripeFees' },
          totalGrossAmount: { $sum: '$grossAmount' },
          totalTransactions: { $sum: 1 },
          avgStripeFee: { $avg: '$stripeFees' },
          avgStripeFeePercentage: {
            $avg: {
              $multiply: [
                { $divide: ['$stripeFees', '$grossAmount'] },
                100
              ]
            }
          }
        }
      }
    ]);

    return feesSummary[0] || {
      totalStripeFees: 0,
      totalGrossAmount: 0,
      totalTransactions: 0,
      avgStripeFee: 0,
      avgStripeFeePercentage: 0
    };
  }

  async getPlatformBalance() {
    const platformUserId = this.configService.get<string>('PLATFORM_USER_ID');
    if (!platformUserId) {
      throw new BadRequestException('Platform user ID not configured');
    }

    const balance = await this.earningsEscrowModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(platformUserId),
          type: 'platform'
        }
      },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$amount' },
          availableBalance: {
            $sum: {
              $cond: [{ $eq: ['$status', 'released'] }, '$amount', 0]
            }
          },
          pendingBalance: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    return balance[0] || {
      totalBalance: 0,
      availableBalance: 0,
      pendingBalance: 0
    };
  }

  async processManualPayout(creatorId: string, amount: number, reason: string, adminId: string) {
    // Implementation for manual payout processing
    // This would integrate with the existing withdrawal system
    return {
      message: 'Manual payout processed successfully',
      payoutId: 'manual_' + Date.now(),
      amount,
      creatorId,
      processedBy: adminId,
      reason
    };
  }

  async processPlatformWithdrawal(amount: number, reason: string, adminId: string) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const platformUserId = this.configService.get<string>('PLATFORM_USER_ID');
    if (!platformUserId) {
      throw new BadRequestException('Platform user ID not configured');
    }

    // 1) Check DB available balance for platform (released)
    const dbBalanceAgg = await this.earningsEscrowModel.aggregate([
      { $match: { creatorId: new Types.ObjectId(platformUserId), type: 'platform' } },
      {
        $group: {
          _id: null,
          available: {
            $sum: { $cond: [{ $eq: ['$status', 'released'] }, '$amount', 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
          }
        }
      }
    ]);

    const dbAvailable = dbBalanceAgg[0]?.available || 0;
    if (amount > dbAvailable) {
      throw new BadRequestException(`Insufficient platform available balance. Available: $${dbAvailable.toFixed(2)}`);
    }

    // 2) Check Stripe platform available balance
    const platformStripeBalance = await this.stripe.balance.retrieve();
    const usdAvailable = platformStripeBalance.available.find(b => b.currency === 'usd')?.amount || 0; // cents

    const amountInCents = Math.round(amount * 100);
    if (amountInCents > usdAvailable) {
      throw new BadRequestException('Insufficient Stripe available balance on platform account.');
    }

    // 3) Create payout from platform account
    const payout = await this.stripe.payouts.create({
      amount: amountInCents,
      currency: 'usd',
      description: (reason || 'Platform withdrawal').substring(0, 22)
    });

    // 4) Mark platform released escrows as withdrawn up to amount
    let remaining = amount;
    const escrows = await this.earningsEscrowModel.find({
      creatorId: new Types.ObjectId(platformUserId),
      type: 'platform',
      status: 'released'
    }).sort({ createdAt: 1 });

    for (const e of escrows) {
      if (remaining <= 0) break;
      const use = Math.min(remaining, e.amount);
      e.amount -= use;
      if (e.amount <= 0.0000001) {
        e.status = 'withdrawn';
        e.withdrawnAt = new Date();
      }
      await e.save();
      remaining -= use;
    }

    return {
      message: 'Platform withdrawal processed successfully',
      payoutId: payout.id,
      amount,
      processedBy: adminId,
      reason
    };
  }

  async getDisputedTransactions() {
    return this.earningsEscrowModel.find({ status: 'disputed' })
      .populate('creatorId', 'username email')
      .populate('roomId', 'name')
      .populate('purchaseId', 'amountPaid currencyUsed purchaseDate')
      .sort({ createdAt: -1 });
  }

  async resolveDispute(transactionId: string, decision: 'approve' | 'reject', reason: string, adminId: string) {
    const escrow = await this.earningsEscrowModel.findById(transactionId);
    if (!escrow) {
      throw new BadRequestException('Transaction not found');
    }

    if (decision === 'approve') {
      escrow.status = 'released';
      escrow.releasedAt = new Date();
    } else {
      escrow.status = 'refunded';
      escrow.refundedAt = new Date();
    }

    escrow.reason = reason;
    await escrow.save();

    return {
      message: `Dispute ${decision}d successfully`,
      transactionId,
      decision,
      reason,
      resolvedBy: adminId
    };
  }

  // Helper method to get actual Stripe fees from payment intent
  private async getActualStripeFees(paymentIntentId: string): Promise<number> {
    try {
      // Get charges for this payment intent
      const charges = await this.stripe.charges.list({
        payment_intent: paymentIntentId,
        limit: 1
      });
      
      if (charges.data.length > 0) {
        const charge = charges.data[0];
        if (charge.balance_transaction) {
          const balanceTransactionId = typeof charge.balance_transaction === 'string' 
            ? charge.balance_transaction 
            : charge.balance_transaction.id;
          
          const balanceTransaction = await this.stripe.balanceTransactions.retrieve(balanceTransactionId);
          return balanceTransaction.fee / 100; // Convert from cents to dollars
        }
      }
    } catch (error) {
      console.error('Error retrieving Stripe fees:', error);
    }
    return 0;
  }

  // New helper method to send purchase notifications on completion and create escrow
  private async sendPurchaseNotificationsAndEscrowOnCompletion(
    purchase: MeetingPurchaseDocument,
    room: LivekitRoomDocument,
    buyerUserId: string,
    amountPaid: number,
    currencyUsed: string,
    transferId?: string | null
  ): Promise<void> {
    console.log('📨 sendPurchaseNotificationsAndEscrowOnCompletion - received transferId:', transferId);
    const platformSettings = await this.platformSettingsService.getPlatformSettings();
    const platformFeePercentage = platformSettings.platformFeePercentage / 100; // e.g., 20 / 100 = 0.2

    // Get actual Stripe fees from the payment intent
    let stripeFees = 0;
    if (purchase.stripePaymentIntentId) {
      stripeFees = await this.getActualStripeFees(purchase.stripePaymentIntentId);
    }
    
    // If we couldn't get actual fees, use estimated calculation as fallback
    if (stripeFees === 0) {
      console.warn('Could not retrieve actual Stripe fees, using estimated calculation');
      const estimatedStripeFeePercentage = 0.029; // 2.9%
      const estimatedStripeFixedFee = 0.30; // $0.30
      stripeFees = (amountPaid * estimatedStripeFeePercentage) + estimatedStripeFixedFee;
    }
    
    // Calculate platform fee and creator amount based on GROSS amount (before Stripe fees)
    const creatorAmount = amountPaid * (1 - platformFeePercentage);
    const platformFeeAmount = amountPaid * platformFeePercentage;
    
    // Stripe fees are deducted from platform's share only
    const platformNetAmount = platformFeeAmount - stripeFees;
    
    console.log(`💰 Payment Breakdown:
      Gross Amount: $${amountPaid.toFixed(2)}
      Creator Amount (${((1 - platformFeePercentage) * 100).toFixed(1)}%): $${creatorAmount.toFixed(2)}
      Platform Fee (${(platformFeePercentage * 100).toFixed(1)}%): $${platformFeeAmount.toFixed(2)}
      Stripe Fees: $${stripeFees.toFixed(2)} ${purchase.stripePaymentIntentId ? '(actual)' : '(estimated)'}
      Platform Net Amount: $${platformNetAmount.toFixed(2)}`);

              const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 14); // Default 14 days

    const creatorId = new Types.ObjectId(room.createdBy.toString());
    const roomId = (room._id as Types.ObjectId);
    const purchaseId = (purchase._id as Types.ObjectId);

    // Determine escrow status and release date for creator based on admin bypass setting
    const creatorEscrowStatus = platformSettings.adminBypassEscrow ? 'released' : 'pending';
    const creatorReleaseDate = platformSettings.adminBypassEscrow ? new Date() : releaseDate; // Use immediate release or 14 days
    console.log(`DEBUG: adminBypassEscrow is ${platformSettings.adminBypassEscrow}. Creator escrow status will be: ${creatorEscrowStatus}`);

    // Create escrow record for Creator
    const existingCreatorEscrow = await this.earningsEscrowModel.findOne({
      purchaseId: purchaseId,
      creatorId: creatorId,
      type: 'creator'
    });

    if (!existingCreatorEscrow) {
              const escrowRecord = await this.earningsEscrowModel.create({
        creatorId: creatorId,
        roomId: roomId,
        purchaseId: purchaseId,
        amount: creatorAmount,
        currency: currencyUsed,
                status: creatorEscrowStatus, // Use determined status
        releaseDate: creatorReleaseDate, // Use determined release date
        type: 'creator',
        grossAmount: amountPaid, // Gross amount paid by customer
        netAmount: amountPaid, // Net amount (same as gross for creator)
        stripeFees: 0, // Creator doesn't pay Stripe fees
        feeAtTransactionTime: platformSettings.platformFeePercentage, // Add fee percentage to creator's escrow
        originalTransferId: transferId || undefined // Save the original transfer ID for refunds
      });
      console.log(`✅ Creator escrow record created for amount $${creatorAmount.toFixed(2)}. Status: ${creatorEscrowStatus}. Transfer ID: ${transferId || 'N/A'}`);
      console.log('📋 Saved escrow record ID:', escrowRecord._id, 'with originalTransferId:', escrowRecord.originalTransferId);
    } else {
      console.log('⚠️ Creator escrow record already exists for this purchase. Skipping creation.');
    }

    // Create escrow record for Platform Fee
    const existingPlatformEscrow = await this.earningsEscrowModel.findOne({
      purchaseId: purchaseId,
      type: 'platform'
    });

    if (!existingPlatformEscrow) {
      await this.earningsEscrowModel.create({
        creatorId: new Types.ObjectId(this.configService.get<string>('PLATFORM_USER_ID')), // Assuming a PLATFORM_USER_ID is set for the platform's earnings
        roomId: roomId,
        purchaseId: purchaseId,
        amount: platformNetAmount, // Actual net platform earnings after Stripe fees
        grossAmount: amountPaid, // Gross amount paid by customer
        netAmount: platformFeeAmount, // Platform fee before Stripe fees
        stripeFees: stripeFees, // Stripe fees deducted from platform
        feeAtTransactionTime: platformSettings.platformFeePercentage,
        currency: currencyUsed,
        status: 'released', // Platform fee is immediately available
        releaseDate: new Date(), // Already released
        type: 'platform'
      });
      console.log(`✅ Platform escrow record created for NET fee amount $${platformNetAmount.toFixed(2)} (after Stripe fees).`);
    } else {
      console.log('⚠️ Platform escrow record already exists for this purchase. Skipping creation.');
    }

    // Send notification to Creator
    try {
      const buyerInfo = await this.userModel.findById(buyerUserId).select('username firstName lastName avatar');
                if (buyerInfo) {
                  await this.notificationService.addNotifications([{
                    toUserId: room.createdBy.toString(),
          fromUserId: buyerUserId,
          content: `Purchased your session "${room.name}" for $${amountPaid} (You earned $${creatorAmount.toFixed(2)})`,
                    type: NotificationType.SESSION_PURCHASED,
                    data: {
            roomId: (room._id as Types.ObjectId).toString(),
                      roomName: room.name,
                      amount: amountPaid,
            creatorEarned: creatorAmount,
            platformFee: platformFeeAmount,
                      currency: currencyUsed,
                      purchaseId: (purchase._id as Types.ObjectId).toString(),
            buyerId: buyerUserId,
                      buyerName: `${buyerInfo.firstName} ${buyerInfo.lastName}`,
                      buyerUsername: buyerInfo.username,
                      buyerAvatar: buyerInfo.avatar
                    }
                  }]);
              console.log('📧 Notification sent to creator about session purchase');
            }
          } catch (notificationError) {
      console.error('Error sending purchase notification to creator:', notificationError);
          }

    // Send notification to Buyer
          try {
            await this.notificationService.addNotifications([{
        toUserId: buyerUserId,
              content: `Successfully purchased session "${room.name}"!`,
              type: NotificationType.SESSION_PURCHASED,
              data: {
          roomId: (room._id as Types.ObjectId).toString(),
                roomName: room.name,
                amount: amountPaid,
                currency: currencyUsed,
                purchaseId: (purchase._id as Types.ObjectId).toString(),
          sessionUrl: `/rooms/${(room._id as Types.ObjectId).toString()}`, // Explicitly cast room._id
          joinUrl: room.secretId ? `/livekit/join/${room.secretId}` : `/livekit/join-public/${(room._id as Types.ObjectId).toString()}`, // Explicitly cast room._id
                scheduledStartTime: room.scheduledStartTime
              }
            }]);
            console.log('📧 Purchase success notification sent to buyer');
          } catch (buyerNotificationError) {
            console.error('Error sending purchase success notification to buyer:', buyerNotificationError);
          }
            }

  // تعديل handleWebhookEvent لإضافة الأرباح المحجوزة
  async handleWebhookEvent(payload: string, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not defined in environment variables.');
    }

    console.log('🔍 Webhook processing:', {
      payloadLength: payload?.length || 0,
      signature: signature,
      webhookSecret: webhookSecret ? 'Present' : 'Missing'
    });

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      console.log('✅ Webhook event constructed successfully:', event.type);
    } catch (err) {
      console.error(`❌ Webhook Error: ${err.message}`);
      console.error('Payload:', payload);
      console.error('Signature:', signature);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('🎉 Processing checkout.session.completed event');
        const session = event.data.object as Stripe.Checkout.Session;

        if (!session.metadata || !session.metadata.roomId || !session.metadata.userId) {
          console.error('❌ Missing metadata in Stripe session');
          throw new BadRequestException('Missing metadata in Stripe session.');
        }
        const { roomId, userId } = session.metadata as { roomId: string; userId: string };
        if (session.amount_total === null) {
          console.error('❌ Missing amount_total in Stripe session');
          throw new BadRequestException('Missing amount_total in Stripe session.');
        }
        const amountPaid = session.amount_total / 100; // Convert cents to dollars
        if (session.currency === null) {
          console.error('❌ Missing currency in Stripe session');
          throw new BadRequestException('Missing currency in Stripe session.');
        }
        const currencyUsed = session.currency.toUpperCase();
        const transactionId = session.id; // Checkout Session ID

        console.log('💰 Purchase details:', { roomId, userId, amountPaid, currencyUsed, transactionId });

        try {
          // In the new simplified flow, we create the purchase record ONLY upon successful webhook.
          // First, check if a COMPLETED purchase already exists for this user and room.
          const existingCompletedPurchase = await this.meetingPurchaseModel.findOne({
            userId: new Types.ObjectId(userId),
            roomId: new Types.ObjectId(roomId),
            status: PurchaseStatus.COMPLETED,
          });

          if (existingCompletedPurchase) {
            console.log(`⚠️ User ${userId} already has a COMPLETED purchase for room ${roomId}. Skipping creation.`);
          } else {
            // If no completed purchase, create a new one as COMPLETED.
            console.log('✅ Creating new purchase record as COMPLETED.');
            const purchase = await this.meetingPurchaseModel.create({
              userId: new Types.ObjectId(userId),
              roomId: new Types.ObjectId(roomId),
              amountPaid: amountPaid,
              currencyUsed: currencyUsed,
              transactionId: transactionId,
              status: PurchaseStatus.COMPLETED,
              purchaseDate: new Date(),
              stripePaymentIntentId: session.payment_intent as string || undefined
            });

            const room = await this.roomModel.findById(roomId) as LivekitRoomDocument; // Explicitly cast to LivekitRoomDocument
            if (room) {
              await this.sendPurchaseNotificationsAndEscrowOnCompletion(purchase, room, userId, amountPaid, currencyUsed, null);
            }
          }
        } catch (error) {
          console.error('❌ Error processing checkout.session.completed webhook:', error);
          throw new BadRequestException(`Failed to process checkout session webhook: ${error.message}`);
        }
        break;

      case 'payout.paid':
        console.log('✅ Processing payout.paid event');
        const paidPayout = event.data.object as Stripe.Payout;
        
        // Update withdrawal record to completed status
        if (paidPayout.metadata && paidPayout.metadata.type === 'earnings_withdrawal') {
          try {
            await this.withdrawalModel.updateOne(
              { stripePayoutId: paidPayout.id },
              {
                $set: {
                  status: 'completed',
                  completedAt: new Date(),
                  netAmount: paidPayout.amount / 100, // Convert from cents
                  stripeFees: 0 // Stripe doesn't charge fees for payouts in test mode
                }
              }
            );
            console.log(`✅ Updated withdrawal record for payout ${paidPayout.id} to completed status`);
          } catch (error) {
            console.error('❌ Error updating withdrawal record:', error);
          }
        }
        break;

      case 'payout.failed':
        console.log('❌ Processing payout.failed event');
        const failedPayout = event.data.object as Stripe.Payout;
        
        // Update withdrawal record to failed status
        if (failedPayout.metadata && failedPayout.metadata.type === 'earnings_withdrawal') {
          try {
            await this.withdrawalModel.updateOne(
              { stripePayoutId: failedPayout.id },
              {
                $set: {
                  status: 'failed',
                  failedAt: new Date(),
                  failureReason: failedPayout.failure_code || 'Unknown failure'
                }
              }
            );
            console.log(`❌ Updated withdrawal record for payout ${failedPayout.id} to failed status`);
          } catch (error) {
            console.error('❌ Error updating withdrawal record:', error);
          }
        }
        break;

      case 'payment_intent.succeeded':
        console.log('✅ Processing payment_intent.succeeded event');
        const succeededPaymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('📋 payment_intent.succeeded metadata:', succeededPaymentIntent.metadata);
        console.log('📋 payment_intent.succeeded transfer_group:', succeededPaymentIntent.transfer_group);

        if (succeededPaymentIntent.metadata && succeededPaymentIntent.metadata.roomId && succeededPaymentIntent.metadata.userId) {
          const { roomId, userId } = succeededPaymentIntent.metadata;
          const amountPaid = succeededPaymentIntent.amount / 100;
          const currencyUsed = succeededPaymentIntent.currency.toUpperCase();
          const transactionId = succeededPaymentIntent.id;

          // ❌ إزالة الـ DEBUG logs الزائدة
          // console.log('DEBUG: payment_intent.succeeded - transactionId:', transactionId);
          // console.log('DEBUG: payment_intent.succeeded - latest_charge:', succeededPaymentIntent.latest_charge);

          try {
            // استخراج Transfer ID من قائمة الـ charges المرتبطة بالـ payment intent
            let transferId: string | null = null;
            try {
              console.log('🔍 Extracting Transfer ID from charges list...');
              const charges = await this.stripe.charges.list({
                payment_intent: transactionId,
                limit: 1,
                expand: ['data.transfer'], // 👈 توسيع حقل الـ transfer في قائمة الـ charges
              });

              if (charges.data.length > 0 && charges.data[0].transfer) {
                const charge = charges.data[0];
                if (typeof charge.transfer !== 'string') {
                  transferId = (charge.transfer as any).id;
                  console.log('✅ Transfer ID extracted from charges list (expanded):', transferId);
                } else {
                  transferId = charge.transfer;
                  console.log('✅ Transfer ID extracted from charges list (string):', transferId);
                }
              } else {
                console.warn('⚠️ No charges found or no transfer associated with payment intent:', transactionId);

                // محاولة استخراج transfer ID من transfer_group في payment_intent
                if (succeededPaymentIntent.transfer_group) {
                  console.log('🔍 Trying to find transfer by transfer_group:', succeededPaymentIntent.transfer_group);
                  try {
                    // البحث عن جميع transfers التي تحتوي على نفس transfer_group
                    const transfers = await this.stripe.transfers.list({
                      limit: 10, // زيادة الحد للحصول على المزيد من النتائج
                    });

                    // البحث عن transfer يحتوي على نفس transfer_group و destination يطابق creator account
                    // نحتاج للحصول على creator account من خلال metadata
                    const creatorAccountId = succeededPaymentIntent.metadata?.creatorAccountId;
                    if (creatorAccountId) {
                      const matchingTransfer = transfers.data.find(t =>
                        t.transfer_group === succeededPaymentIntent.transfer_group &&
                        t.destination === creatorAccountId
                      );

                      if (matchingTransfer) {
                        transferId = matchingTransfer.id;
                        console.log('✅ Transfer ID found by transfer_group and destination:', transferId);
                      } else {
                        console.warn('⚠️ No transfer found with matching transfer_group and destination');
                      }
                    } else {
                      console.warn('⚠️ No creatorAccountId in payment_intent metadata');
                    }
                  } catch (groupError) {
                    console.warn('⚠️ Could not find transfer by transfer_group:', groupError);
                  }
                }
              }
            } catch (transferError) {
              console.error('❌ Error extracting transfer ID from charges list:', transferError);
            }
            console.log('📋 Final transferId value before purchase creation:', transferId);

            // Check if a COMPLETED purchase already exists for this user and room
            const existingCompletedPurchase = await this.meetingPurchaseModel.findOne({
              userId: new Types.ObjectId(userId),
              roomId: new Types.ObjectId(roomId),
              status: PurchaseStatus.COMPLETED,
            });

            if (existingCompletedPurchase) {
              console.log(`⚠️ User ${userId} already has a COMPLETED purchase for room ${roomId}. Skipping creation.`);

              // ✅ تحديث الـ escrow الموجود بالـ transferId إذا كان مفقود
              if (transferId) {
                console.log('🔄 Updating existing creator escrow with transferId...');
                const existingEscrow = await this.earningsEscrowModel.findOne({
                  purchaseId: existingCompletedPurchase._id,
                  type: 'creator'
                });

                if (existingEscrow && !existingEscrow.originalTransferId) {
                  existingEscrow.originalTransferId = transferId;
                  await existingEscrow.save();
                  console.log(`✅ Updated existing escrow ${existingEscrow._id} with transferId: ${transferId}`);
                } else if (existingEscrow && existingEscrow.originalTransferId) {
                  console.log(`ℹ️ Escrow already has transferId: ${existingEscrow.originalTransferId}`);
                } else {
                  console.warn('⚠️ No creator escrow found for existing purchase');
                }
              }
              
              console.log('Skipping purchase creation.');
            } else {
              console.log('✅ Creating new purchase record as COMPLETED from payment_intent.succeeded.');
              const purchase = await this.meetingPurchaseModel.create({
                userId: new Types.ObjectId(userId),
                roomId: new Types.ObjectId(roomId),
                amountPaid: amountPaid,
                currencyUsed: currencyUsed,
                transactionId: transactionId,
                status: PurchaseStatus.COMPLETED,
                purchaseDate: new Date(),
                stripePaymentIntentId: transactionId
              });

              const room = await this.roomModel.findById(roomId) as LivekitRoomDocument; // Explicitly cast to LivekitRoomDocument
              if (room) {
                await this.sendPurchaseNotificationsAndEscrowOnCompletion(purchase, room, userId, amountPaid, currencyUsed, transferId);
              }
            }
          } catch (error) {
            console.error('❌ Error processing payment_intent.succeeded webhook:', error);
            throw new BadRequestException(`Failed to process payment intent succeeded webhook: ${error.message}`);
          }
        } else {
          console.warn('⚠️ Missing metadata in payment_intent.succeeded event. Cannot process purchase.', succeededPaymentIntent);
        }
        break;

      case 'payment_intent.payment_failed':
        console.log('💳 Processing payment_intent.payment_failed event');
        const failedPaymentIntent = event.data.object as Stripe.PaymentIntent;

        if (failedPaymentIntent.metadata && failedPaymentIntent.metadata.roomId && failedPaymentIntent.metadata.userId) {
          const { roomId, userId } = failedPaymentIntent.metadata;
          const amountPaid = failedPaymentIntent.amount / 100;
          const currencyUsed = failedPaymentIntent.currency.toUpperCase();
          const transactionId = failedPaymentIntent.id;

          try {
            // First, check if a COMPLETED purchase already exists for this user and room.
            const existingCompletedPurchase = await this.meetingPurchaseModel.findOne({
              userId: new Types.ObjectId(userId),
              roomId: new Types.ObjectId(roomId),
              status: PurchaseStatus.COMPLETED,
            });

            if (existingCompletedPurchase) {
              console.log(`⚠️ User ${userId} already has a COMPLETED purchase for room ${roomId}. Skipping creation of FAILED record.`);
            } else {
              // If no completed purchase, check for existing FAILED/CANCELLED to update or create new FAILED.
              let purchase = await this.meetingPurchaseModel.findOne({
                userId: new Types.ObjectId(userId),
                roomId: new Types.ObjectId(roomId),
                status: { $in: [PurchaseStatus.FAILED, PurchaseStatus.CANCELLED] }, // Removed EXPIRED
              });

              if (purchase) {
                // Update existing FAILED/CANCELLED purchase to FAILED.
                console.log(`🔄 Updating existing purchase ${purchase._id} from ${purchase.status} to FAILED.`);
                purchase.status = PurchaseStatus.FAILED;
                purchase.failureReason = failedPaymentIntent.last_payment_error?.message || 'Payment failed';
                purchase.stripePaymentIntentId = transactionId;
                await purchase.save();
              } else {
                // Create new FAILED purchase.
                console.log('❌ Creating new purchase record as FAILED.');
                purchase = await this.meetingPurchaseModel.create({
                  userId: new Types.ObjectId(userId),
                  roomId: new Types.ObjectId(roomId),
                  amountPaid: amountPaid,
                  currencyUsed: currencyUsed,
                  transactionId: transactionId,
                  status: PurchaseStatus.FAILED,
                  purchaseDate: new Date(),
                  failureReason: failedPaymentIntent.last_payment_error?.message || 'Payment failed',
                  stripePaymentIntentId: transactionId
                });
              }
              console.log('✅ FAILED purchase record processed:', purchase._id);
              await this.sendPurchaseStatusNotification(userId, roomId, PurchaseStatus.FAILED);
            }
          } catch (error) {
            console.error('❌ Error processing payment_intent.payment_failed webhook:', error);
            throw new BadRequestException(`Failed to process payment intent failed webhook: ${error.message}`);
          }
        } else {
          console.warn('⚠️ Missing metadata in payment_intent.payment_failed event. Cannot process purchase.', failedPaymentIntent);
        }
        break;

      case 'transfer.created':
        console.log('✅ Processing transfer.created event');
        const createdTransfer = event.data.object as Stripe.Transfer;

        try {
          // Find the EarningsEscrow record that matches this transfer
          // We need to find it by the transfer amount and creator account
          const creatorAccountId = createdTransfer.destination as string;

          // Find the creator by their Stripe Connect account ID
          const creator = await this.userModel.findOne({
            stripeConnectAccountId: creatorAccountId
          });

          if (!creator) {
            console.warn('⚠️ No creator found with Stripe account:', creatorAccountId);
            break;
          }

          // Find recent EarningsEscrow records for this creator that don't have originalTransferId yet
          // Only look for creator type records, not platform records
          const recentEscrows = await this.earningsEscrowModel.find({
            creatorId: creator._id,
            type: 'creator', // Only creator records, not platform records
            originalTransferId: { $exists: false },
            createdAt: {
              $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          }).sort({ createdAt: -1 }).limit(5);

          if (recentEscrows.length > 0) {
            // Update the most recent escrow with the transfer ID
            const escrowToUpdate = recentEscrows[0];
            escrowToUpdate.originalTransferId = createdTransfer.id;
            await escrowToUpdate.save();

            console.log(`✅ Updated EarningsEscrow ${escrowToUpdate._id} with transfer ID: ${createdTransfer.id}`);
          } else {
            console.warn('⚠️ No recent EarningsEscrow records found to update with transfer ID');
          }
        } catch (error) {
          console.error('❌ Error processing transfer.created webhook:', error);
        }
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  async getCreatorEarnings(
    userId: string,
    query: MyEarningsQueryDto,
  ): Promise<MyEarningsResponseDto> {
    const { page = 1, limit = 10, startDate, endDate, search } = query as any;
    const status = (query as any)?.status || 'released'; // default to released only

    const skip = (page - 1) * limit;
    const match: any = {
      creatorId: new Types.ObjectId(userId),
      // دعم السجلات القديمة التي لا تحتوي type: استبعد platform فقط
      $or: [ { type: { $ne: 'platform' } }, { type: { $exists: false } } ]
    };
    if (status && status !== 'all') match.status = status;

    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    // نبني pipeline للفترة على effectiveDate لاحقاً بدلاً من $expr في match الأول

    // لا نضيف شرط البحث هنا لأن roomInfo غير متاحة قبل $lookup

    const [data] = await this.earningsEscrowModel.aggregate([
      { $match: match },
      { $addFields: { effectiveDate: { $ifNull: ['$releaseDate', '$createdAt'] } } },
      ...(startDate || endDate
        ? [{ $match: { effectiveDate: { ...(startDate ? { $gte: new Date(startDate) } : {}), ...(endDate ? { $lte: new Date(endDate) } : {}) } } }]
        : []),
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: { path: '$roomInfo', preserveNullAndEmptyArrays: true } },
      ...(search && search.trim() ? [{ $match: { 'roomInfo.name': { $regex: search.trim(), $options: 'i' } } }] : []),
      {
        $facet: {
          rows: [
            ...(search && search.trim() ? [{ $match: { 'roomInfo.name': { $regex: search.trim(), $options: 'i' } } }] : []),
            { $sort: { effectiveDate: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                roomId: { $toString: '$roomId' },
                title: '$roomInfo.name',
                amountPaid: '$amount',
                currencyUsed: '$currency',
                status: 1,
                date: '$createdAt',
                releaseDate: '$releaseDate'
              }
            }
          ],
          count: [
            ...(search && search.trim() ? [{ $match: { 'roomInfo.name': { $regex: search.trim(), $options: 'i' } } }] : []),
            { $count: 'total' }
          ],
          totalUsd: [
            ...(search && search.trim() ? [{ $match: { 'roomInfo.name': { $regex: search.trim(), $options: 'i' } } }] : []),
            { $match: { currency: 'USD' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]
        }
      }
    ]);

    const earnings = data?.rows || [];
    const totalCount = data?.count?.[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit) || 0;
    const totalEarningsUSD = data?.totalUsd?.[0]?.total || 0;

    return plainToInstance(MyEarningsResponseDto, {
      earnings,
      totalEarningsUSD,
      totalCount,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  }

  // New method to fetch earnings with transaction-specific fee information
  private async getEarningsWithTransactionFees(
    userId: string,
    query: MyEarningsQueryDto,
  ): Promise<{ earnings: AggregatedEarning[]; totalCount: number; totalPages: number }> {
    const { page = 1, limit = 10, startDate, endDate, currency } = query;
    const skip = (page - 1) * limit;

    const matchStage: any = {
      userId: new Types.ObjectId(userId), // Match by userId for MeetingPurchase
      status: PurchaseStatus.COMPLETED 
    };

    // Find rooms created by the user
    const roomsCreatedByUser = await this.roomModel.find(
      { createdBy: new Types.ObjectId(userId) },
      { _id: 1, name: 1 },
    );
    const roomIds = roomsCreatedByUser.map((room) => room._id);

    matchStage.roomId = { $in: roomIds };

    if (startDate) {
      matchStage.createdAt = { ...matchStage.createdAt, $gte: new Date(startDate) };
    }
    if (endDate) {
      matchStage.createdAt = { ...matchStage.createdAt, $lte: new Date(endDate) };
    }
    if (currency) {
      matchStage.currencyUsed = currency;
    }

    const pipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo',
        },
      },
      { $unwind: '$roomInfo' },
      {
        $project: {
          _id: 1,
          roomId: { $toString: '$roomInfo._id' },
          title: '$roomInfo.name',
          amountPaid: '$amountPaid', // This is the gross amount from MeetingPurchase
          grossAmount: '$amountPaid', // explicit grossAmount
          platformFeePercentage: '$platformFeePercentage', // From MeetingPurchase schema
          currencyUsed: '$currencyUsed',
          purchaseDate: '$createdAt', // Use createdAt from MeetingPurchase
          status: '$status',
        },
      },
      { $sort: { purchaseDate: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const [results, countResults] = await Promise.all([
      this.meetingPurchaseModel.aggregate(pipeline),
      this.meetingPurchaseModel.aggregate([
        ...pipeline.slice(0, -2),
        { $count: 'totalCount' }
      ])
    ]);

    const totalCount = countResults[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return { earnings: results, totalCount, totalPages };
  }

  async getUserPurchases(
    userId: string,
    query: MyPurchasesQueryDto,
  ): Promise<MyPurchasesResponseDto> {
    const { page = 1, limit = 10, startDate, endDate, currency, roomId, search } = query; // include search
    const skip = (page - 1) * limit;

    const matchStage: any = {
      userId: new Types.ObjectId(userId),
      // Remove status filter to show all purchases
    };

    if (startDate) {
      matchStage.purchaseDate = { ...matchStage.purchaseDate, $gte: new Date(startDate) };
    }
    if (endDate) {
      matchStage.purchaseDate = { ...matchStage.purchaseDate, $lte: new Date(endDate) };
    }
    if (currency) {
      matchStage.currencyUsed = currency.toUpperCase();
    }
    // If roomId is provided and is a valid ObjectId, filter by it; otherwise ignore here
    let filterByRoomId: Types.ObjectId | null = null;
    if (roomId) {
      try {
        filterByRoomId = new Types.ObjectId(roomId);
        matchStage.roomId = filterByRoomId;
      } catch {
        // not a valid ObjectId; we'll treat it as a search term instead
      }
    }

    const pipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo',
        },
      },
      { $unwind: '$roomInfo' },
      // Apply search on room name after lookup
      ...(search && search.trim() && !filterByRoomId ? [{ $match: { 'roomInfo.name': { $regex: search.trim(), $options: 'i' } } }] : []),
      {
        $facet: {
          rows: [
            { $sort: { purchaseDate: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                roomId: { $toString: '$roomInfo._id' }, // Cast ObjectId to string
                title: '$roomInfo.name',
                amountPaid: 1,
                currencyUsed: 1,
                status: 1,
                date: '$purchaseDate',
                releaseDate: '$purchaseDate',
                failureReason: 1,
              },
            },
          ],
          count: [
            { $count: 'totalCount' }
          ],
          totalUsd: [
            { $match: { currencyUsed: 'USD' } },
            { $group: { _id: null, total: { $sum: '$amountPaid' } } }
          ]
        }
      }
    ];

    const [agg] = await this.meetingPurchaseModel.aggregate(pipeline).exec();

    const purchases = (agg?.rows || []) as UserPurchaseDto[];
    const totalCount = agg?.count?.[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);
    const totalSpentUSD = agg?.totalUsd?.[0]?.total || 0;

    const purchasesWithActions = purchases.map(purchase => ({
      ...purchase,
      actions: this.getPurchaseActions(purchase.status)
    })) as UserPurchaseDto[];

    return plainToInstance(MyPurchasesResponseDto, {
      purchases: purchasesWithActions,
      totalSpentUSD,
      totalCount,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  }

  // جلب إحصائيات لوحة التحكم للمستخدم
  async getDashboardData(userId: string, startDate?: string, endDate?: string): Promise<DashboardResponseDto> {
    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    // حساب الأرباح الإجمالية من سجلات Escrow التي تم تحريرها
    const totalEarningsResult = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId), 
          status: 'released',
          // استبعد سجلات المنصة
          $or: [
            { type: { $ne: 'platform' } },
            { type: { $exists: false } }
          ],
          ...(startDate||endDate ? { createdAt: dateFilter } : {}) 
        } 
      },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
    ]);
    const totalEarnings = totalEarningsResult[0]?.totalAmount || 0;

    // حساب المشتريات الإجمالية
    const spentMatch: any = { userId: new Types.ObjectId(userId), status: PurchaseStatus.COMPLETED };
    if (startDate || endDate) spentMatch.purchaseDate = dateFilter;
    const spentAgg = await this.meetingPurchaseModel.aggregate([
      { $match: spentMatch },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);
    const totalSpent = spentAgg[0]?.total || 0;

    // حساب الرصيد المتاح والأرباح المعلقة
    const escrows = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId),
          // استبعد سجلات المنصة
          $or: [
            { type: { $ne: 'platform' } },
            { type: { $exists: false } }
          ],
          ...(startDate||endDate ? { createdAt: dateFilter } : {}) 
        } 
      },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const releasedEarnings = escrows.find(e => e._id === 'released')?.totalAmount || 0;
    const pendingEarnings = escrows.find(e => e._id === 'pending')?.totalAmount || 0;

    // حساب المبلغ المسحوب من سجلات Withdrawal (النظام الجديد)
    const withdrawals = await this.withdrawalModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId),
          status: { $in: ['completed', 'processing'] } // فقط السحوبات المكتملة أو قيد المعالجة
        } 
      },
      {
        $group: {
          _id: null,
          totalWithdrawn: { $sum: '$amount' }
        }
      }
    ]);

    const withdrawnAmount = withdrawals[0]?.totalWithdrawn || 0;
    const availableBalance = releasedEarnings - withdrawnAmount;

    // Debug log للتأكد من صحة الحساب في Dashboard
    console.log(`Dashboard balance calculation for user ${userId}:`);
    console.log(`- Released earnings: $${releasedEarnings}`);
    console.log(`- Withdrawn amount: $${withdrawnAmount}`);
    console.log(`- Available balance: $${availableBalance}`);

    // حساب عدد الجلسات المنشأة
    const totalSessionsCreated = await this.roomModel.countDocuments({
      createdBy: new Types.ObjectId(userId),
      ...(startDate||endDate ? { createdAt: dateFilter } : {})
    });

    // حساب عدد الجلسات المشتراة
    const totalSessionsPurchased = await this.meetingPurchaseModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: PurchaseStatus.COMPLETED,
      ...(startDate||endDate ? { purchaseDate: dateFilter } : {})
    });

    // حساب إجمالي المشاركين في الجلسات المنشأة
    const totalParticipants = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      { $match: { 'roomInfo.createdBy': new Types.ObjectId(userId), status: PurchaseStatus.COMPLETED } },
      { $count: 'totalParticipants' }
    ]);

    const stats: DashboardStatsDto = {
      totalEarnings,
      totalSpent,
      availableBalance,
      pendingEarnings,
      totalSessionsCreated,
      totalSessionsPurchased,
      totalParticipants: totalParticipants[0]?.totalParticipants || 0
    };

    // جلب بيانات الأرباح الشهرية
    const monthlyEarnings = await this.getMonthlyEarningsData(userId, startDate, endDate);

    return plainToInstance(DashboardResponseDto, {
      stats,
      monthlyEarnings
    });
  }

  // جلب الأنشطة الحديثة مع pagination
  async getRecentActivitiesWithPagination(
    userId: string, 
    page: number = 1, 
    limit: number = 10, 
    startDate?: string, 
    endDate?: string,
    search?: string
  ): Promise<{ data: RecentActivityDto[], total: number, page: number, limit: number, totalPages: number }> {
    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    // جلب كل الأرباح والمشتريات بدون pagination أولاً
    const [earningsResult] = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId), 
          status: { $in: ['released', 'pending'] }, 
          $or: [ { type: { $ne: 'platform' } }, { type: { $exists: false } } ],
          ...(startDate||endDate ? { createdAt: dateFilter } : {})
        } 
      },
      { $addFields: { effectiveDate: { $ifNull: ['$releaseDate', '$createdAt'] } } },
      {
        $facet: {
          data: [
            { $sort: { effectiveDate: -1 } },
            {
              $lookup: {
                from: 'livekitrooms',
                localField: 'roomId',
                foreignField: '_id',
                as: 'roomInfo'
              }
            },
            { $unwind: { path: '$roomInfo', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                type: { $literal: 'earning' },
                description: { $literal: 'Earned from session' },
                amount: '$amount',
                currency: '$currency',
                date: '$createdAt',
                releaseDate: '$releaseDate',
                roomId: { $toString: '$roomId' },
                title: '$roomInfo.name',
                status: '$status'
              }
            }
          ],
          total: [{ $count: 'count' }]
        }
      }
    ]);

    // جلب كل المشتريات بدون pagination
    const [purchasesResult] = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      { 
        $match: { 
          userId: new Types.ObjectId(userId), 
          status: PurchaseStatus.COMPLETED, 
          ...(startDate||endDate ? { purchaseDate: { ...(startDate ? { $gte: new Date(startDate) } : {}), ...(endDate ? { $lte: new Date(endDate) } : {}) } } : {}) 
        } 
      },
      {
        $facet: {
          data: [
            { $sort: { purchaseDate: -1 } },
            {
              $project: {
                type: { $literal: 'purchase' },
                description: { $literal: 'Purchased session' },
                amount: '$amountPaid',
                currency: '$currencyUsed',
                date: '$purchaseDate',
                releaseDate: '$purchaseDate',
                roomId: { $toString: '$roomId' },
                title: '$roomInfo.name',
                status: '$status'
              }
            }
          ],
          total: [{ $count: 'count' }]
        }
      }
    ]);

    // جلب السحوبات
    const withdrawalsResult = await this.withdrawalModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(userId),
          ...(startDate||endDate ? { createdAt: dateFilter } : {})
        }
      },
      {
        $project: {
          type: { $literal: 'withdrawal' },
          description: { $literal: 'Withdrawal of earnings' },
          amount: { $multiply: ['$amount', -1] }, // سالب لأنها سحب
          currency: '$currency',
          date: '$createdAt',
          releaseDate: '$createdAt',
          roomId: { $literal: null },
          title: { $concat: ['Withdrawal $', { $toString: '$amount' }] },
          status: '$status',
          withdrawalId: { $toString: '$_id' },
          stripePayoutId: '$stripePayoutId'
        }
      }
    ]);

    // جلب معاملات الـ refund
    const refundsResult = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      {
        $match: {
          status: PurchaseStatus.REFUNDED,
          ...(startDate||endDate ? { purchaseDate: { ...(startDate ? { $gte: new Date(startDate) } : {}), ...(endDate ? { $lte: new Date(endDate) } : {}) } } : {})
        }
      },
      {
        $project: {
          type: { $literal: 'refund' },
          description: { $literal: 'Session refund' },
          originalAmount: '$amountPaid',
          currency: '$currencyUsed',
          date: '$purchaseDate',
          releaseDate: '$purchaseDate',
          roomId: { $toString: '$roomId' },
          title: '$roomInfo.name',
          status: '$status',
          isCreator: { $eq: ['$roomInfo.createdBy', new Types.ObjectId(userId)] } // تحديد إذا كان المستخدم هو الـ creator
        }
      },
      {
        $project: {
          type: 1,
          description: 1,
          amount: {
            $cond: {
              if: '$isCreator',
              then: { $multiply: ['$originalAmount', -1] }, // سالب للـ creator
              else: '$originalAmount' // إيجابي للمشتري
            }
          },
          currency: 1,
          date: 1,
          releaseDate: 1,
          roomId: 1,
          title: 1,
          status: 1
        }
      }
    ]);

    // دمج وترتيب كل النتائج
    let allActivities = [
      ...earningsResult.data,
      ...purchasesResult.data,
      ...withdrawalsResult,
      ...refundsResult
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // تطبيق البحث إذا كان موجود
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      allActivities = allActivities.filter(activity => 
        activity.title?.toLowerCase().includes(searchTerm) ||
        activity.description?.toLowerCase().includes(searchTerm)
      );
    }

    // حساب الـ total بعد تطبيق البحث
    const total = allActivities.length;

    // تطبيق pagination على النتائج المدمجة
    const skip = (page - 1) * limit;
    const paginatedData = allActivities.slice(skip, skip + limit);

    return {
      data: paginatedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // جلب الأنشطة الحديثة (للـ dashboard القديم - deprecated)
  private async getRecentActivities(userId: string, startDate?: string, endDate?: string): Promise<RecentActivityDto[]> {
    const activities: RecentActivityDto[] = [];

    // جلب الأرباح الحديثة (صافي المبدع) من EarningsEscrow
    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const recentEarnings = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId), 
          status: { $in: ['released', 'pending'] }, 
          $or: [ { type: { $ne: 'platform' } }, { type: { $exists: false } } ],
          ...(startDate||endDate ? { createdAt: dateFilter } : {})
        } 
      },
      { $addFields: { effectiveDate: { $ifNull: ['$releaseDate', '$createdAt'] } } },
      { $sort: { effectiveDate: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: { path: '$roomInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          type: { $literal: 'earning' },
          description: { $literal: 'Earned from session' },
          amount: '$amount',
          currency: '$currency',
          date: '$effectiveDate',
          createdAt: '$createdAt',
          releaseDate: '$releaseDate',
          roomId: { $toString: '$roomId' },
          roomName: '$roomInfo.name',
          status: '$status'
        }
      }
    ]);

    // جلب المشتريات الحديثة
    const recentPurchases = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      { $match: { userId: new Types.ObjectId(userId), status: PurchaseStatus.COMPLETED, ...(startDate||endDate ? { purchaseDate: { ...(startDate ? { $gte: new Date(startDate) } : {}), ...(endDate ? { $lte: new Date(endDate) } : {}) } } : {}) } },
      { $sort: { purchaseDate: -1 } },
      { $limit: 5 },
      {
        $project: {
          type: { $literal: 'purchase' },
          description: { $literal: 'Purchased session' },
          amount: '$amountPaid',
          currency: '$currencyUsed',
          date: '$purchaseDate',
          roomId: { $toString: '$roomId' },
          roomName: '$roomInfo.name',
          status: '$status'
        }
      }
    ]);

    activities.push(...recentEarnings, ...recentPurchases);

    // ترتيب الأنشطة حسب التاريخ
    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }

  // جلب بيانات الأرباح الشهرية
  private async getMonthlyEarningsData(userId: string, startDate?: string, endDate?: string): Promise<Array<{ month: string; earnings: number; purchases: number }>> {
    const months: Array<{ month: string; earnings: number; purchases: number }> = [];
    
    // نطاق الأشهر: آخر 6 أشهر افتراضيًا، أو مبني على startDate/endDate إن وُجدوا
    let start: Date;
    let end: Date;
    if (startDate || endDate) {
      start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);
      end = endDate ? new Date(endDate) : new Date();
    } else {
      const currentDate = new Date();
      start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);
      end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }

    // ابني قائمة حدود الأشهر من start إلى end (شموع شهرية)
    const monthBounds: Array<{ from: Date; to: Date; label: string }> = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor < end) {
      const from = new Date(cursor);
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const label = from.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthBounds.push({ from, to, label });
      cursor.setMonth(cursor.getMonth() + 1);
    }
      
    for (const m of monthBounds) {

      // حساب الأرباح (الصافي) لهذا الشهر من EarningsEscrow (creator)
      // نستخدم releaseDate بدلاً من createdAt للحصول على الأرباح المحررة في هذا الشهر
      const monthlyEarnings = await this.earningsEscrowModel.aggregate([
        {
          $match: {
            creatorId: new Types.ObjectId(userId),
            // استبعد سجلات المنصة - اظهر بس سجلات الـ creator
            $or: [
              { type: { $ne: 'platform' } },
              { type: { $exists: false } }
            ],
            status: 'released', // فقط الأرباح المحررة
            releaseDate: { $gte: m.from, $lt: m.to } // الأرباح المحررة في هذا الشهر
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      // Debug: جلب تفاصيل الأرباح لهذا الشهر
      const earningsDetails = await this.earningsEscrowModel.find({
        creatorId: new Types.ObjectId(userId),
        $or: [
          { type: { $ne: 'platform' } },
          { type: { $exists: false } }
        ],
        status: 'released',
        releaseDate: { $gte: m.from, $lt: m.to }
      }).select('amount createdAt releaseDate type status').sort({ releaseDate: -1 });

      if (earningsDetails.length > 0) {
        console.log(`\n=== Earnings Details for ${m.label} ===`);
        console.log(`Date range: ${m.from.toISOString()} to ${m.to.toISOString()}`);
        console.log(`Found ${earningsDetails.length} earnings records:`);
        earningsDetails.forEach((earning, index) => {
          console.log(`${index + 1}. Amount: $${earning.amount}, Created: ${(earning as any).createdAt.toISOString()}, Released: ${(earning as any).releaseDate.toISOString()}, Type: ${earning.type || 'undefined'}, Status: ${earning.status}`);
        });
        const totalFromDetails = earningsDetails.reduce((sum, e) => sum + e.amount, 0);
        console.log(`Total from details: $${totalFromDetails}`);
        console.log(`Total from aggregation: $${monthlyEarnings[0]?.total || 0}`);
        console.log(`=====================================\n`);
      }

      // حساب المشتريات لهذا الشهر
      const monthlyPurchases = await this.meetingPurchaseModel.aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            status: PurchaseStatus.COMPLETED,
            purchaseDate: { $gte: m.from, $lt: m.to }
          }
        },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ]);

      const earningsAmount = monthlyEarnings[0]?.total || 0;
      const purchasesAmount = monthlyPurchases[0]?.total || 0;
      
      // Debug log للتأكد من صحة الحساب
      if (earningsAmount > 0 || purchasesAmount > 0) {
        console.log(`Monthly data for ${m.label}:`);
        console.log(`- Earnings: $${earningsAmount}`);
        console.log(`- Purchases: $${purchasesAmount}`);
      }

      months.push({
        month: m.label,
        earnings: earningsAmount,
        purchases: purchasesAmount
      });
    }

    // Debug: جلب إجمالي الأرباح في النظام
    const totalEarningsInSystem = await this.earningsEscrowModel.aggregate([
      {
        $match: {
          creatorId: new Types.ObjectId(userId),
          $or: [
            { type: { $ne: 'platform' } },
            { type: { $exists: false } }
          ]
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    console.log(`\n=== TOTAL EARNINGS IN SYSTEM ===`);
    console.log(`Total earnings for user ${userId}: $${totalEarningsInSystem[0]?.total || 0}`);
    console.log(`================================\n`);

    return months;
  }

  // جلب إحصائيات سريعة
  async getQuickStats(userId: string): Promise<QuickStatsDto> {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    // أرباح هذا الشهر
    const thisMonthEarnings = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      {
        $match: {
          'roomInfo.createdBy': new Types.ObjectId(userId),
          status: 'completed',
          purchaseDate: { $gte: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);

    // إنفاق هذا الشهر
    const thisMonthSpending = await this.meetingPurchaseModel.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          status: 'completed',
          purchaseDate: { $gte: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } }
    ]);

    // الرصيد المتاح والسحب
    const escrows = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId),
          // استبعد سجلات المنصة
          $or: [
            { type: { $ne: 'platform' } },
            { type: { $exists: false } }
          ]
        } 
      },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const releasedEarnings = escrows.find(e => e._id === 'released')?.totalAmount || 0;
    const pendingInEscrow = escrows.find(e => e._id === 'pending')?.totalAmount || 0;

    // حساب المبلغ المسحوب من سجلات Withdrawal (النظام الجديد)
    const withdrawals = await this.withdrawalModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(userId),
          status: { $in: ['completed', 'processing'] } // فقط السحوبات المكتملة أو قيد المعالجة
        } 
      },
      {
        $group: {
          _id: null,
          totalWithdrawn: { $sum: '$amount' }
        }
      }
    ]);

    const withdrawnAmount = withdrawals[0]?.totalWithdrawn || 0;
    const availableForWithdrawal = releasedEarnings - withdrawnAmount;

    // Debug log للتأكد من صحة الحساب في Quick Stats
    console.log(`Quick Stats balance calculation for user ${userId}:`);
    console.log(`- Released earnings: $${releasedEarnings}`);
    console.log(`- Withdrawn amount: $${withdrawnAmount}`);
    console.log(`- Available for withdrawal: $${availableForWithdrawal}`);

    // إجمالي الجلسات المدفوعة المنشأة
    const totalPaidSessions = await this.roomModel.countDocuments({
      createdBy: new Types.ObjectId(userId),
      isPaid: true,
      price: { $gt: 0 }
    });

    // إجمالي الجلسات المشتراة
    const totalSessionsPurchased = await this.meetingPurchaseModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: 'completed'
    });

    // إجمالي المشاركين في الجلسات المنشأة
    const totalParticipants = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      {
        $match: {
          'roomInfo.createdBy': new Types.ObjectId(userId),
          status: 'completed'
        }
      },
      { $count: 'total' }
    ]);

    return plainToInstance(QuickStatsDto, {
      thisMonthEarnings: thisMonthEarnings[0]?.total || 0,
      thisMonthSpending: thisMonthSpending[0]?.total || 0,
      availableForWithdrawal,
      pendingInEscrow,
      totalPaidSessions,
      totalSessionsPurchased,
      totalParticipants: totalParticipants[0]?.total || 0,
      currency: 'USD'
    });
  }

  // جلب تاريخ المشتريات مع pagination
  async getPurchasesHistoryWithPagination(
    userId: string, 
    page: number = 1, 
    limit: number = 10, 
    startDate?: string, 
    endDate?: string,
    search?: string
  ): Promise<{ data: any[], total: number, page: number, limit: number, totalPages: number }> {
    const skip = (page - 1) * limit;
    
    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const matchQuery: any = { 
      userId: new Types.ObjectId(userId), 
      status: PurchaseStatus.COMPLETED,
      ...(startDate || endDate ? { purchaseDate: dateFilter } : {})
    };

    // إضافة البحث في اسم الغرفة
    if (search && search.trim()) {
      matchQuery['roomInfo.name'] = { $regex: search.trim(), $options: 'i' };
    }

    const [result] = await this.meetingPurchaseModel.aggregate([
      {
        $lookup: {
          from: 'livekitrooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      { $match: matchQuery },
      {
        $facet: {
          data: [
            { $sort: { purchaseDate: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                roomId: { $toString: '$roomId' },
                roomName: '$roomInfo.name',
                amountPaid: '$amountPaid',
                currencyUsed: '$currencyUsed',
                status: '$status',
                date: '$purchaseDate',
                releaseDate: '$purchaseDate',
                transactionId: '$transactionId'
              }
            }
          ],
          total: [{ $count: 'count' }]
        }
      }
    ]);

    return {
      data: result.data,
      total: result.total[0]?.count || 0,
      page,
      limit,
      totalPages: Math.ceil((result.total[0]?.count || 0) / limit)
    };
  }

  // New method to check if a user has purchased a specific room
  async checkRoomPurchaseStatus(userId: string, roomId: string): Promise<boolean> {
    const purchase = await this.meetingPurchaseModel.findOne({
      userId: new Types.ObjectId(userId),
      roomId: new Types.ObjectId(roomId),
      status: PurchaseStatus.COMPLETED,
    });
    return !!purchase;
  }

  // New method to check if a user has purchased multiple rooms
  async checkRoomPurchaseStatusBulk(userId: string, roomIds: string[]): Promise<{ [key: string]: boolean }> {
    const objectRoomIds = roomIds.map(id => new Types.ObjectId(id));
    const purchases = await this.meetingPurchaseModel.find({
      userId: new Types.ObjectId(userId),
      roomId: { $in: objectRoomIds },
      status: PurchaseStatus.COMPLETED,
    }).select('roomId');

    const purchasedRoomIds = new Set(purchases.map(p => p.roomId.toString()));

    const result: { [key: string]: boolean } = {};
    roomIds.forEach(id => {
      result[id] = purchasedRoomIds.has(id);
    });
    return result;
  }
}
