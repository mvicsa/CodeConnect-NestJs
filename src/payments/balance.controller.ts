import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  UseGuards,
  Query,
  Res
} from '@nestjs/common';
import { Response } from 'express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiQuery 
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { EarningsEscrowService } from './earnings-escrow.service';
import { WithdrawalRequestDto } from './dto/withdrawal-request.dto';
import { 
  BalanceSummaryDto 
} from './dto/balance.dto';
import { 
  EarningsEscrowSummaryDto 
} from './dto/earnings-escrow.dto';

@ApiTags('Balance')
@Controller('balance')
@UseGuards(JwtAuthGuard)
export class BalanceController {
  constructor(
    private readonly earningsEscrowService: EarningsEscrowService
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get balance and earnings summary' })
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
    description: 'Balance summary retrieved successfully', 
    type: BalanceSummaryDto 
  })
  @ApiBearerAuth()
  async getBalanceSummary(
    @GetUser('sub') creatorId: string,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.earningsEscrowService.getBalanceSummary(creatorId, startDate, endDate);
    res.json(data);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw available earnings' })
  @ApiResponse({ 
    status: 200, 
    description: 'Earnings withdrawn successfully' 
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
    await this.earningsEscrowService.withdrawEarnings(creatorId, withdrawalRequest.amount);
    return { message: 'Withdrawal request submitted successfully. You will be notified of the status.' };
  }

  @Get('escrow-summary')
  @ApiOperation({ summary: 'Get detailed escrow summary' })
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
    description: 'Escrow summary retrieved successfully', 
    type: EarningsEscrowSummaryDto 
  })
  @ApiBearerAuth()
  async getEscrowSummary(
    @GetUser('sub') creatorId: string,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.earningsEscrowService.getEscrowSummary(creatorId, startDate, endDate);
    res.json(data);
  }

  @Get('escrows')
  @ApiOperation({ summary: 'Get all escrow records for user' })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    description: 'Filter by escrow status (pending, released, refunded, withdrawn)',
    enum: ['pending', 'released', 'refunded', 'withdrawn']
  })
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
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number (default: 1)',
    type: Number
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Items per page (default: 10)',
    type: Number
  })
  @ApiQuery({ 
    name: 'search', 
    required: false, 
    description: 'Search in session titles',
    type: String
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Escrow records retrieved successfully' 
  })
  @ApiBearerAuth()
  async getCreatorEscrows(
    @GetUser('sub') creatorId: string,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.earningsEscrowService.getCreatorEscrowsWithPagination(creatorId, status, startDate, endDate, page || 1, limit || 10, search);
    res.json(data);
  }
}
