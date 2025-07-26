import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Block, BlockDocument } from './block.schema';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class BlockService {
  constructor(
    @InjectModel(Block.name) private blockModel: Model<BlockDocument>,
    private readonly usersService: UsersService,
  ) {}

  async createBlock(blockerId: string, createBlockDto: CreateBlockDto): Promise<Block> {
    const { blockedId, reason } = createBlockDto;

    // Prevent self-blocking
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }

    // Check if block already exists
    const existingBlock = await this.blockModel.findOne({
      blockerId: new Types.ObjectId(blockerId),
      blockedId: new Types.ObjectId(blockedId),
    });

    if (existingBlock) {
      if (existingBlock.isActive) {
        throw new ConflictException('User is already blocked');
      } else {
        // Reactivate existing block
        existingBlock.isActive = true;
        existingBlock.reason = reason;
        return existingBlock.save();
      }
    }

    const block = new this.blockModel({
      blockerId: new Types.ObjectId(blockerId),
      blockedId: new Types.ObjectId(blockedId),
      reason,
      isActive: true,
    });

    const savedBlock = await block.save();

    // Remove follow relationships when blocking
    await this.removeFollowRelationships(blockerId, blockedId);

    return savedBlock;
  }

  async updateBlock(blockerId: string, blockedId: string, updateBlockDto: UpdateBlockDto): Promise<Block> {
    const block = await this.blockModel.findOne({
      blockerId: new Types.ObjectId(blockerId),
      blockedId: new Types.ObjectId(blockedId),
    });

    if (!block) {
      throw new NotFoundException('Block relationship not found');
    }

    Object.assign(block, updateBlockDto);
    return block.save();
  }

  async removeBlock(blockerId: string, blockedId: string): Promise<{ message: string }> {
    const block = await this.blockModel.findOne({
      blockerId: new Types.ObjectId(blockerId),
      blockedId: new Types.ObjectId(blockedId),
    });

    if (!block) {
      throw new NotFoundException('Block relationship not found');
    }

    await this.blockModel.deleteOne({
      blockerId: new Types.ObjectId(blockerId),
      blockedId: new Types.ObjectId(blockedId),
    });

    // Note: We don't automatically re-follow when unblocking
    // Users need to manually follow again if they want to

    return { message: 'User unblocked successfully' };
  }

  async getBlockedUsers(userId: string): Promise<Block[]> {
    return this.blockModel
      .find({
        blockerId: new Types.ObjectId(userId),
        isActive: true,
      })
      .populate('blockedId', 'username firstName lastName avatar')
      .exec();
  }

  async getBlockedByUsers(userId: string): Promise<Block[]> {
    return this.blockModel
      .find({
        blockedId: new Types.ObjectId(userId),
        isActive: true,
      })
      .populate('blockerId', 'username firstName lastName avatar')
      .exec();
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await this.blockModel.findOne({
      blockerId: new Types.ObjectId(blockerId),
      blockedId: new Types.ObjectId(blockedId),
      isActive: true,
    });

    return !!block;
  }

  async isBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await this.blockModel.findOne({
      blockerId: new Types.ObjectId(blockedId),
      blockedId: new Types.ObjectId(blockerId),
      isActive: true,
    });

    return !!block;
  }

  async getBlockRelationship(userId1: string, userId2: string): Promise<{
    isBlocked: boolean;
    isBlockedBy: boolean;
    block?: Block;
  }> {
    const [block, blockedBy] = await Promise.all([
      this.blockModel.findOne({
        blockerId: new Types.ObjectId(userId1),
        blockedId: new Types.ObjectId(userId2),
        isActive: true,
      }),
      this.blockModel.findOne({
        blockerId: new Types.ObjectId(userId2),
        blockedId: new Types.ObjectId(userId1),
        isActive: true,
      }),
    ]);

    return {
      isBlocked: !!block,
      isBlockedBy: !!blockedBy,
      block: block || blockedBy || undefined,
    };
  }

  async getBlockStats(userId: string): Promise<{
    blockedCount: number;
    blockedByCount: number;
  }> {
    const [blockedCount, blockedByCount] = await Promise.all([
      this.blockModel.countDocuments({
        blockerId: new Types.ObjectId(userId),
        isActive: true,
      }),
      this.blockModel.countDocuments({
        blockedId: new Types.ObjectId(userId),
        isActive: true,
      }),
    ]);

    return {
      blockedCount,
      blockedByCount,
    };
  }

  /**
   * Remove follow relationships when blocking a user
   * This ensures that blocked users are removed from followers/following lists
   */
  private async removeFollowRelationships(blockerId: string, blockedId: string): Promise<void> {
    try {
      // Remove blocked user from blocker's following list
      await this.usersService.unfollowUser(blockerId, blockedId);
    } catch (error) {
      // Ignore errors if users weren't following each other
      console.log('No follow relationship to remove or already unfollowed');
    }

    try {
      // Remove blocker from blocked user's following list
      await this.usersService.unfollowUser(blockedId, blockerId);
    } catch (error) {
      // Ignore errors if users weren't following each other
      console.log('No follow relationship to remove or already unfollowed');
    }
  }
}