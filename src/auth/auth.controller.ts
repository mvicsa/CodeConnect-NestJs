import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ApiTags,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import { from } from 'rxjs';

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
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOkResponse({ description: 'User logged in successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`LoginDto ${JSON.stringify(loginDto)}`);

    //    userId: string;
    // content: string;
    // type: string;
    // data: Record<string, unknown>;
    // fromUserId?: string;

    //  message: 'Login successful',
    //   user: userWithoutPassword,
    //   token,
    try {
      await this.client.connect();
      const response = await this.authService.login(loginDto);
      this.client.emit('user.login', {
        userId: response.user._id,
        content: response.message,
        type: 'user',
        data: response.user,
        fromUserId: response.user._id,
      });
      this.logger.log(`✅ Emitted user.login event for: ${loginDto.email}`);
      return response;
    } catch (error) {
      this.logger.error(`❌ Failed to emit user.login event: ${error}`);
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Returns full user profile' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid token' })
  async getProfile(@Req() req: Request & { user: any }) {
    const userId: string = req.user?.sub;
    const user = await this.authService.getProfileById(userId);

    return {
      message: 'Profile fetched successfully',
      user,
    };
  }
}
