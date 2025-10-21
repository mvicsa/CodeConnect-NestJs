import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/users/shemas/user.schema';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { StripeAccountStatusDto } from './dto/stripe-account-status.dto';

@Injectable()
export class StripeConnectService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService, // Inject NotificationService
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables.');
    }
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-09-30.clover',
    });
  }

  async createOnboardingLink(userId: string): Promise<{ url: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    let accountId = user.stripeConnectAccountId;

    if (!accountId) {
      // Create a new Stripe Connect account for the user
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { userId: userId },
      });
      accountId = account.id;

      // Save the account ID to the user
      user.stripeConnectAccountId = accountId;
      await user.save();
    }

    // Create an account link for onboarding
    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${this.configService.get<string>('FRONTEND_URL')}/settings?stripe_onboard=refresh`,
      return_url: `${this.configService.get<string>('BACKEND_URL')}/stripe-connect/onboard-return?state=` + userId, // state will contain userId
      type: 'account_onboarding',
    });

    return { url: accountLink.url };
  }

  async handleOnboardingReturn(state: string, scope: string, code: string): Promise<void> {
    // state contains userId
    const userId = state;
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }

    if (!user.stripeConnectAccountId) {
      // Send failure notification
      await this.notificationService.addNotifications([{
        toUserId: userId,
        fromUserId: undefined, // Platform initiated, no specific user
        content: 'Failed to connect your Stripe account. Please try again.',
        type: NotificationType.STRIPE_CONNECT_FAILURE,
        data: { userId: userId }
      }]);
      throw new BadRequestException('Stripe Connect account not found for user.');
    }
    const account = await this.stripe.accounts.retrieve(user.stripeConnectAccountId);
    if (account.charges_enabled && account.payouts_enabled) {
      console.log('Stripe Connect account already enabled for user:', userId);
      // Send success notification if not already sent
      await this.notificationService.addNotifications([{
        toUserId: userId,
        fromUserId: undefined, // Platform initiated, no specific user
        content: 'Your Stripe account has been successfully connected!',
        type: NotificationType.STRIPE_CONNECT_SUCCESS,
        data: { userId: userId, accountId: user.stripeConnectAccountId }
      }]);
      return; // Already onboarded
    }

    // If we reach here, it means the user returned but the account is not yet fully enabled.
    // Stripe webhooks should handle the final status update. For now, assume a potential failure or pending state.
    // We can send a generic pending/failure notification here if needed, but a success notification should be triggered by webhook.
    console.log('Stripe Connect onboarding return handled for user:', userId);
    // Consider adding a notification here for pending status if needed, or let webhooks confirm
    await this.notificationService.addNotifications([{
      toUserId: userId,
      fromUserId: undefined, // Platform initiated, no specific user
      content: 'Your Stripe account connection is pending. We will notify you once it\'s fully active. Please check back or try again later.',
      type: NotificationType.STRIPE_CONNECT_PENDING,
      data: { userId: userId }
    }]);
  }

  async getAccountStatus(userId: string): Promise<StripeAccountStatusDto> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const response: StripeAccountStatusDto = {
      isConnected: false, // Default to false, will be true only if fully enabled
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    };

    if (!user.stripeConnectAccountId) {
      response.message = 'Stripe account not connected. Please connect your account to enable paid sessions.';
      // Generate an onboarding link if not connected
      try {
        const onboardingLink = await this.createOnboardingLink(userId);
        response.onboardingLink = onboardingLink.url;
      } catch (linkError) {
        console.error('Error generating initial onboarding link:', linkError);
        response.message = 'Error generating onboarding link. Please try again later.';
      }
      return response;
    }

    try {
      const account = await this.stripe.accounts.retrieve(user.stripeConnectAccountId);
      response.chargesEnabled = account.charges_enabled;
      response.payoutsEnabled = account.payouts_enabled;
      response.detailsSubmitted = account.details_submitted;

      if (account.charges_enabled && account.payouts_enabled && account.details_submitted) {
        response.isConnected = true; // Set isConnected to true only when fully enabled
        response.message = 'Your Stripe account is fully connected and enabled for payments and payouts.';
      } else if (!account.details_submitted) {
        response.message = 'Please complete your Stripe account setup to enable payments and payouts.';
        const accountLink = await this.stripe.accountLinks.create({
          account: user.stripeConnectAccountId,
          refresh_url: 'http://localhost:3000/settings?stripe_onboard=refresh',
          return_url: 'http://localhost:3000/settings?stripe_onboard=success', // Consider a more specific return URL for settings update
          type: 'account_update',
        });
        response.settingsLink = accountLink.url;
      } else if (!account.charges_enabled || !account.payouts_enabled) {
        response.message = 'Your Stripe account is connected but not fully enabled. Please check your Stripe dashboard.';
        // Optionally, provide a link to the Stripe dashboard for the user to check
        const accountLink = await this.stripe.accountLinks.create({
          account: user.stripeConnectAccountId,
          refresh_url: 'http://localhost:3000/settings?stripe_onboard=refresh',
          return_url: 'http://localhost:3000/settings?stripe_onboard=success', // Consider a more specific return URL for settings update
          type: 'account_update',
        });
        response.settingsLink = accountLink.url;
      }
    } catch (error) {
      console.error('Error retrieving Stripe account status:', error);
      response.isConnected = false; // Explicitly set to false on error
      response.message = 'Your account is not connected to Stripe. To enable earning and receiving payouts, please connect your Stripe account now.';
      // If there's an error, try to offer a re-onboarding link
      if (user.stripeConnectAccountId) {
        try {
          const accountLink = await this.stripe.accountLinks.create({
            account: user.stripeConnectAccountId,
            refresh_url: 'http://localhost:3000/settings?stripe_onboard=refresh',
            return_url: 'http://localhost:5000/stripe-connect/onboard-return?state=' + userId,
            type: 'account_onboarding',
          });
          response.onboardingLink = accountLink.url;
        } catch (linkError) {
          console.error('Error generating re-onboarding link:', linkError);
        }
      }
    }
    return response;
  }

  async getConnectedAccountBalance(accountId: string): Promise<{ available: number; pending: number }> {
    try {
      const balance = await this.stripe.balance.retrieve({ stripeAccount: accountId });
      const usdBalance = balance.available.find(b => b.currency === 'usd');
      const pendingBalance = balance.pending.find(b => b.currency === 'usd');
      
      return {
        available: usdBalance?.amount || 0,
        pending: pendingBalance?.amount || 0
      };
    } catch (error) {
      console.error('Error retrieving connected account balance:', error);
      throw new HttpException(
        'Failed to retrieve account balance',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createPayout(accountId: string, amount: number, currency: string, description: string): Promise<Stripe.Payout> {
    try {
      // First, verify the connected account exists and is properly configured
      const account = await this.stripe.accounts.retrieve(accountId);
      
      if (!account.charges_enabled || !account.payouts_enabled) {
        throw new HttpException(
          'Connected account is not fully enabled for payouts. Please complete your Stripe account setup.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if the connected account has sufficient balance (including pending)
      const balance = await this.stripe.balance.retrieve({ stripeAccount: accountId });
      const availableBalance = balance.available.find(b => b.currency === currency.toLowerCase());
      const pendingBalance = balance.pending.find(b => b.currency === currency.toLowerCase());
      
      const totalBalance = (availableBalance?.amount || 0) + (pendingBalance?.amount || 0);
      
      if (totalBalance < amount) {
        throw new HttpException(
          `Insufficient total balance in your connected account. Available: $${(availableBalance?.amount || 0) / 100}, Pending: $${(pendingBalance?.amount || 0) / 100}, Total: $${totalBalance / 100}, Requested: $${amount / 100}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // For Stripe Connect, create a payout FROM the connected account TO their bank account
      // This is executed on behalf of the connected account
      const payout = await this.stripe.payouts.create(
        {
          amount,
          currency,
          description: description.substring(0, 22), // max 22 characters
          method: 'standard', // Use standard payouts (2-7 days) since instant requires available balance
          metadata: {
            type: 'earnings_withdrawal',
            description: description
          }
        },
        { stripeAccount: accountId } // Execute on behalf of the connected account
      );
      return payout;
    } catch (error) {
      console.error('Stripe Payout Error:', error);
      
      // Provide more specific error messages based on Stripe error codes
      if (error.code === 'account_invalid') {
        throw new HttpException(
          'Invalid Stripe account. Please reconnect your account.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'insufficient_funds') {
        throw new HttpException(
          'Insufficient funds in your account. Please check your available balance.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'no_external_account') {
        throw new HttpException(
          'No bank account connected. Please add a bank account to receive payouts.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'payout_not_allowed') {
        throw new HttpException(
          'Payouts are not allowed at this time. Please check your account settings.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'instant_payouts_unsupported') {
        throw new HttpException(
          'Instant payouts are not supported. Your request will be processed within 2-7 business days.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.message && error.message.includes('insufficient funds')) {
        throw new HttpException(
          'Insufficient funds in your account. Please check your available balance.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.message && error.message.includes('card balance is too low')) {
        throw new HttpException(
          'Insufficient funds in your account. Please check your available balance.',
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // Generic error message for unknown errors
      throw new HttpException(
        'An error occurred while processing your withdrawal request. Please try again later.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // عكس التحويل الأصلي من حساب الـ creator في حالة الـ refund
  // عكس التحويل الأصلي من حساب الـ creator في حالة الـ refund
  async createTransferReversal(
    originalTransferId: string, 
    amount: number, 
    description: string
  ): Promise<Stripe.TransferReversal> {
    try {
      console.log(`🔍 Creating transfer reversal:`);
      console.log(`Transfer ID: ${originalTransferId}`);
      console.log(`Amount: ${amount} cents ($${amount / 100})`);

      // محاولة استرجاع تفاصيل التحويل للتأكد من وجوده
      const transfer = await this.stripe.transfers.retrieve(originalTransferId);
      console.log('✅ Transfer details retrieved:', {
        id: transfer.id,
        amount: transfer.amount,
        destination: transfer.destination,
        reversible: transfer.reversals?.data?.length || 0
      });

      // التحقق من إمكانية عمل reversal
      if (amount > transfer.amount) {
        throw new HttpException(
          `Reversal amount ($${amount / 100}) exceeds original transfer amount ($${transfer.amount / 100})`,
          HttpStatus.BAD_REQUEST
        );
      }

      console.log(`🔄 Creating transfer reversal...`);

      // إنشاء الـ reversal من الـ Platform Account (بدون stripeAccount)
      const reversal = await this.stripe.transfers.createReversal(
        originalTransferId,
        {
          amount: amount,
          description: description.substring(0, 140), // Stripe limit
          metadata: {
            type: 'refund_reversal',
            description: description
          }
        }
        // ❌ إزالة stripeAccount تماماً - الـ reversal بيحصل من الـ platform
      );

      console.log(`✅ Transfer reversal created successfully: ${reversal.id} for $${amount / 100}`);
      return reversal;

    } catch (error) {
      console.error('❌ Stripe Transfer Reversal Error:', {
        originalTransferId,
        amount,
        errorCode: error.code,
        errorMessage: error.message,
        errorType: error.type
      });

      // معالجة أنواع مختلفة من الأخطاء
      if (error.code === 'transfer_already_reversed') {
        throw new HttpException(
          'This transfer has already been fully reversed.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'amount_too_large') {
        throw new HttpException(
          'Reversal amount exceeds the remaining reversible amount.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'resource_missing') {
        throw new HttpException(
          'Transfer not found. It may have been deleted or the ID is incorrect.',
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.code === 'invalid_request_error') {
        throw new HttpException(
          `Invalid reversal request: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // رسالة خطأ عامة
      throw new HttpException(
        `Transfer reversal failed: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
