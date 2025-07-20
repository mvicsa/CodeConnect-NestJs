import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './shemas/comment.schema';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {}

  async create(
    data: Omit<Comment, 'createdBy'>,
    userId: string,
  ): Promise<Comment> {
    const created = new this.commentModel({ ...data, createdBy: userId });
    await created.save();

    // Populate createdBy and userReactions.userId before returning
    await created.populate('createdBy', '-password');
    await created.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });

    return created;
  }

  async findByPost(postId: string): Promise<Comment[]> {
    return this.commentModel
      .find({ postId, parentCommentId: null })
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async findReplies(parentCommentId: string): Promise<Comment[]> {
    return this.commentModel
      .find({ parentCommentId })
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async update(
    _id: string,
    data: Partial<Comment>,
    userId: string,
  ): Promise<Comment> {
    const comment = await this.commentModel.findById(_id);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.createdBy.toString() !== userId)
      throw new ForbiddenException('You can only edit your own comments');
    Object.assign(comment, data);
    await comment.save();

    // Re-populate createdBy and userReactions.userId
    await comment.populate('createdBy', '-password');
    await comment.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });

    return comment;
  }

  async delete(_id: string, userId: string): Promise<void> {
    const comment = await this.commentModel.findById(_id);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.createdBy.toString() !== userId)
      throw new ForbiddenException('You can only delete your own comments');
    await this.commentModel.deleteOne({ _id });
    // Optionally, delete all replies to this comment
    await this.commentModel.deleteMany({ parentCommentId: _id });
  }

  async addOrUpdateReaction(
    commentId: string,
    userId: string,
    username: string,
    reaction: string,
  ): Promise<Comment> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');

    // Check if user already has the same reaction
    const existingReaction = comment.userReactions.find(
      (ur) => ur.userId.toString() === userId,
    );

    if (existingReaction && existingReaction.reaction === reaction) {
      // Remove the reaction if it's the same
      comment.userReactions = comment.userReactions.filter(
        (ur) => ur.userId.toString() !== userId,
      );
    } else {
      // Remove any existing reaction by this user and add the new one
      comment.userReactions = comment.userReactions.filter(
        (ur) => ur.userId.toString() !== userId,
      );
      comment.userReactions.push({
        userId: new Types.ObjectId(userId),
        username,
        reaction,
        createdAt: new Date(),
      });
    }

    // Update the reactions count
    const reactionTypes = ['like', 'love', 'wow', 'funny', 'dislike', 'happy'];
    comment.reactions = reactionTypes.reduce((acc, type) => {
      acc[type] = comment.userReactions.filter(
        (ur) => ur.reaction === type,
      ).length;
      return acc;
    }, {} as any);

    await comment.save();

    // Populate userReactions.userId and createdBy before returning
    await comment.populate('createdBy', '-password');
    await comment.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });

    return comment;
  }

  async findOne(_id: string): Promise<Comment> {
    const comment = await this.commentModel
      .findById(_id)
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
