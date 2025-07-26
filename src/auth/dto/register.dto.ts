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
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '../../users/shemas/user.schema';
import { ApiProperty } from '@nestjs/swagger';

// Custom validator for preventing leading/trailing spaces and spaces-only strings
export class NoLeadingTrailingSpacesConstraint {
  validate(value: string) {
    if (typeof value !== 'string') return false;
    
    // Check if string is only spaces
    if (value.trim().length === 0) return false;
    
    // Check if string has leading or trailing spaces
    if (value !== value.trim()) return false;
    
    return true;
  }

  defaultMessage() {
    return 'Field cannot contain only spaces or have leading/trailing spaces';
  }
}

// Custom validator for names (firstName, lastName) - only letters, spaces, hyphens, apostrophes
export class NameConstraint {
  validate(value: string) {
    if (typeof value !== 'string') return false;
    
    // Check if string is only spaces
    if (value.trim().length === 0) return false;
    
    // Check if string has leading or trailing spaces
    if (value !== value.trim()) return false;
    
    // Check if contains numbers
    if (/\d/.test(value)) return false;
    
    // Check if contains non-typical special characters (allow only letters, spaces, hyphens, apostrophes)
    if (!/^[a-zA-Z\s\-']+$/.test(value)) return false;
    
    // Check if only special characters (excluding allowed ones)
    if (/^[^a-zA-Z]+$/.test(value)) return false;
    
    return true;
  }

  defaultMessage() {
    return 'Name can only contain letters, spaces, hyphens, and apostrophes';
  }
}

// Custom validator for username - only alphanumeric, underscores, hyphens, no spaces
export class UsernameConstraint {
  validate(value: string) {
    if (typeof value !== 'string') return false;
    
    // Check if string is only spaces
    if (value.trim().length === 0) return false;
    
    // Check if string has leading or trailing spaces
    if (value !== value.trim()) return false;
    
    // Check if contains spaces
    if (/\s/.test(value)) return false;
    
    // Check if only one character and it's a number
    if (value.length === 1 && /^\d$/.test(value)) return false;
    
    // Check if only numbers
    if (/^\d+$/.test(value)) return false;
    
    // Check if contains Arabic characters
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(value)) return false;
    
    // Check if contains special characters (allow only alphanumeric, underscores, hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) return false;
    
    // Check if only special characters
    if (/^[^a-zA-Z0-9]+$/.test(value)) return false;
    
    return true;
  }

  defaultMessage() {
    return 'Username can only contain letters, numbers, underscores, and hyphens. No spaces or special characters allowed.';
  }
}

// Custom validator for email - prevent mailto: and other invalid formats
export class EmailConstraint {
  validate(value: string) {
    if (typeof value !== 'string') return false;
    
    // Check if starts with mailto:
    if (value.toLowerCase().startsWith('mailto:')) return false;
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return false;
    
    return true;
  }

  defaultMessage() {
    return 'Please enter a valid email address';
  }
}

// Custom validator for password - prevent spaces-only
export class PasswordConstraint {
  validate(value: string) {
    if (typeof value !== 'string') return false;
    
    // Check if password is only spaces
    if (value.trim().length === 0) return false;
    
    return true;
  }

  defaultMessage() {
    return 'Password cannot be only spaces';
  }
}

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
  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a string' })
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  @Validate(NameConstraint)
  firstName: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a string' })
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(150, { message: 'Last name cannot exceed 150 characters' })
  @Validate(NameConstraint)
  lastName: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Username is required' })
  @IsString({ message: 'Username must be a string' })
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
  @Validate(UsernameConstraint)
  username: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @Validate(EmailConstraint)
  email: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @MaxLength(20, { message: 'Password cannot exceed 20 characters' })
  @Validate(PasswordConstraint)
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
