import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlockService } from './block.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { Block } from './block.schema';

@ApiTags('blocks')
@Controller('blocks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  @Post()
  @ApiOperation({ summary: 'Block a user' })
  @ApiResponse({ status: 201, description: 'User blocked successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - cannot block yourself' })
  @ApiResponse({ status: 409, description: 'User is already blocked' })
  async createBlock(
    @Request() req,
    @Body() createBlockDto: CreateBlockDto,
  ): Promise<Block> {
    return this.blockService.createBlock(req.user.sub, createBlockDto);
  }

  @Put(':blockedId')
  @ApiOperation({ summary: 'Update block relationship' })
  @ApiResponse({ status: 200, description: 'Block updated successfully' })
  @ApiResponse({ status: 404, description: 'Block relationship not found' })
  async updateBlock(
    @Request() req,
    @Param('blockedId') blockedId: string,
    @Body() updateBlockDto: UpdateBlockDto,
  ): Promise<Block> {
    return this.blockService.updateBlock(req.user.sub, blockedId, updateBlockDto);
  }

  @Delete(':blockedId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiResponse({ status: 200, description: 'User unblocked successfully' })
  @ApiResponse({ status: 404, description: 'Block relationship not found' })
  async removeBlock(
    @Request() req,
    @Param('blockedId') blockedId: string,
  ): Promise<{ message: string }> {
    return this.blockService.removeBlock(req.user.sub, blockedId);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'Get list of users blocked by current user' })
  @ApiResponse({ status: 200, description: 'List of blocked users' })
  async getBlockedUsers(@Request() req): Promise<Block[]> {
    return this.blockService.getBlockedUsers(req.user.sub);
  }

  @Get('blocked-by')
  @ApiOperation({ summary: 'Get list of users who blocked current user' })
  @ApiResponse({ status: 200, description: 'List of users who blocked current user' })
  async getBlockedByUsers(@Request() req): Promise<Block[]> {
    return this.blockService.getBlockedByUsers(req.user.sub);
  }

  @Get('check/:userId')
  @ApiOperation({ summary: 'Check block relationship with a specific user' })
  @ApiResponse({ status: 200, description: 'Block relationship status' })
  async checkBlockRelationship(
    @Request() req,
    @Param('userId') userId: string,
  ): Promise<{
    isBlocked: boolean;
    isBlockedBy: boolean;
    block?: Block;
  }> {
    return this.blockService.getBlockRelationship(req.user.sub, userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get block statistics for current user' })
  @ApiResponse({ status: 200, description: 'Block statistics' })
  async getBlockStats(@Request() req): Promise<{
    blockedCount: number;
    blockedByCount: number;
  }> {
    return this.blockService.getBlockStats(req.user.sub);
  }

  @Get('is-blocked/:userId')
  @ApiOperation({ summary: 'Check if current user has blocked a specific user' })
  @ApiResponse({ status: 200, description: 'Block status' })
  async isBlocked(
    @Request() req,
    @Param('userId') userId: string,
  ): Promise<{ isBlocked: boolean }> {
    const isBlocked = await this.blockService.isBlocked(req.user.sub, userId);
    return { isBlocked };
  }

  @Get('is-blocked-by/:userId')
  @ApiOperation({ summary: 'Check if current user is blocked by a specific user' })
  @ApiResponse({ status: 200, description: 'Blocked by status' })
  async isBlockedBy(
    @Request() req,
    @Param('userId') userId: string,
  ): Promise<{ isBlockedBy: boolean }> {
    const isBlockedBy = await this.blockService.isBlockedBy(req.user.sub, userId);
    return { isBlockedBy };
  }
}