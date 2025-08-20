import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './shemas/user.schema';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { ClientProxy } from '@nestjs/microservices';
// import { NotificationService } from '../notification/notification.service';
// import { NotificationType } from '../notification/entities/notification.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject('RABBITMQ_PRODUCER') private readonly client: ClientProxy,
  ) {}

  async findByUsername(username: string) {
    // Exclude password and email
    const user = await this.userModel
      .findOne({ username })
      .select('-password -email');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }

  async findByEmail(email: string) {
    // Exclude password for security
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('-password');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }

  async findAll() {
    // Exclude password
    return this.userModel.find().select('-password');
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }

  async findByUsernames(usernames: string[]): Promise<User[]> {
    if (!usernames || usernames.length === 0) return [];
    return this.userModel.find({ username: { $in: usernames } }).select('_id username firstName lastName avatar');
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }

  async followUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new Error('Cannot follow yourself');
    const user = await this.userModel.findById(userId);
    const targetUser = await this.userModel.findById(targetUserId);
    if (!user || !targetUser) throw new Error('User not found');
    if (user.following.includes(targetUserId))
      throw new Error('Already following');
    
    // Check if users are blocked (this will be handled by the block guard)
    // The block guard will prevent this method from being called if users are blocked
    
    user.following.push(targetUserId);
    targetUser.followers.push(userId);
    await user.save();
    await targetUser.save();
    // Send notification
    this.client.emit('user.followed', {
      toUserId: targetUserId,
      fromUserId: userId,
      content: `${user.username} followed you`,
      type: NotificationType.FOLLOWED_USER,
      data: { followerId: userId },
    });
    return { success: true };
  }

  async unfollowUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new Error('Cannot unfollow yourself');
    const user = await this.userModel.findById(userId);
    const targetUser = await this.userModel.findById(targetUserId);
    if (!user || !targetUser) throw new Error('User not found');
    if (!user.following.includes(targetUserId))
      throw new Error('Not following');
    
    // Note: Blocked users are handled by the block system
    // This method can be called safely even for blocked users
    
    user.following = user.following.filter((id) => id !== targetUserId);
    targetUser.followers = targetUser.followers.filter((id) => id !== userId);
    await user.save();
    await targetUser.save();
    // Emit event to remove follow notification
    this.client.emit('notification.source.deleted', {
      type: NotificationType.FOLLOWED_USER,
      toUserId: targetUserId.toString(),
      fromUserId: userId.toString(),
      followId: userId.toString(),
    });
    return { success: true };
  }

  async getFollowers(userId: string, limit = 20, skip = 0) {
    const user = await this.userModel.findById(userId).populate({
      path: 'followers',
      select: 'username firstName lastName avatar email',
      options: { limit: Number(limit), skip: Number(skip) },
    });
    if (!user) throw new Error('User not found');
    
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
    // This ensures blocked users don't appear in followers list
    return user.followers;
  }

  async getFollowing(userId: string, limit = 20, skip = 0) {
    const user = await this.userModel.findById(userId).populate({
      path: 'following',
      select: 'username firstName lastName avatar email',
      options: { limit: Number(limit), skip: Number(skip) },
    });
    if (!user) throw new Error('User not found');
    return user.following;
  }

  async suggestUsers(userId: string, limit = 20, skip = 0) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new Error('User not found');
    // Exclude self and users already followed
    const excludeIds = [userId, ...user.following];
    return this.userModel
      .find({ _id: { $nin: excludeIds } })
      .select('username firstName lastName avatar')
      .limit(Number(limit))
      .skip(Number(skip));
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }

  async updateUser(userId: string, updateUserDto: any) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, updateUserDto, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }

  async getUserById(userId: string) {
    return this.userModel.findById(userId).select('username firstName lastName email');
    // Note: Blocked users are filtered out by the BlockFilterInterceptor
  }
}
