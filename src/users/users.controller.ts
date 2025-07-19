import { Body, Controller, Param, Post, Delete, Get, Req, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('follow/:targetId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Follow a user' })
  @ApiParam({ name: 'targetId', type: String, description: 'User ID to follow' })
  @ApiResponse({ status: 201, description: 'Followed user successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async followUser(@Param('targetId') targetId: string, @Req() req: Request & { user: any }) {
    const userId = req.user?.sub;
    return this.usersService.followUser(userId, targetId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('unfollow/:targetId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow a user' })
  @ApiParam({ name: 'targetId', type: String, description: 'User ID to unfollow' })
  @ApiResponse({ status: 200, description: 'Unfollowed user successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unfollowUser(@Param('targetId') targetId: string, @Req() req: Request & { user: any }) {
    const userId = req.user?.sub;
    return this.usersService.unfollowUser(userId, targetId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/followers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get followers of a user with pagination' })
  @ApiParam({ name: 'id', type: String, description: "User ID or 'me' for current user" })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Number of followers to return' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0, description: 'Number of followers to skip' })
  @ApiResponse({ status: 200, description: 'List of followers' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFollowers(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = id === 'me' ? req.user?.sub : id;
    return this.usersService.getFollowers(userId, limit ? Number(limit) : 20, skip ? Number(skip) : 0);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/following')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get users this user is following with pagination' })
  @ApiParam({ name: 'id', type: String, description: "User ID or 'me' for current user" })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Number of users to return' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0, description: 'Number of users to skip' })
  @ApiResponse({ status: 200, description: 'List of following users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFollowing(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = id === 'me' ? req.user?.sub : id;
    return this.usersService.getFollowing(userId, limit ? Number(limit) : 20, skip ? Number(skip) : 0);
  }

  @UseGuards(JwtAuthGuard)
  @Get('suggestions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user suggestions (users you do not follow yet)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Number of users to return' })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0, description: 'Number of users to skip' })
  @ApiResponse({ status: 200, description: 'List of suggested users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async suggestUsers(
    @Req() req: Request & { user: any },
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = req.user?.sub;
    return this.usersService.suggestUsers(userId, limit ? Number(limit) : 20, skip ? Number(skip) : 0);
  }
}
