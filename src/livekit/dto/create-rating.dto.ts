import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, IsBoolean, Min, Max, MaxLength } from 'class-validator';

export class CreateRatingDto {
  @ApiProperty({ description: 'Overall rating from 1-5 stars', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  overallRating: number;

  @ApiProperty({ description: 'Technical knowledge rating from 1-5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  technicalKnowledge: number;

  @ApiProperty({ description: 'Communication skills rating from 1-5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  communication: number;

  @ApiProperty({ description: 'Session organization rating from 1-5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  organization: number;

  @ApiProperty({ description: 'Helpfulness rating from 1-5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  helpfulness: number;

  @ApiProperty({ description: 'Optional comment about the session', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @ApiProperty({ description: 'Whether the rating is anonymous', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
