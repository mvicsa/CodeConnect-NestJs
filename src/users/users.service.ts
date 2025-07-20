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
  }

  async findAll() {
    // Exclude password
    return this.userModel.find().select('-password');
  }

  async followUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new Error('Cannot follow yourself');
    const user = await this.userModel.findById(userId);
    const targetUser = await this.userModel.findById(targetUserId);
    if (!user || !targetUser) throw new Error('User not found');
    if (user.following.includes(targetUserId))
      throw new Error('Already following');
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
    user.following = user.following.filter((id) => id !== targetUserId);
    targetUser.followers = targetUser.followers.filter((id) => id !== userId);
    await user.save();
    await targetUser.save();
    return { success: true };
  }

  async getFollowers(userId: string, limit = 20, skip = 0) {
    const user = await this.userModel.findById(userId).populate({
      path: 'followers',
      select: 'username firstName lastName avatar',
      options: { limit: Number(limit), skip: Number(skip) },
    });
    if (!user) throw new Error('User not found');
    return user.followers;
  }

  async getFollowing(userId: string, limit = 20, skip = 0) {
    const user = await this.userModel.findById(userId).populate({
      path: 'following',
      select: 'username firstName lastName avatar',
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
  }

  async updateUser(userId: string, updateUserDto: any) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, updateUserDto, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
