import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '../../users/shemas/user.schema';
import { ApiProperty } from '@nestjs/swagger';

class SocialLinkDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  url: string;
}

export class RegisterDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(20)
  password: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cover?: string;

  @ApiProperty({ required: false, type: String })
  @IsOptional()
  @IsDateString()
  birthdate?: Date;

  @ApiProperty({ required: false, enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, type: [SocialLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}
