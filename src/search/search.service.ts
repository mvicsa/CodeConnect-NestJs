import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post, PostDocument } from '../posts/shemas/post.schema';
import { User, UserDocument } from '../users/shemas/user.schema';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async searchAll(query: string, page = 1, limit = 10) {
    const postFilter = {
      $or: [
        { text: { $regex: query, $options: 'i' } },
        { code: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } },
      ],
    };
    const userFilter = {
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
      ],
    };
    const skip = (page - 1) * limit;
    const [posts, users, postCount, userCount] = await Promise.all([
      this.postModel
        .find(postFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', '-password -email')
        .populate({
          path: 'userReactions.userId',
          select: '-password -email',
        })
        .lean(),
      this.userModel
        .find(userFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password -email')
        .lean(),
      this.postModel.countDocuments(postFilter),
      this.userModel.countDocuments(userFilter),
    ]);
    const hasMore = page * limit < postCount + userCount;
    return { posts, users, hasMore };
  }
}
