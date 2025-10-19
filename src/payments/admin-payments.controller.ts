import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  UseGuards,
  Query,
  Param
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from 'src/users/shemas/user.schema';
import { PaymentService } from './payment.service';
import { EarningsEscrowService } from './earnings-escrow.service';
import { StripeConnectService } from './stripe-connect.service';
import { AdminPlatformWithdrawDto } from './dto/admin-withdraw.dto';

@ApiTags('Admin - Payments & Earnings')
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminPaymentsController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly earningsEscrowService: EarningsEscrowService,
    private readonly stripeConnectService: StripeConnectService,
  ) {}

  @Post('platform-withdraw')
  @ApiOperation({ summary: 'Withdraw platform funds to platform bank account' })
  @ApiResponse({ status: 200, description: 'Platform withdrawal processed successfully' })
  async platformWithdraw(
    @Body() body: AdminPlatformWithdrawDto,
    @GetUser('sub') adminId: string,
  ) {
    return this.paymentService.processPlatformWithdrawal(body.amount, body.reason || '', adminId);
  }

  @Get('platform-earnings')
  @ApiOperation({ summary: 'Get platform earnings summary' })
  @ApiResponse({ status: 200, description: 'Platform earnings retrieved successfully' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  async getPlatformEarnings(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getPlatformEarningsSummary(startDate, endDate);
  }

  @Get('platform-withdrawals')
  @ApiOperation({ summary: 'Get platform withdrawal history' })
  @ApiResponse({ status: 200, description: 'Platform withdrawals retrieved successfully' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', required: false, description: 'Withdrawal status filter' })
  async getPlatformWithdrawals(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ) {
    return this.paymentService.getPlatformWithdrawals(startDate, endDate, status);
  }

  @Get('transaction-analytics')
  @ApiOperation({ summary: 'Get transaction analytics for platform' })
  @ApiResponse({ status: 200, description: 'Transaction analytics retrieved successfully' })
  @ApiQuery({ name: 'period', required: false, description: 'Analytics period (daily, weekly, monthly)' })
  async getTransactionAnalytics(
    @Query('period') period: string = 'monthly',
  ) {
    return this.paymentService.getTransactionAnalytics(period);
  }

  @Get('creator-earnings/:creatorId')
  @ApiOperation({ summary: 'Get specific creator earnings details' })
  @ApiResponse({ status: 200, description: 'Creator earnings retrieved successfully' })
  async getCreatorEarnings(
    @Param('creatorId') creatorId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getCreatorEarningsDetails(creatorId, startDate, endDate);
  }

  @Get('stripe-fees-summary')
  @ApiOperation({ summary: 'Get Stripe fees summary for platform' })
  @ApiResponse({ status: 200, description: 'Stripe fees summary retrieved successfully' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  async getStripeFeesSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getStripeFeesSummary(startDate, endDate);
  }

  @Get('platform-balance')
  @ApiOperation({ summary: 'Get platform current balance' })
  @ApiResponse({ status: 200, description: 'Platform balance retrieved successfully' })
  async getPlatformBalance() {
    return this.paymentService.getPlatformBalance();
  }

  @Post('manual-payout/:creatorId')
  @ApiOperation({ summary: 'Manually process payout for creator' })
  @ApiResponse({ status: 200, description: 'Manual payout processed successfully' })
  async processManualPayout(
    @Param('creatorId') creatorId: string,
    @Body() payoutData: { amount: number; reason?: string },
    @GetUser('sub') adminId: string,
  ) {
    return this.paymentService.processManualPayout(creatorId, payoutData.amount, payoutData.reason || '', adminId);
  }

  @Get('disputed-transactions')
  @ApiOperation({ summary: 'Get all disputed transactions' })
  @ApiResponse({ status: 200, description: 'Disputed transactions retrieved successfully' })
  async getDisputedTransactions() {
    return this.paymentService.getDisputedTransactions();
  }

  @Post('resolve-dispute/:transactionId')
  @ApiOperation({ summary: 'Resolve a disputed transaction' })
  @ApiResponse({ status: 200, description: 'Dispute resolved successfully' })
  async resolveDispute(
    @Param('transactionId') transactionId: string,
    @Body() resolution: { decision: 'approve' | 'reject'; reason: string },
    @GetUser('sub') adminId: string,
  ) {
    return this.paymentService.resolveDispute(transactionId, resolution.decision, resolution.reason, adminId);
  }
}
