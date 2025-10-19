import { Controller, Post, Req, UseGuards, Res, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { StripeConnectService } from './stripe-connect.service';
import { Response } from 'express';
import { StripeAccountStatusDto } from 'src/payments/dto/stripe-account-status.dto';

@ApiTags('Stripe Connect')
@Controller('stripe-connect')
export class StripeConnectController {
  constructor(private readonly stripeConnectService: StripeConnectService) {}

  @Post('onboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or retrieve a Stripe Connect onboarding link' })
  @ApiResponse({ status: 201, description: 'Stripe Connect onboarding link created', type: Object })
  async createOnboardingLink(
    @GetUser('sub') userId: string,
  ) {
    return this.stripeConnectService.createOnboardingLink(userId);
  }

  @Get('onboard-return')
  @ApiOperation({ summary: 'Handle Stripe Connect onboarding return' })
  @ApiResponse({ status: 200, description: 'Stripe Connect onboarding completed' })
  async handleOnboardingReturn(
    @Query('state') state: string,
    @Query('scope') scope: string,
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    await this.stripeConnectService.handleOnboardingReturn(state, scope, code);
    // Redirect to a frontend page indicating success or failure
    res.redirect('http://localhost:3000/settings?stripe_onboard=success');
  }

  @Get('account-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current Stripe Connect account status for the logged-in user' })
  @ApiResponse({ status: 200, description: 'Stripe account status retrieved successfully', type: StripeAccountStatusDto })
  async getAccountStatus(
    @GetUser('sub') userId: string,
  ): Promise<StripeAccountStatusDto> {
    return this.stripeConnectService.getAccountStatus(userId);
  }

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current balance of the connected Stripe account' })
  @ApiResponse({ status: 200, description: 'Account balance retrieved successfully' })
  async getAccountBalance(
    @GetUser('sub') userId: string,
  ): Promise<{ available: number; pending: number }> {
    const user = await this.stripeConnectService['userModel'].findById(userId);
    if (!user || !user.stripeConnectAccountId) {
      throw new Error('Stripe account not connected');
    }
    return this.stripeConnectService.getConnectedAccountBalance(user.stripeConnectAccountId);
  }
}

