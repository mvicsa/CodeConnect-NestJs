import { ApiProperty } from '@nestjs/swagger';

export class StripeAccountStatusDto {
  @ApiProperty({ description: 'Whether the user has a Stripe Connect account ID.' })
  isConnected: boolean;

  @ApiProperty({ description: 'Whether the Stripe account is enabled to process charges.' })
  chargesEnabled: boolean;

  @ApiProperty({ description: 'Whether the Stripe account is enabled to receive payouts.' })
  payoutsEnabled: boolean;

  @ApiProperty({ description: 'Whether the user has submitted all required information to Stripe.' })
  detailsSubmitted: boolean;

  @ApiProperty({ description: 'A message indicating the current status or any pending actions.', required: false })
  message?: string;

  @ApiProperty({ description: 'URL to complete Stripe onboarding, if needed.', required: false })
  onboardingLink?: string;

  @ApiProperty({ description: 'URL to update Stripe account information, if needed.', required: false })
  settingsLink?: string;
}
