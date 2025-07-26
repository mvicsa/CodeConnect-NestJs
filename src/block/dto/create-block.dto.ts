import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({ description: 'The ID of the user to block' })
  @IsMongoId()
  blockedId: string;

  @ApiProperty({ description: 'Optional reason for blocking', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}