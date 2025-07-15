import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Schema as MongooseSchema } from 'mongoose';
import { Post, PostDocument } from '../users/shemas/post.schema';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
  ) {}

  async findAll(page = 1, limit = 10): Promise<Post[]> {
    return this.postModel
      .find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async findOne(_id: string): Promise<Post> {
    const post = await this.postModel.findById(_id)
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(data: Omit<Post, 'createdBy'>, userId: string): Promise<Post> {
    const created = new this.postModel({ ...data, createdBy: userId });
    return created.save();
  }

  async update(_id: string, data: Partial<Post>, userId: string): Promise<Post> {
    const post = await this.postModel.findById(_id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.createdBy.toString() !== userId) throw new ForbiddenException('You can only edit your own posts');
    Object.assign(post, data);
    await post.save();
    // Re-populate createdBy and userReactions.userId
    await post.populate('createdBy', '-password');
    await post.populate({ path: 'userReactions.userId', select: '_id firstName lastName avatar role' });
    return post;
  }

  async delete(_id: string, userId: string): Promise<void> {
    const post = await this.postModel.findById(_id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.createdBy.toString() !== userId) throw new ForbiddenException('You can only delete your own posts');
    await this.postModel.deleteOne({ _id });
  }

  async findByTag(tag: string): Promise<Post[]> {
    return this.postModel.find({ tags: tag })
      .sort({ createdAt: -1 })
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async findByUser(userId: string): Promise<Post[]> {
    return this.postModel.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async findByContentType(type: 'code' | 'video' | 'image', page = 1, limit = 10): Promise<Post[]> {
    const query: any = {};
    query[type] = {
      $exists: true,
      $ne: null,
      $regex: new RegExp('\\S') // at least one non-whitespace character
    };
    return this.postModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async addOrUpdateReaction(postId: string, userId: string, username: string, reaction: string): Promise<Post> {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');

    // Remove any existing reaction by this user
    post.userReactions = post.userReactions.filter(ur => ur.userId.toString() !== userId);

    // Add the new reaction
    post.userReactions.push({
      userId: new Types.ObjectId(userId),
      username,
      reaction,
      createdAt: new Date(),
    });

    // Update the reactions count
    const reactionTypes = ['like', 'love', 'wow', 'funny', 'dislike', 'happy'];
    post.reactions = reactionTypes.reduce((acc, type) => {
      acc[type] = post.userReactions.filter(ur => ur.reaction === type).length;
      return acc;
    }, {} as any);

    await post.save();
    return post;
  }
} 