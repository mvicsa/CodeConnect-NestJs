import { IsArray, IsString, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckPurchaseDto {
  @ApiProperty({
    description: 'ID of the room to check purchase status for',
    example: '656a29be19a4e3b1c6d3d4b1',
  })
  @IsString()
  @IsNotEmpty()
  roomId: string;
}

export class CheckPurchaseBulkDto {
  @ApiProperty({
    description: 'Array of room IDs to check purchase status for',
    example: ['656a29be19a4e3b1c6d3d4b1', '656a29be19a4e3b1c6d3d4b2'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  roomIds: string[];
}

export class PurchaseStatusResponseDto {
  @ApiProperty({ description: 'ID of the room', example: '656a29be19a4e3b1c6d3d4b1' })
  roomId: string;

  @ApiProperty({ description: 'True if the room is purchased, false otherwise', example: true })
  isPurchased: boolean;
}

export class BulkPurchaseStatusResponseDto {
  @ApiProperty({
    description: 'Object where keys are room IDs and values are their purchase status',
    example: {
      '656a29be19a4e3b1c6d3d4b1': true,
      '656a29be19a4e3b1c6d3d4b2': false,
    },
  })
  purchasesStatus: { [key: string]: boolean };
}
