import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { User, UserDocument } from '../users/shemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
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

    // Create new user
    const createdUser = new this.userModel({
      ...registerDto,
      password: hashedPassword,
    });

    const savedUser = await createdUser.save();

    // Remove password before returning
    const { password: _, ...userWithoutPassword } = savedUser.toObject();

    return {
      message: 'User registered successfully',
      user: userWithoutPassword,
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
