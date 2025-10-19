import { Controller, Post, Body, Req, Res, UseGuards, HttpStatus, Headers, Get, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { MyEarningsQueryDto, MyEarningsResponseDto } from './dto/my-earnings.dto'; // Import DTOs
import { MyPurchasesQueryDto, MyPurchasesResponseDto } from './dto/my-purchases.dto';
import { DashboardResponseDto, QuickStatsDto } from './dto/dashboard.dto';
import { CheckPurchaseDto, CheckPurchaseBulkDto, PurchaseStatusResponseDto, BulkPurchaseStatusResponseDto } from './dto/check-purchase.dto';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-checkout-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe checkout session for a paid room' })
  @ApiResponse({ status: 201, description: 'Checkout session created successfully', type: Object })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async createCheckoutSession(
    @Body() createCheckoutSessionDto: CreateCheckoutSessionDto,
    @GetUser('sub') userId: string, // Changed from '_id' to 'sub'
  ) {
    const { roomId, successUrl, cancelUrl } = createCheckoutSessionDto;
    const checkoutUrl = await this.paymentService.createCheckoutSession(
      roomId,
      userId,
      successUrl,
      cancelUrl,
    );
    return checkoutUrl;
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle Stripe webhook events (no authentication required)' })
  @ApiResponse({ status: 200, description: 'Webhook received and processed' })
  @ApiResponse({ status: 400, description: 'Webhook Error' })
  async handleStripeWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    try {
      console.log('🔔 Webhook received:', {
        signature: signature,
        body: (req as any).rawBody ? 'Raw body present' : 'No raw body',
        headers: req.headers
      });
      
      await this.paymentService.handleWebhookEvent((req as any).rawBody, signature);
      res.status(HttpStatus.OK).send();
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
    }
  }

  @Get('my-earnings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get creator earnings history' })
  @ApiQuery({ 
    name: 'search', 
    required: false, 
    description: 'Search in session titles',
    type: String
  })
  @ApiResponse({ status: 200, description: 'Creator earnings retrieved successfully', type: MyEarningsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyEarnings(
    @GetUser('sub') userId: string, // Changed from '_id' to 'sub'
    @Query() query: MyEarningsQueryDto,
  ): Promise<MyEarningsResponseDto> {
    return this.paymentService.getCreatorEarnings(userId, query);
  }

  @Get('my-purchases')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user purchase history' })
  @ApiResponse({ status: 200, description: 'User purchases retrieved successfully', type: MyPurchasesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyPurchases(
    @GetUser('sub') userId: string, // Changed from '_id' to 'sub'
    @Query() query: MyPurchasesQueryDto,
  ): Promise<MyPurchasesResponseDto> {
    return this.paymentService.getUserPurchases(userId, query);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comprehensive dashboard data for user' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter end date (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully', type: DashboardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDashboardData(
    @GetUser('sub') userId: string,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.paymentService.getDashboardData(userId, startDate, endDate);
    res.json(data);
  }

  @Get('quick-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get quick statistics for user' })
  @ApiResponse({ status: 200, description: 'Quick stats retrieved successfully', type: QuickStatsDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getQuickStats(
    @GetUser('sub') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.paymentService.getQuickStats(userId);
    res.json(data);
  }

  @Get('recent-activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get recent activities for user with pagination' })
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
    name: 'search', 
    required: false, 
    description: 'Search in room names and descriptions',
    type: String
  })
  @ApiResponse({ status: 200, description: 'Recent activities retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRecentActivities(
    @GetUser('sub') userId: string,
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.paymentService.getRecentActivitiesWithPagination(
      userId, 
      page || 1, 
      limit || 10, 
      startDate, 
      endDate,
      search
    );
    res.json(data);
  }

  @Get('purchases-history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get purchases history for user with pagination' })
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
    name: 'search', 
    required: false, 
    description: 'Search in room names',
    type: String
  })
  @ApiResponse({ status: 200, description: 'Purchases history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPurchasesHistory(
    @GetUser('sub') userId: string,
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string
  ): Promise<void> {
    // منع الـ caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const data = await this.paymentService.getPurchasesHistoryWithPagination(
      userId, 
      page || 1, 
      limit || 10, 
      startDate, 
      endDate,
      search
    );
    res.json(data);
  }

  @Get('check-purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if the user has purchased a specific room' })
  @ApiQuery({ name: 'roomId', required: true, description: 'ID of the room to check' })
  @ApiResponse({ status: 200, description: 'Purchase status retrieved successfully', type: PurchaseStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkPurchase(
    @GetUser('sub') userId: string,
    @Query() { roomId }: CheckPurchaseDto,
  ): Promise<PurchaseStatusResponseDto> {
    const isPurchased = await this.paymentService.checkRoomPurchaseStatus(userId, roomId);
    return { roomId, isPurchased };
  }

  @Post('check-purchase-bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if the user has purchased multiple rooms' })
  @ApiResponse({ status: 200, description: 'Bulk purchase status retrieved successfully', type: BulkPurchaseStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkPurchaseBulk(
    @GetUser('sub') userId: string,
    @Body() { roomIds }: CheckPurchaseBulkDto,
  ): Promise<BulkPurchaseStatusResponseDto> {
    const purchasesStatus = await this.paymentService.checkRoomPurchaseStatusBulk(userId, roomIds);
    return { purchasesStatus };
  }

}
