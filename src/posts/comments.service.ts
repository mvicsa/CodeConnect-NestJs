import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './shemas/comment.schema';
import { ClientProxy } from '@nestjs/microservices';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { PostsService } from './posts.service';
import { UsersService } from '../users/users.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { CommentEvaluationRequestDto } from '../ai-agent/dto/code-help-request.dto';
import {
  AICommentEvaluation,
  AICommentEvaluationSchema,
} from './shemas/code-suggestion.schema';

function extractObjectId(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // Match new ObjectId('...') or _id: '...'
    const match =
      val.match(/_id: new ObjectId\('([a-fA-F0-9]{24})'\)/) ||
      val.match(/_id: '([a-fA-F0-9]{24})'/);
    if (match) return match[1];
    if (/^[a-fA-F0-9]{24}$/.test(val.trim())) return val.trim();
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && parsed._id)
        return parsed._id.toString();
    } catch {
      return val;
    }
  }
  if (typeof val === 'object' && val._id) return val._id.toString();
  return val.toString();
}

function extractMentions(text: string): string[] {
  if (!text) return [];
  return Array.from(
    new Set((text.match(/@([a-zA-Z0-9_]+)/g) || []).map((m) => m.slice(1))),
  );
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @Inject('RABBITMQ_PRODUCER') private readonly client: ClientProxy,
    private readonly postsService: PostsService,
    private readonly usersService: UsersService,
    private readonly aiAgentService: AiAgentService, // Inject AI agent service
    @InjectModel(AICommentEvaluation.name)
    private aiCommentEvalModel: Model<any>, // Inject model for AICommentEvaluation
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
    const post = await this.postsService.findOne(
      data.postId as unknown as string,
    ); // ❌ hacky

    // --- AI Evaluation: Only if both post and comment have code ---
    if (
      post &&
      post.code &&
      post.codeLang &&
      created.code &&
      created.codeLang
    ) {
      try {
        const evaluation = await this.aiAgentService.evaluateCommentAnswer({
          postText: post.text || '',
          postCode: post.code,
          commentText: created.text || '',
          commentCode: created.code,
          language: created.codeLang || post.codeLang,
        });
        // Save evaluation in new collection
        await this.aiCommentEvalModel.create({
          postId: (post as any)._id,
          commentId: created._id,
          evaluation,
        });
        // Set hasAiEvaluation to true
        created.set('hasAiEvaluation', true);
        await created.save();
      } catch (err) {
        // Log error but do not block comment creation
        console.error('AI evaluation failed:', err.message);
      }
    }

    let toUserId: string;
    if (
      post.createdBy &&
      typeof post.createdBy === 'object' &&
      '_id' in post.createdBy
    ) {
      toUserId = (post.createdBy as any)._id.toString();
    } else {
      toUserId = post.createdBy.toString();
    }

    // Mention notifications
    const mentions = extractMentions(created.text);
    // Process mentions for notifications
    let mentionedUserIds: string[] = [];
    if (mentions.length > 0) {
      const mentionedUsers = await this.usersService.findByUsernames(mentions);
      mentionedUserIds = mentionedUsers.map((user: any) => user._id.toString());
      for (const user of mentionedUsers) {
        if ((user as any)._id.toString() !== userId) {
          this.client.emit('notification.mentioned', {
            toUserId: (user as any)._id.toString(),
            fromUserId: userId,
            data: created,
            type: NotificationType.USER_MENTIONED,
            content: `mention you in a ${created.parentCommentId ? 'reply' : 'comment'}`,
          });
        }
      }
    }

    // If this is a reply, notify parent comment owner (if not self and not mentioned)
    if (created.parentCommentId) {
      const parentComment = await this.commentModel.findById(
        created.parentCommentId,
      );
      if (parentComment) {
        const parentOwnerId = parentComment.createdBy.toString();
        if (
          parentOwnerId !== userId &&
          !mentionedUserIds.includes(parentOwnerId)
        ) {
          this.client.emit('comment.added', {
            toUserId: parentOwnerId,
            fromUserId: userId,
            data: { ...created, notificationType: 'reply_to_comment' },
            type: NotificationType.COMMENT_ADDED,
            content: 'New comment is created in a your post',
          });
        }
      }
      // Notify post owner if not self, not same as parent comment owner, and not mentioned
      if (
        toUserId !== userId &&
        (!parentComment || toUserId !== parentComment.createdBy.toString()) &&
        !mentionedUserIds.includes(toUserId)
      ) {
        this.client.emit('comment.added', {
          toUserId,
          fromUserId: userId,
          data: { ...created, notificationType: 'reply_to_post_owner' },
          type: NotificationType.COMMENT_ADDED,
          content: 'New comment is created in a your post',
        });
      }
    } else {
      // Top-level comment: notify post owner if not self and not mentioned
      if (toUserId !== userId && !mentionedUserIds.includes(toUserId)) {
        this.client.emit('comment.added', {
          toUserId,
          fromUserId: userId,
          data: { ...created, notificationType: 'comment_on_post' },
          type: NotificationType.COMMENT_ADDED,
          content: 'New comment is created in a your post',
        });
      }
    }

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

    // Get old and new mentions if text is being updated
    const oldMentions = extractMentions(comment.text || '');
    const newMentions = extractMentions(data.text || comment.text || '');

    // Update the comment
    Object.assign(comment, data);
    await comment.save();

    // Re-populate createdBy and userReactions.userId
    await comment.populate('createdBy', '-password');
    await comment.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });

    // Handle mentions if text was updated
    if (data.text !== undefined) {
      await this.handleMentionUpdates(
        comment,
        oldMentions,
        newMentions,
        userId,
      );
    }

    return comment;
  }

  private async handleMentionUpdates(
    comment: Comment,
    oldMentions: string[],
    newMentions: string[],
    userId: string,
  ): Promise<void> {
    // Find mentions that were removed
    const removedMentions = oldMentions.filter(
      (mention) => !newMentions.includes(mention),
    );

    // Find mentions that were added
    const addedMentions = newMentions.filter(
      (mention) => !oldMentions.includes(mention),
    );

    console.log('COMMENT MENTION UPDATE:', {
      commentId: (comment as any)._id,
      oldMentions,
      newMentions,
      removedMentions,
      addedMentions,
    });

    // Handle removed mentions - delete their notifications
    if (removedMentions.length > 0) {
      try {
        const removedUsers =
          await this.usersService.findByUsernames(removedMentions);
        for (const user of removedUsers) {
          console.log(
            'Deleting comment mention notification for removed user:',
            (user as any).username,
          );
          this.client.emit('notification.source.deleted', {
            type: 'USER_MENTIONED',
            toUserId: (user as any)._id.toString(),
            fromUserId: userId,
            commentId: (comment as any)._id.toString(),
            data: { commentId: (comment as any)._id.toString() },
          });
        }
      } catch (error) {
        console.error('Error handling removed comment mentions:', error);
      }
    }

    // Handle added mentions - create new notifications
    if (addedMentions.length > 0) {
      try {
        const addedUsers =
          await this.usersService.findByUsernames(addedMentions);
        for (const user of addedUsers) {
          if ((user as any)._id.toString() !== userId) {
            console.log(
              'Creating comment mention notification for new user:',
              (user as any).username,
            );
            this.client.emit('notification.mentioned', {
              toUserId: (user as any)._id.toString(),
              fromUserId: userId,
              data: comment,
              type: NotificationType.USER_MENTIONED,
              content: `mention you in a ${comment.parentCommentId ? 'reply' : 'comment'}`,
            });
          }
        }
      } catch (error) {
        console.error('Error handling added comment mentions:', error);
      }
    }
  }

  async delete(_id: string, userId: string): Promise<void> {
    const comment = await this.commentModel.findById(_id);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.createdBy.toString() !== userId)
      throw new ForbiddenException('You can only delete your own comments');

    // Save comment data before deletion for notifications
    const commentId = String(comment._id);
    const commentData = comment.toObject();

    // 🔥 البحث عن جميع الردود المرتبطة بهذا التعليق قبل حذفها
    const replies = await this.commentModel
      .find({ parentCommentId: _id })
      .lean();
    console.log(
      `[DEBUG] Found ${replies.length} replies to delete with comment ${commentId}`,
    );

    // حذف إشعارات التفاعلات للردود قبل حذف الردود نفسها
    if (replies.length > 0) {
      for (const reply of replies) {
        const replyId = String(reply._id);
        console.log(
          `[DEBUG] Deleting reaction notifications for reply: ${replyId}`,
        );

        // إرسال حدث لحذف إشعارات التفاعلات على هذا الرد
        this.client.emit('notification.source.deleted', {
          type: 'COMMENT_REACTION',
          commentId: replyId,
          isReply: true,
          parentCommentId: commentId,
        });

        // إرسال حدث لحذف إشعارات المنشن في هذا الرد
        this.client.emit('notification.source.deleted', {
          type: 'USER_MENTIONED',
          commentId: replyId,
          isReply: true,
          parentCommentId: commentId,
          text: reply.text || '',
        });
      }
    }

    await this.commentModel.deleteOne({ _id });
    // Optionally, delete all replies to this comment
    await this.commentModel.deleteMany({ parentCommentId: _id });

    // Emit event to remove comment/reply notifications
    // Always delete notification for the comment owner
    this.client.emit('notification.source.deleted', {
      type: 'COMMENT_ADDED',
      toUserId: comment.createdBy.toString(),
      commentId: commentId,
    });

    // Explicitly emit event to delete mention notifications for this comment
    // Include more data to help identify the correct notifications
    this.client.emit('notification.source.deleted', {
      type: 'USER_MENTIONED',
      commentId: commentId,
      commentData: commentData, // Include the full comment data
      text: comment.text, // Include the text which might contain mentions
    });

    // إرسال حدث لحذف إشعارات التفاعلات على التعليق الأصلي
    this.client.emit('notification.source.deleted', {
      type: 'COMMENT_REACTION',
      commentId: commentId,
      isMainComment: true,
    });

    if (comment.parentCommentId) {
      // If this is a reply, delete notification for the parent comment owner
      const parentComment = await this.commentModel.findById(
        comment.parentCommentId,
      );
      if (parentComment) {
        this.client.emit('notification.source.deleted', {
          type: 'COMMENT_ADDED',
          toUserId: parentComment.createdBy.toString(),
          commentId: commentId,
        });
      }
      // Also delete notification for the post owner
      const post = await this.postsService.findOne(comment.postId.toString());
      if (post && post.createdBy) {
        let postOwnerId;
        if (typeof post.createdBy === 'object' && '_id' in post.createdBy) {
          postOwnerId = (post.createdBy as any)._id.toString();
        } else {
          postOwnerId = post.createdBy.toString();
        }
        this.client.emit('notification.source.deleted', {
          type: 'COMMENT_ADDED',
          toUserId: postOwnerId,
          commentId: commentId,
        });
      }
    } else {
      // If this is a top-level comment, also delete notification for the post owner
      const post = await this.postsService.findOne(comment.postId.toString());
      let postOwnerId: string | undefined;
      if (post && post.createdBy) {
        if (typeof post.createdBy === 'object' && '_id' in post.createdBy) {
          postOwnerId = (post.createdBy as any)._id.toString();
        } else {
          postOwnerId = post.createdBy.toString();
        }
        this.client.emit('notification.source.deleted', {
          type: 'COMMENT_ADDED',
          toUserId: postOwnerId,
          commentId: commentId,
        });
      }
    }
  }

  async addOrUpdateReaction(
    commentId: string,
    userId: string,
    username: string,
    reaction: string,
  ): Promise<{ comment: Comment; action: 'add' | 'remove' }> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');

    // Check if user already has the same reaction
    const existingReaction = comment.userReactions.find(
      (ur) => ur.userId.toString() === userId,
    );

    let action: 'add' | 'remove';
    if (existingReaction && existingReaction.reaction === reaction) {
      // Remove the reaction if it's the same
      comment.userReactions = comment.userReactions.filter(
        (ur) => ur.userId.toString() !== userId,
      );
      action = 'remove';
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
      action = 'add';
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

    return { comment, action };
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
