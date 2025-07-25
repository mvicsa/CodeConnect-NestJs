import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { User, UserDocument } from '../users/shemas/user.schema';
import { PasswordResetToken, PasswordResetTokenDocument } from './schemas/password-reset-token.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthMailerService } from './mailer.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PasswordResetToken.name) private passwordResetTokenModel: Model<PasswordResetTokenDocument>,
    private jwtService: JwtService,
    private authMailerService: AuthMailerService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, username, password } = registerDto;

    // Check if email or username already exist
    const userExists = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });

    if (userExists) {
      throw new BadRequestException('Email or username already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with trimmed names
    const createdUser = new this.userModel({
      ...registerDto,
      firstName: registerDto.firstName.trim(),
      lastName: registerDto.lastName.trim(),
      password: hashedPassword,
    });

    const savedUser = await createdUser.save();

    // Generate JWT
    const payload = {
      sub: savedUser._id,
      email: savedUser.email,
      role: savedUser.role,
    };
    const token = await this.jwtService.signAsync(payload);

    // Remove password before returning
    const { password: _, ...userWithoutPassword } = savedUser.toObject();

    return {
      message: 'User registered successfully',
      user: userWithoutPassword,
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new BadRequestException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new BadRequestException('Invalid email or password');
    }

    // Generate JWT
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    const token = await this.jwtService.signAsync(payload);

    // Remove password before returning
    const { password: _, ...userWithoutPassword } = user.toObject();

    return {
      message: 'Login successful',
      user: userWithoutPassword,
      token,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    // Check if user exists
    const user = await this.userModel.findOne({ email });
    if (!user) {
      // Don't reveal if email exists or not for security
      return { message: 'Password reset link has been sent.' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token
    const resetTokenDoc = new this.passwordResetTokenModel({
      email,
      token: resetToken,
      expiresAt,
    });
    await resetTokenDoc.save();

    // Send email
    try {
      await this.authMailerService.sendPasswordResetEmail(email, resetToken);
      return { message: 'Password reset link has been sent.' };
    } catch (error) {
      // Delete the token if email fails
      await this.passwordResetTokenModel.deleteOne({ token: resetToken });
      throw new BadRequestException('Failed to send password reset email. Please try again.');
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, password } = resetPasswordDto;

    // Find the reset token
    const resetTokenDoc = await this.passwordResetTokenModel.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!resetTokenDoc) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Find the user
    const user = await this.userModel.findOne({ email: resetTokenDoc.email });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Hash new password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    // Mark token as used
    resetTokenDoc.used = true;
    await resetTokenDoc.save();

    return { message: 'Password has been reset successfully' };
  }

  async getProfileById(userId: string) {
    const user = await this.userModel.findById(userId).select('-password');
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
  }

  async handleGithubLogin(githubUser: any) {
    // Try to find user by email or githubId (using username as fallback)
    let user = await this.userModel.findOne({
      $or: [
        { email: githubUser.email },
        { username: githubUser.githubUsername },
      ],
    });

    if (!user) {
      // Generate a random password for social users
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = new this.userModel({
        firstName: githubUser.firstName || githubUser.username || 'GitHub',
        lastName: githubUser.lastName || '',
        username: githubUser.githubUsername,
        email: githubUser.email,
        password: randomPassword, // Set a random password
        avatar: githubUser.avatar,
        role: 'user',
        // Optionally: add isGithubUser: true, githubId, etc.
      });
      await user.save();
    }

    // Generate JWT
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };
    const token = await this.jwtService.signAsync(payload);

    // Remove password before returning
    const { password: _, ...userWithoutPassword } = user.toObject();

    return {
      user: userWithoutPassword,
      token,
    };
  }
}
