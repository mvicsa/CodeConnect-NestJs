import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EarningsEscrow, EarningsEscrowDocument } from './schemas/earnings-escrow.schema';
import { Withdrawal, WithdrawalDocument } from './schemas/withdrawal.schema';
import { MeetingPurchase, MeetingPurchaseDocument } from 'src/livekit/schemas/meeting-purchase.schema';
import { LivekitRoom } from 'src/livekit/room.schema';
import { PaymentService } from './payment.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { PlatformSettingsService } from 'src/admin/platform-settings.service';
import { 
  EarningsEscrowDto, 
  EarningsEscrowSummaryDto, 
  EscrowStatus 
} from './dto/earnings-escrow.dto';
import { 
  BalanceSummaryDto, 
  EarningDetailDto 
} from './dto/balance.dto';
import { plainToInstance } from 'class-transformer';
import { StripeConnectService } from './stripe-connect.service'; // Import StripeConnectService
import { User, UserDocument } from 'src/users/shemas/user.schema'; // Import User schema

@Injectable()
export class EarningsEscrowService {
  constructor(
    @InjectModel(EarningsEscrow.name)
    private readonly earningsEscrowModel: Model<EarningsEscrowDocument>,
    @InjectModel(Withdrawal.name)
    private readonly withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(MeetingPurchase.name)
    private readonly meetingPurchaseModel: Model<MeetingPurchaseDocument>,
    @InjectModel(LivekitRoom.name)
    private readonly roomModel: Model<LivekitRoom>,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService,
    private readonly stripeConnectService: StripeConnectService, // Inject StripeConnectService
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>, // Inject User model
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  // إنشاء سجل أرباح محجوزة عند إتمام عملية شراء
  async createEscrow(
    purchaseId: string, 
    creatorId: string, 
    roomId: string, 
    amount: number,
    grossAmount?: number,
    feeAtTransactionTime?: number,
    type: string = 'creator'
  ): Promise<EarningsEscrowDocument> {
    // حساب تاريخ التحرير (مثلاً بعد 14 يوم)
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 14);

    return this.earningsEscrowModel.create({
      creatorId: new Types.ObjectId(creatorId),
      roomId: new Types.ObjectId(roomId),
      purchaseId: new Types.ObjectId(purchaseId),
      amount,
      grossAmount: grossAmount || amount, // Use provided grossAmount or default to amount
      currency: 'USD',
      status: 'pending',
      releaseDate,
      type,
      feeAtTransactionTime: feeAtTransactionTime || 0 // Use provided fee or default to 0
    });
  }

  // التحقق من الأرباح المحجوزة التي يمكن إطلاقها
  async releaseMaturedEscrows(): Promise<void> {
    const now = new Date();
    const maturedEscrows = await this.earningsEscrowModel.find({
      status: 'pending',
      releaseDate: { $lte: now }
    });

    const releasePromises = maturedEscrows.map(async (escrow) => {
      try {
        // التحقق من حالة الشراء
        const purchase = await this.meetingPurchaseModel.findById(escrow.purchaseId);
        
        if (!purchase || purchase.status !== 'completed') {
          // إذا كان الشراء ملغى أو غير مكتمل، يتم رد الأموال
          escrow.status = EscrowStatus.REFUNDED;
          escrow.refundedAt = new Date();
          await escrow.save();

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

          return;
        }

        // تحرير الأرباح
        escrow.status = EscrowStatus.RELEASED;
        escrow.releasedAt = new Date();
        await escrow.save();

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
        console.error('Error processing escrow:', error);
      }
    });

    await Promise.all(releasePromises);
  }

  // التعامل مع المنازعات أو الإلغاءات
  async disputeEscrow(
    escrowId: string, 
    reason: string
  ): Promise<void> {
    const escrow = await this.earningsEscrowModel.findById(escrowId);

    if (!escrow) {
      throw new NotFoundException('Escrow record not found');
    }

    if (escrow.status !== 'pending') {
      throw new BadRequestException('Only pending escrows can be disputed');
    }

    escrow.status = 'disputed';
    escrow.reason = reason;
    await escrow.save();

    // إنشاء إشعار للمستخدم
    await this.notificationService.addNotifications([{
      toUserId: escrow.creatorId.toString(),
      content: 'A dispute has been opened on your escrowed earnings',
      type: NotificationType.SESSION_REFUNDED,
      data: {
        roomId: escrow.roomId.toString(),
        amount: escrow.amount,
        reason
      }
    }]);
  }

  // جلب الأرباح المحجوزة للمستخدم
  async getCreatorEscrows(
    creatorId: string, 
    status?: string,
    startDate?: string,
    endDate?: string
  ): Promise<EarningsEscrowDocument[]> {
    const query: any = { 
      creatorId: new Types.ObjectId(creatorId),
      // استبعد سجلات المنصة - اظهر بس سجلات الـ creator
      $or: [
        { type: { $ne: 'platform' } },
        { type: { $exists: false } }
      ]
    };
    
    if (status) {
      query.status = status;
    }

    // إضافة فلتر التاريخ
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    return this.earningsEscrowModel.find(query)
      .populate('roomId', 'name')
      .populate('purchaseId', 'transactionId')
      .sort({ createdAt: -1 });
  }

  // جلب الأرباح المحجوزة للمستخدم مع pagination
  async getCreatorEscrowsWithPagination(
    creatorId: string, 
    status?: string,
    startDate?: string,
    endDate?: string,
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<{ data: EarningsEscrowDocument[], total: number, page: number, limit: number, totalPages: number }> {
    const skip = (page - 1) * limit;
    const query: any = { 
      creatorId: new Types.ObjectId(creatorId),
      // استبعد سجلات المنصة - اظهر بس سجلات الـ creator
      $or: [
        { type: { $ne: 'platform' } },
        { type: { $exists: false } }
      ]
    };
    
    if (status) {
      query.status = status;
    }

    // إضافة فلتر التاريخ
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    let data = await this.earningsEscrowModel.find(query)
      .populate('roomId', 'name')
      .populate('purchaseId', 'transactionId')
      .sort({ createdAt: -1 });

    // تطبيق البحث إذا كان موجود
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      data = data.filter(escrow => 
        escrow.roomId && 
        typeof escrow.roomId === 'object' && 
        'name' in escrow.roomId &&
        typeof escrow.roomId.name === 'string' &&
        escrow.roomId.name.toLowerCase().includes(searchTerm)
      );
    }

    const total = data.length;
    const paginatedData = data.slice(skip, skip + limit);

    // Transform data to include date field
    const transformedData = paginatedData.map(escrow => {
      const escrowObj = escrow.toObject() as any;
      return {
        ...escrowObj,
        date: escrowObj.createdAt,
        title: escrow.roomId && typeof escrow.roomId === 'object' && 'name' in escrow.roomId 
          ? escrow.roomId.name 
          : 'Unknown Session'
      };
    });

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // جلب ملخص الأرباح المحجوزة للمستخدم
  async getEscrowSummary(
    creatorId: string,
    startDate?: string,
    endDate?: string
  ): Promise<EarningsEscrowSummaryDto> {
    const escrows = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(creatorId),
          // استبعد سجلات المنصة - اظهر بس سجلات الـ creator
          $or: [
            { type: { $ne: 'platform' } },
            { type: { $exists: false } }
          ],
          // إضافة فلتر التاريخ
          ...(startDate || endDate ? {
            createdAt: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {})
            }
          } : {})
        } 
      },
      {
        $lookup: {
          from: 'livekitrooms', // اسم الكوليكشن للغرف
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomInfo'
        }
      },
      { $unwind: '$roomInfo' },
      {
        $project: {
          _id: 1,
          amount: 1,
          currency: 1,
          status: 1,
          releaseDate: 1,
          createdAt: 1,
          releasedAt: 1,
          reason: 1,
          roomName: '$roomInfo.name'
        }
      }
    ]);

    // حساب المجاميع
    const totalPendingAmount = escrows
      .filter(e => e.status === EscrowStatus.PENDING)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalReleasedAmount = escrows
      .filter(e => e.status === EscrowStatus.RELEASED)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalRefundedAmount = escrows
      .filter(e => e.status === EscrowStatus.REFUNDED)
      .reduce((sum, e) => sum + e.amount, 0);

    return plainToInstance(EarningsEscrowSummaryDto, {
      totalPendingAmount,
      totalReleasedAmount,
      totalRefundedAmount
    });
  }

  // التعامل مع المنازعات مع إمكانية الرفض أو القبول
  async resolveDispute(
    escrowId: string, 
    adminId: string, // معرف المسؤول الذي يحل النزاع
    decision: 'accept' | 'reject', 
    reason?: string
  ): Promise<void> {
    const escrow = await this.earningsEscrowModel.findById(escrowId);

    if (!escrow) {
      throw new NotFoundException('Escrow record not found');
    }

    if (escrow.status !== EscrowStatus.DISPUTED) {
      throw new BadRequestException('Only disputed escrows can be resolved');
    }

    if (decision === 'accept') {
      // قبول النزاع والاحتفاظ بالأموال للـ Creator
      escrow.status = EscrowStatus.RELEASED;
      escrow.releasedAt = new Date();
    } else {
      // رفض النزاع ورد الأموال للمشتري
      escrow.status = EscrowStatus.REFUNDED;
      escrow.refundedAt = new Date();

      // محاولة رد الأموال عبر Stripe
      const purchase = await this.meetingPurchaseModel.findById(escrow.purchaseId);
      if (purchase) {
        await this.paymentService.refundPurchase((purchase._id as Types.ObjectId).toString(), reason);
      }
    }

    escrow.reason = reason;
    await escrow.save();

    // إنشاء إشعار للـ Creator
    await this.notificationService.addNotifications([{
      toUserId: (escrow.creatorId as Types.ObjectId).toString(),
      content: decision === 'accept' 
        ? 'Dispute resolved in your favor' 
        : 'Dispute rejected and payment refunded to buyer',
      type: NotificationType.SESSION_DETAILS_CHANGED,
      data: {
        escrowId: (escrow._id as Types.ObjectId).toString(),
        roomId: (escrow.roomId as Types.ObjectId).toString(),
        amount: escrow.amount,
        decision,
        reason
      }
    }]);
  }

  // جلب ملخص الرصيد والأرباح للمستخدم
  async getStripeBalanceInfo(creatorId: string): Promise<{ available: number; pending: number; total: number }> {
    const user = await this.userModel.findById(creatorId);
    if (!user || !user.stripeConnectAccountId) {
      return { available: 0, pending: 0, total: 0 };
    }

    try {
      const balance = await this.stripeConnectService.getConnectedAccountBalance(user.stripeConnectAccountId);
      return {
        available: balance.available / 100, // Convert from cents to dollars
        pending: balance.pending / 100,
        total: (balance.available + balance.pending) / 100
      };
    } catch (error) {
      console.error('Error getting Stripe balance:', error);
      return { available: 0, pending: 0, total: 0 };
    }
  }

  async getBalanceSummary(
    creatorId: string,
    startDate?: string,
    endDate?: string
  ): Promise<BalanceSummaryDto> {
    const escrows = await this.earningsEscrowModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(creatorId),
          // استبعد سجلات المنصة - اظهر بس سجلات الـ creator
          $or: [
            { type: { $ne: 'platform' } },
            { type: { $exists: false } }
          ],
          // إضافة فلتر التاريخ
          ...(startDate || endDate ? {
            createdAt: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {})
            }
          } : {})
        } 
      },
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
        $project: {
          _id: 1,
          amount: 1,
          status: 1,
          releaseDate: 1,
          type: 1,
          roomName: '$roomInfo.name'
        }
      }
    ]);

    // حساب المجاميع - استبعد سجلات المنصة
    const pendingEarnings = escrows
      .filter(e => e.status === EscrowStatus.PENDING && e.type !== 'platform')
      .reduce((sum, e) => sum + e.amount, 0);

    const releasedEarnings = escrows
      .filter(e => e.status === EscrowStatus.RELEASED && e.type !== 'platform')
      .reduce((sum, e) => sum + e.amount, 0);

    const refundedAmount = escrows
      .filter(e => e.status === EscrowStatus.REFUNDED && e.type !== 'platform')
      .reduce((sum, e) => sum + e.amount, 0);

    // حساب المبلغ المسحوب من سجلات Withdrawal
    const withdrawals = await this.withdrawalModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(creatorId),
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

    // Debug log للتأكد من صحة الحساب
    console.log(`Balance calculation for creator ${creatorId}:`);
    console.log(`- Released earnings: $${releasedEarnings}`);
    console.log(`- Withdrawn amount: $${withdrawnAmount}`);
    console.log(`- Available balance: $${releasedEarnings - withdrawnAmount}`);

    // الأرباح الحديثة (آخر 5 أرباح) - استبعد سجلات المنصة
    const recentEarnings: EarningDetailDto[] = escrows
      .filter(e => e.status === EscrowStatus.RELEASED && e.type !== 'platform')
      .sort((a, b) => b.releaseDate - a.releaseDate)
      .slice(0, 5)
      .map(e => ({
        title: e.roomName,
        amount: e.amount,
        date: e.releaseDate
      }));

    return plainToInstance(BalanceSummaryDto, {
      availableBalance: releasedEarnings - withdrawnAmount, // الأرباح المحررة مطروح منها المسحوبة
      pendingEarnings,
      releasedEarnings,
      refundedAmount,
      recentEarnings
    });
  }

  // دالة لسحب الأرباح المتاحة
  async withdrawEarnings(
    creatorId: string, 
    amount: number
  ): Promise<void> {
    // First, fix any missing fields in escrow records
    await this.fixMissingFields(creatorId);
    
    const balanceSummary = await this.getBalanceSummary(creatorId);

    if (amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than zero');
    }

    if (amount > balanceSummary.availableBalance) {
      throw new BadRequestException('Insufficient available balance for withdrawal');
    }

    const user = await this.userModel.findById(creatorId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.stripeConnectAccountId) {
      throw new BadRequestException('Stripe account not linked. Please connect your account to withdraw earnings.');
    }

    // Check if the Stripe account is fully enabled for payouts
    const accountStatus = await this.stripeConnectService.getAccountStatus(creatorId);
    if (!accountStatus.isConnected || !accountStatus.payoutsEnabled) {
      throw new BadRequestException('Stripe account is not fully set up. Please complete your account setup.');
    }

    // Check the actual balance in the connected account
    const balance = await this.stripeConnectService.getConnectedAccountBalance(user.stripeConnectAccountId);
    const totalBalance = balance.available + balance.pending;
    
    if (totalBalance < amount * 100) {
      const availableAmount = balance.available / 100;
      const pendingAmount = balance.pending / 100;
      const totalAmount = totalBalance / 100;
      throw new BadRequestException(
        `Insufficient total balance. Available: $${availableAmount.toFixed(2)}, Pending: $${pendingAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}. ` +
        `Requested: $${amount.toFixed(2)}.`
      );
    }

    // If available balance is insufficient but total balance is sufficient, 
    // we'll try to use instant payout (for test mode) or show appropriate message
    if (balance.available < amount * 100) {
      const availableAmount = balance.available / 100;
      const pendingAmount = balance.pending / 100;
      console.log(`Attempting instant payout. Available: $${availableAmount}, Pending: $${pendingAmount}, Requested: $${amount}`);
    }

    let withdrawalRecord: any = null;
    
    try {
      // Create withdrawal record first
      withdrawalRecord = await this.withdrawalModel.create({
        creatorId: new Types.ObjectId(creatorId),
        amount: amount,
        currency: 'USD',
        status: 'processing',
        title: `Withdrawal of $${amount}`,
        processedAt: new Date()
      });

      // Perform Stripe Payout (from connected account to their bank account)
      // Note: Stripe requires amount in cents
      const payout = await this.stripeConnectService.createPayout(
        user.stripeConnectAccountId,
        amount * 100, // Convert to cents
        'USD',
        `Withdrawal for creator ${creatorId}`
      );
      
      console.log(`Payout created successfully: ${payout.id} for amount $${amount}`);

      // Update withdrawal record with Stripe payout information
      await this.withdrawalModel.updateOne(
        { _id: withdrawalRecord._id },
        {
          $set: {
            stripePayoutId: payout.id,
            status: 'completed',
            completedAt: new Date(),
            netAmount: amount, // Assuming no additional fees for now
            stripeFees: 0 // Can be updated if Stripe charges fees
          }
        }
      );

      this.notificationService.addNotifications([{
        toUserId: creatorId,
        content: `Successfully withdrawn $${amount} from your earnings`,
        type: NotificationType.WITHDRAWAL_SUCCESS,
        data: {
          amount,
          currency: 'USD',
          withdrawalType: 'manual',
          withdrawalDate: new Date().toISOString(),
          withdrawalId: (withdrawalRecord._id as Types.ObjectId).toString(),
          stripePayoutId: payout.id
        }
      }]);
      console.log(`Creator ${creatorId} successfully withdrew $${amount}. Withdrawal ID: ${withdrawalRecord._id}, Stripe Payout ID: ${payout.id}`);

    } catch (error) {
      // Update withdrawal record to failed status if it was created
      if (withdrawalRecord) {
        await this.withdrawalModel.updateOne(
          { _id: withdrawalRecord._id },
          {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              failureReason: error.message
            }
          }
        );
      }

      this.notificationService.addNotifications([{
        toUserId: creatorId,
        content: `Failed to withdraw $${amount} from your earnings. Please try again.`,
        type: NotificationType.WITHDRAWAL_FAILURE,
        data: {
          amount,
          currency: 'USD',
          withdrawalType: 'manual',
          withdrawalDate: new Date().toISOString(),
          errorMessage: error.message
        }
      }]);
      console.error(`Failed to withdraw earnings for creator ${creatorId}:`, error);
      throw new BadRequestException(`Withdrawal failed: ${error.message}`);
    }
  }

  // جلب سجل السحوبات للمستخدم
  async getWithdrawals(
    creatorId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
    search?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ data: any[], total: number, page: number, limit: number, totalPages: number }> {
    const skip = (page - 1) * limit;
    const query: any = {
      creatorId: new Types.ObjectId(creatorId)
    };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { 'title': { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const data = await this.withdrawalModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await this.withdrawalModel.countDocuments(query);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // ملاحظة: تم استبدال هذه الدالة بـ Transfer Reversal في payment.service.ts
  // دالة recoverFundsFromCreator القديمة لم تعد مطلوبة

  // جلب ملخص السحوبات للمستخدم
  async getWithdrawalSummary(creatorId: string): Promise<any> {
    const summary = await this.withdrawalModel.aggregate([
      { 
        $match: { 
          creatorId: new Types.ObjectId(creatorId)
        } 
      },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      totalWithdrawn: 0,
      totalPending: 0,
      totalFailed: 0,
      totalCount: 0,
      totalStripeFees: 0
    };

    summary.forEach(item => {
      result.totalCount += item.count;
      if (item._id === 'completed') {
        result.totalWithdrawn += item.totalAmount;
      } else if (item._id === 'pending' || item._id === 'processing') {
        result.totalPending += item.totalAmount;
      } else if (item._id === 'failed') {
        result.totalFailed += item.totalAmount;
      }
    });

    return result;
  }

  // Method to reset old withdrawn escrows back to released (for migration to new system)
  async resetOldWithdrawnEscrows(creatorId?: string): Promise<{ message: string; resetCount: number }> {
    const query: any = {
      status: EscrowStatus.WITHDRAWN
    };
    if (creatorId) {
      query.creatorId = new Types.ObjectId(creatorId);
    }

    // Find all escrows that were marked as withdrawn (old system)
    const oldWithdrawnEscrows = await this.earningsEscrowModel.find(query);

    let resetCount = 0;
    for (const escrow of oldWithdrawnEscrows) {
      // Reset to released status and remove withdrawnAt
      await this.earningsEscrowModel.updateOne(
        { _id: escrow._id },
        {
          $set: { 
            status: EscrowStatus.RELEASED,
          },
          $unset: {
            withdrawnAt: 1
          }
        }
      );
      resetCount++;
    }

    return { 
      message: `Reset ${resetCount} old withdrawn escrows back to released status.`, 
      resetCount 
    };
  }

  // Method to fix existing escrow records that might be missing required fields
  async fixMissingFields(creatorId?: string): Promise<{ message: string; fixedCount: number }> {
    const query: any = {};
    if (creatorId) {
      query.creatorId = new Types.ObjectId(creatorId);
    }

    // Find escrows missing required fields
    const escrowsToFix = await this.earningsEscrowModel.find({
      ...query,
      $or: [
        { grossAmount: { $exists: false } },
        { feeAtTransactionTime: { $exists: false } },
        { type: { $exists: false } }
      ]
    });

    let fixedCount = 0;
    for (const escrow of escrowsToFix) {
      const updateData: any = {};
      
      if (!escrow.grossAmount) {
        updateData.grossAmount = escrow.amount; // Default to amount if grossAmount is missing
      }
      
      if (escrow.feeAtTransactionTime === undefined || escrow.feeAtTransactionTime === null) {
        updateData.feeAtTransactionTime = 0; // Default to 0 if missing
      }
      
      if (!escrow.type) {
        updateData.type = 'creator'; // Default to creator if missing
      }

      if (Object.keys(updateData).length > 0) {
        await this.earningsEscrowModel.updateOne(
          { _id: escrow._id },
          { $set: updateData }
        );
        fixedCount++;
      }
    }

    return { 
      message: `Fixed ${fixedCount} escrow records with missing required fields.`, 
      fixedCount 
    };
  }

  // Method to fix negative balances by resetting incorrectly marked withdrawn escrows
  async fixNegativeBalance(creatorId: string): Promise<{ message: string; fixedAmount: number }> {
    const balanceSummary = await this.getBalanceSummary(creatorId);
    
    if (balanceSummary.availableBalance >= 0) {
      return { message: 'No negative balance found', fixedAmount: 0 };
    }

    const negativeAmount = Math.abs(balanceSummary.availableBalance);
    
    // Find withdrawn escrows that can be reset to released
    const withdrawnEscrows = await this.earningsEscrowModel.find({
      creatorId: new Types.ObjectId(creatorId),
      status: EscrowStatus.WITHDRAWN,
    }).sort({ withdrawnAt: -1 }); // Sort by withdrawal date, most recent first

    let remainingToFix = negativeAmount;
    const escrowsToReset: Types.ObjectId[] = [];

    for (const escrow of withdrawnEscrows) {
      if (remainingToFix <= 0) break;
      
      escrowsToReset.push(escrow._id as Types.ObjectId);
      remainingToFix -= escrow.amount;
    }

    // Reset the selected escrows back to released status
    const resetResult = await this.earningsEscrowModel.updateMany(
      {
        _id: { $in: escrowsToReset },
        creatorId: new Types.ObjectId(creatorId),
        status: EscrowStatus.WITHDRAWN,
      },
      { 
        $set: { 
          status: EscrowStatus.RELEASED,
        },
        $unset: {
          withdrawnAt: 1
        }
      }
    );

    const fixedAmount = negativeAmount - remainingToFix;

    // Notify the user about the fix
    await this.notificationService.addNotifications([{
      toUserId: creatorId,
      content: `Your account balance has been corrected. $${fixedAmount.toFixed(2)} has been restored to your available balance.`,
      type: NotificationType.GENERAL_NOTIFICATION,
      data: {
        fixedAmount,
        reason: 'negative_balance_correction',
        correctedAt: new Date().toISOString()
      }
    }]);

    return { 
      message: `Fixed negative balance. Restored $${fixedAmount.toFixed(2)} to available balance.`, 
      fixedAmount 
    };
  }

  async adminBypassEscrow(escrowId: string, adminId: string): Promise<EarningsEscrowDocument> {
    const escrow = await this.earningsEscrowModel.findById(escrowId);

    if (!escrow) {
      throw new NotFoundException(`Escrow record with ID "${escrowId}" not found.`);
    }

    if (escrow.status !== EscrowStatus.PENDING) {
      throw new BadRequestException(`Escrow record with ID "${escrowId}" is not pending. Current status: ${escrow.status}.`);
    }

    escrow.status = EscrowStatus.RELEASED;
    escrow.releasedAt = new Date();
    await escrow.save();

    // Notify the creator that their earnings have been released by an admin
    await this.notificationService.addNotifications([{
      toUserId: (escrow.creatorId as Types.ObjectId).toString(),
      content: `Your earnings of $${escrow.amount} for session "${(escrow.roomId as Types.ObjectId).toString()}" have been manually released by an admin.`,
      type: NotificationType.GENERAL_NOTIFICATION, // Or a more specific type if available
      data: {
        escrowId: (escrow._id as Types.ObjectId).toString(),
        roomId: (escrow.roomId as Types.ObjectId).toString(),
        amount: escrow.amount,
        currency: escrow.currency,
        adminId: adminId,
        releaseType: 'admin_bypass'
      }
    }]);

    return escrow;
  }
}
