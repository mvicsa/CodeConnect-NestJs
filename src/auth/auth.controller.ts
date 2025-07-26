import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Inject,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GitHubAuthGuard } from './guards/github-auth.guard';
import {
  ApiTags,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import { from } from 'rxjs';
import { Logger } from '@nestjs/common';
@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly authService: AuthService,
    @Inject('RABBITMQ_PRODUCER')
    private readonly client: ClientProxy,
  ) {}

  @Post('register')
  @ApiCreatedResponse({ description: 'User successfully registered' })
  @ApiBadRequestResponse({
    description: 'Validation failed or email/username exists',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async register(@Body() registerDto: RegisterDto) {
    try {
      return await this.authService.register(registerDto);
    } catch (error) {
      if (error.status === 400) {
        throw error;
      }
      throw new Error('Internal server error');
    }
  }

  @Post('login')
  @ApiOkResponse({ description: 'User logged in successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async login(@Body() loginDto: LoginDto) {
    try {
      await this.client.connect();
      const response = await this.authService.login(loginDto);
      this.client.emit('user.login', {
        toUserId: response.user._id,
        content: response.message,
        type: 'user',
        data: response.user,
        fromUserId: response.user._id,
      });
      this.logger.log(`✅ Emitted user.login event for: ${loginDto.email}`);
      return response;
    } catch (error) {
      if (error.status === 400 || error.status === 401) {
        throw error;
      }
      throw new Error('Internal server error');
    }
  }

  @Post('forgot-password')
  @ApiOkResponse({ description: 'Password reset email sent' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      return await this.authService.forgotPassword(forgotPasswordDto);
    } catch (error) {
      if (error.status === 400) {
        throw error;
      }
      throw new Error('Internal server error');
    }
  }

  @Post('reset-password')
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiBadRequestResponse({ description: 'Invalid or expired token' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    try {
      return await this.authService.resetPassword(resetPasswordDto);
    } catch (error) {
      if (error.status === 400) {
        throw error;
      }
      throw new Error('Internal server error');
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Returns full user profile' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getProfile(@Req() req: Request & { user: any }) {
    try {
      const userId: string = req.user?.sub;
      if (!userId) {
        throw new Error('User ID not found in token');
      }
      const user = await this.authService.getProfileById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return {
        message: 'Profile fetched successfully',
        user,
      };
    } catch (error) {
      if (error.message === 'User not found') {
        throw { status: 404, message: 'User not found' };
      }
      if (error.message === 'User ID not found in token') {
        throw { status: 401, message: 'Unauthorized' };
      }
      throw new Error('Internal server error');
    }
  }

  @Get('github')
  @UseGuards(GitHubAuthGuard)
  async githubLogin() {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  async githubCallback(@Req() req, @Res() res: Response) {
    try {
      // req.user is set by GitHubStrategy
      const githubUser = req.user;
      const { user, token } =
        await this.authService.handleGithubLogin(githubUser);
      // Redirect to frontend with token and user info (encoded)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/github/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error('GitHub OAuth error:', err);
      return res
        .status(500)
        .json({ message: 'GitHub OAuth error', error: err.message });
    }
  }
}
