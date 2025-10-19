import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  Body, 
  UseGuards,
  SetMetadata,
  ExecutionContext,
  CanActivate,
  Query
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery
} from '@nestjs/swagger';
import { EarningsEscrowService } from './earnings-escrow.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  EarningsEscrowSummaryDto,
  EarningsEscrowDto
} from './dto/earnings-escrow.dto';
import { Reflector } from '@nestjs/core';
import { WithdrawalRequestDto } from './dto/withdrawal-request.dto'; // Import WithdrawalRequestDto
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EarningsEscrow } from './schemas/earnings-escrow.schema';

// Custom Roles Decorator
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// Custom Roles Guard
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user?.role === role);
  }
}

@ApiTags('Earnings Escrow')
@Controller('earnings-escrow')
@UseGuards(JwtAuthGuard)
export class EarningsEscrowController {
  constructor(
    private readonly earningsEscrowService: EarningsEscrowService,
    @InjectModel(EarningsEscrow.name)
    private readonly earningsEscrowModel: Model<EarningsEscrow>,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get earnings escrow summary for the current user' })
  @ApiQuery({ 
    name: 'startDate', 
    required: false, 
    description: 'Start date filter (YYYY-MM-DD format)',
    type: String
  })
  @ApiQuery({ 
    name: 'endDate', 
    required: false, 
    description: 'End date filter (YYYY-MM-DD format)',
    type: String
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Earnings escrow summary retrieved successfully', 
    type: EarningsEscrowSummaryDto 
  })
  @ApiBearerAuth()
  async getEscrowSummary(
    @GetUser('sub') creatorId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<EarningsEscrowSummaryDto> {
    return this.earningsEscrowService.getEscrowSummary(creatorId, startDate, endDate);
  }

  @Post('dispute/:escrowId/resolve')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Resolve an earnings escrow dispute' })
  @ApiResponse({ 
    status: 200, 
    description: 'Dispute resolved successfully' 
  })
  @ApiBearerAuth()
  async resolveDispute(
    @Param('escrowId') escrowId: string,
    @GetUser('sub') adminId: string,
    @Body('decision') decision: 'accept' | 'reject',
    @Body('reason') reason?: string
  ): Promise<void> {
    return this.earningsEscrowService.resolveDispute(
      escrowId, 
      adminId, 
      decision, 
      reason
    );
  }

  @Get('stripe-balance')
  @ApiOperation({ summary: 'Get Stripe account balance information' })
  @ApiResponse({ 
    status: 200, 
    description: 'Stripe balance information retrieved successfully' 
  })
  @ApiBearerAuth()
  async getStripeBalance(
    @GetUser('sub') creatorId: string
  ): Promise<{ available: number; pending: number; total: number }> {
    return this.earningsEscrowService.getStripeBalanceInfo(creatorId);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Request to withdraw available earnings' })
  @ApiResponse({ 
    status: 200, 
    description: 'Withdrawal request submitted successfully' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Bad Request - Insufficient balance or Stripe not linked' 
  })
  @ApiBearerAuth()
  async withdrawEarnings(
    @GetUser('sub') creatorId: string,
    @Body() withdrawalRequest: WithdrawalRequestDto
  ): Promise<{ message: string }> {
    await this.earningsEscrowService.withdrawEarnings(
      creatorId,
      withdrawalRequest.amount
    );
    return { message: 'Withdrawal request submitted successfully. You will be notified of the status.' };
  }

  @Post('fix-negative-balance')
  @ApiOperation({ summary: 'Fix negative balance by resetting incorrectly marked withdrawn escrows' })
  @ApiResponse({ 
    status: 200, 
    description: 'Negative balance fixed successfully' 
  })
  @ApiResponse({ 
    status: 400, 
    description: 'No negative balance found' 
  })
  @ApiBearerAuth()
  async fixNegativeBalance(
    @GetUser('sub') creatorId: string,
  ): Promise<{ message: string; fixedAmount: number }> {
    return this.earningsEscrowService.fixNegativeBalance(creatorId);
  }

  @Post('fix-missing-fields')
  @ApiOperation({ summary: 'Fix escrow records that are missing required fields' })
  @ApiResponse({ 
    status: 200, 
    description: 'Missing fields fixed successfully' 
  })
  @ApiBearerAuth()
  async fixMissingFields(
    @GetUser('sub') creatorId: string,
  ): Promise<{ message: string; fixedCount: number }> {
    return this.earningsEscrowService.fixMissingFields(creatorId);
  }

  @Post('reset-old-withdrawn-escrows')
  @ApiOperation({ summary: 'Reset old withdrawn escrows back to released status (for migration to new withdrawal system)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Old withdrawn escrows reset successfully' 
  })
  @ApiBearerAuth()
  async resetOldWithdrawnEscrows(
    @GetUser('sub') creatorId: string,
  ): Promise<{ message: string; resetCount: number }> {
    return this.earningsEscrowService.resetOldWithdrawnEscrows(creatorId);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Get user withdrawal history' })
  @ApiResponse({
    status: 200,
    description: 'Withdrawal history retrieved successfully'
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Withdrawal status filter', enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, description: 'Search term for withdrawal history', type: String })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter (YYYY-MM-DD format)', type: String })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter (YYYY-MM-DD format)', type: String })
  @ApiBearerAuth()
  async getWithdrawals(
    @GetUser('sub') creatorId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<{ data: any[], total: number, page: number, limit: number, totalPages: number }> {
    return this.earningsEscrowService.getWithdrawals(creatorId, page, limit, status, search, startDate, endDate);
  }

  @Get('withdrawal-summary')
  @ApiOperation({ summary: 'Get user withdrawal summary' })
  @ApiResponse({ 
    status: 200, 
    description: 'Withdrawal summary retrieved successfully' 
  })
  @ApiBearerAuth()
  async getWithdrawalSummary(
    @GetUser('sub') creatorId: string,
  ): Promise<any> {
    return this.earningsEscrowService.getWithdrawalSummary(creatorId);
  }

  @Post('admin/bypass-escrow/:escrowId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin bypass escrow period and release earnings immediately' })
  @ApiResponse({
    status: 200,
    description: 'Escrow earnings released successfully by admin'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Escrow not pending or not found'
  })
  @ApiBearerAuth()
  async adminBypassEscrow(
    @Param('escrowId') escrowId: string,
    @GetUser('sub') adminId: string,
  ): Promise<{ message: string }> {
    await this.earningsEscrowService.adminBypassEscrow(escrowId, adminId);
    return { message: 'Escrow earnings released successfully by admin.' };
  }

  @Post('admin/release-matured-escrows')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin manually trigger release of all matured escrows' })
  @ApiResponse({
    status: 200,
    description: 'Matured escrows released successfully'
  })
  @ApiBearerAuth()
  async releaseMaturedEscrows(
    @GetUser('sub') adminId: string,
  ): Promise<{ message: string }> {
    await this.earningsEscrowService.releaseMaturedEscrows();
    return { message: 'Matured escrows released successfully.' };
  }

  @Get('admin/test-cron-job')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Test cron job manually for debugging' })
  @ApiResponse({
    status: 200,
    description: 'Cron job test results'
  })
  @ApiBearerAuth()
  async testCronJob(
    @GetUser('sub') adminId: string,
  ): Promise<{ message: string; results: any }> {
    const now = new Date();
    const maturedEscrows = await this.earningsEscrowModel.find({
      status: 'pending',
      releaseDate: { $lte: now }
    });

    return {
      message: 'Cron job test completed',
      results: {
        currentTime: now,
        maturedEscrowsCount: maturedEscrows.length,
        maturedEscrows: maturedEscrows.map(e => ({
          id: e._id,
          amount: e.amount,
          releaseDate: e.releaseDate,
          purchaseId: e.purchaseId,
          creatorId: e.creatorId
        }))
      }
    };
  }
}
