import { IsMongoId, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutSessionDto {
  @ApiProperty({ description: 'ID of the room to purchase', example: '60d0fe4f5b7f1e001f3e7a1b' })
  @IsMongoId()
  roomId: string;

  @ApiProperty({ description: 'URL to redirect after successful payment', example: 'https://example.com/success' })
  @IsUrl({ require_tld: false, allow_query_components: true })
  successUrl: string;

  @ApiProperty({ description: 'URL to redirect after cancelled payment', example: 'https://example.com/cancel' })
  @IsUrl({ require_tld: false, allow_query_components: true })
  cancelUrl: string;
}


