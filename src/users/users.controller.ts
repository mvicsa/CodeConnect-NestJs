import {
  Body,
  Controller,
  Param,
  Post,
  Delete,
  Get,
  Req,
  UseGuards,
  Query,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('follow/:targetId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Follow a user' })
  @ApiParam({
    name: 'targetId',
    type: String,
    description: 'User ID to follow',
  })
  @ApiResponse({ status: 201, description: 'Followed user successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid user ID' })
  async followUser(
    @Param('targetId') targetId: string,
    @Req() req: Request & { user: any },
  ) {
    if (!targetId || typeof targetId !== 'string') {
      throw new Error('Invalid user ID');
    }
    const userId = req.user?.sub;
    return this.usersService.followUser(userId, targetId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('unfollow/:targetId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiParam({
    name: 'targetId',
    type: String,
    description: 'User ID to unfollow',
  })
  @ApiResponse({ status: 200, description: 'Unfollowed user successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid user ID' })
  async unfollowUser(
    @Param('targetId') targetId: string,
    @Req() req: Request & { user: any },
  ) {
    if (!targetId || typeof targetId !== 'string') {
      throw new Error('Invalid user ID');
    }
    const userId = req.user?.sub;
    return this.usersService.unfollowUser(userId, targetId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/followers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get followers of a user with pagination' })
  @ApiParam({
    name: 'id',
    type: String,
    description: "User ID or 'me' for current user",
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Number of followers to return',
  })
  @ApiQuery({
    name: 'skip',
    required: false,
    type: Number,
    example: 0,
    description: 'Number of followers to skip',
  })
  @ApiResponse({ status: 200, description: 'List of followers' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid user ID' })
  async getFollowers(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = id === 'me' ? req.user?.sub : id;
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    return this.usersService.getFollowers(
      userId,
      limit ? Number(limit) : 20,
      skip ? Number(skip) : 0,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/following')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get users this user is following with pagination' })
  @ApiParam({
    name: 'id',
    type: String,
    description: "User ID or 'me' for current user",
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Number of users to return',
  })
  @ApiQuery({
    name: 'skip',
    required: false,
    type: Number,
    example: 0,
    description: 'Number of users to skip',
  })
  @ApiResponse({ status: 200, description: 'List of following users' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid user ID' })
  async getFollowing(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = id === 'me' ? req.user?.sub : id;
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    return this.usersService.getFollowing(
      userId,
      limit ? Number(limit) : 20,
      skip ? Number(skip) : 0,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('suggestions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user suggestions (users you do not follow yet)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 5,
    description: 'Number of users to return',
  })
  @ApiQuery({
    name: 'skip',
    required: false,
    type: Number,
    example: 0,
    description: 'Number of users to skip',
  })
  @ApiResponse({ status: 200, description: 'List of suggested users' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async suggestUsers(
    @Req() req: Request & { user: any },
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = req.user?.sub;
    return this.usersService.suggestUsers(
      userId,
      limit ? Number(limit) : 5,
      skip ? Number(skip) : 0,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid update data' })
  async updateMe(
    @Req() req: Request & { user: any },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const userId = req.user?.sub;
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    return this.usersService.updateUser(userId, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('email/:email')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get user by email address',
    description: 'Retrieve a user profile using their email address. Requires authentication.'
  })
  @ApiOkResponse({ 
    description: 'User profile returned by email.',
    schema: {
      type: 'object',
      properties: {
        _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
        username: { type: 'string', example: 'johndoe' },
        firstName: { type: 'string', example: 'John' },
        lastName: { type: 'string', example: 'Doe' },
        email: { type: 'string', example: 'john@example.com' },
        avatar: { type: 'string', example: 'https://example.com/avatar.jpg' },
        cover: { type: 'string', example: 'https://example.com/cover.jpg' },
        bio: { type: 'string', example: 'Software developer' },
        followers: { type: 'array', items: { type: 'string' } },
        following: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiBadRequestResponse({ description: 'Invalid email format.' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - JWT token required.' })
  @ApiParam({
    name: 'email',
    type: String,
    description: 'Email address to search for',
    example: 'user@example.com'
  })
  async getUserByEmail(@Param('email') email: string) {
    if (!email || typeof email !== 'string') {
      throw new BadRequestException('Invalid email address.');
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format.');
    }
    
    return this.usersService.findByEmail(email);
  }

  @Get(':username')
  @ApiOkResponse({ description: 'Public user profile returned.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  @ApiBadRequestResponse({ description: 'Invalid username.' })
  async getUserProfile(@Param('username') username: string) {
    if (!username || typeof username !== 'string') {
      throw new Error('Invalid username.');
    }
    return this.usersService.findByUsername(username);
  }

  @Get()
  @ApiOkResponse({ description: 'List of all users returned.' })
  @ApiQuery({
    name: 'email',
    required: false,
    type: String,
    description: 'Email to search for a specific user',
    example: 'user@example.com'
  })
  async getAllUsers(@Query('email') email?: string) {
    if (email) {
      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new BadRequestException('Invalid email format.');
      }
      return this.usersService.findByEmail(email);
    }
    return this.usersService.findAll();
  }
}
