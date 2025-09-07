import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password of the user',
    example: 'currentPassword123',
  })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @ApiProperty({
    description: 'New password for the user',
    example: 'newPassword123',
  })
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  @MaxLength(20, { message: 'New password cannot exceed 20 characters' })
  newPassword: string;
}

