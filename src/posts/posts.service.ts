import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Schema as MongooseSchema } from 'mongoose';
import { Post, PostDocument } from './shemas/post.schema';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import {
  CodeSuggestion,
  CodeSuggestionDocument,
} from './shemas/code-suggestion.schema';
import { Comment, CommentDocument } from './shemas/comment.schema';
import { AICommentEvaluation } from './shemas/code-suggestion.schema';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(CodeSuggestion.name)
    private codeSuggestionModel: Model<CodeSuggestionDocument>,
    private aiAgentService: AiAgentService,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>, // Inject Comment model
    @InjectModel(AICommentEvaluation.name) private aiCommentEvalModel: Model<any>, // Inject AICommentEvaluation model
  ) {}

  async findAll(page = 1, limit = 10): Promise<Post[]> {
    const posts = await this.postModel
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

    return posts;
  }

  async findOne(_id: string): Promise<Post> {
    const post = await this.postModel
      .findById(_id)
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      });

    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  private validateTags(tags?: any[]): void {
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag !== 'string' || tag.length > 15) {
          throw new BadRequestException('Each tag must be a string with a maximum length of 15 characters.');
        }
      }
    }
  }

  async create(data: Omit<Post, 'createdBy'>, userId: string): Promise<Post> {
    this.validateTags(data.tags);
    const created = new this.postModel({ ...data, createdBy: userId });
    await created.save();

    // Populate createdBy and userReactions.userId before returning
    await created.populate('createdBy', '-password');
    await created.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });

    // If post contains code, generate AI suggestions synchronously
    if (created.code && created.codeLang) {
      try {
        const suggestions = await this.aiAgentService.getCodeHelpSuggestions({
          code: created.code,
          description:
            'Analyze this code and provide suggestions for improvements or potential issues',
          language: created.codeLang,
        });

        // Save suggestions to database
        const codeSuggestion = new this.codeSuggestionModel({
          postId: created._id,
          suggestions,
        });
        await codeSuggestion.save();

        // Update the post to indicate it has AI suggestions
        await this.postModel.findByIdAndUpdate(created._id, {
          hasAiSuggestions: true,
        });
      } catch (error) {
        console.error('Error generating code suggestions:', error);
        // Even if AI suggestion fails, we still return the post
      }
    }

    return created;
  }

  // Get code suggestions for a post
  async getCodeSuggestions(postId: string): Promise<CodeSuggestion | null> {
    const suggestion = await this.codeSuggestionModel.findOne({
      postId: new Types.ObjectId(postId),
    });
    return suggestion;
  }

  async update(
    _id: string,
    data: Partial<Post>,
    userId: string,
  ): Promise<Post> {
    this.validateTags(data.tags);
    const post = await this.postModel.findById(_id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.createdBy.toString() !== userId)
      throw new ForbiddenException('You can only edit your own posts');
    Object.assign(post, data);
    await post.save();
    // Re-populate createdBy and userReactions.userId
    await post.populate('createdBy', '-password');
    await post.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });
    return post;
  }

  async delete(_id: string, userId: string): Promise<void> {
    const post = await this.postModel.findById(_id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.createdBy.toString() !== userId)
      throw new ForbiddenException('You can only delete your own posts');
    await this.postModel.deleteOne({ _id });
  }

  async findByTag(tag: string): Promise<Post[]> {
    return this.postModel.find({ tags: { $regex: new RegExp(`^${tag}$`, 'i') } })

      .sort({ createdAt: -1 })
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async findByUser(userId: string): Promise<Post[]> {
    return this.postModel
      .find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();
  }

  async findByContentType(
    type: 'code' | 'video' | 'image',
    page = 1,
    limit = 10,
  ): Promise<Post[]> {
    const query: any = {};
    query[type] = {
      $exists: true,
      $ne: null,
      $regex: new RegExp('\\S'), // at least one non-whitespace character
    };
    return this.postModel
      .find(query)
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

  async addOrUpdateReaction(
    postId: string,
    userId: string,
    username: string,
    reaction: string,
  ): Promise<{ post: Post; action: 'add' | 'remove' }> {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');

    // Check if user already has the same reaction
    const existingReaction = post.userReactions.find(
      (ur) => ur.userId.toString() === userId,
    );

    let action: 'add' | 'remove';
    if (existingReaction && existingReaction.reaction === reaction) {
      // Remove the reaction if it's the same
      post.userReactions = post.userReactions.filter(
        (ur) => ur.userId.toString() !== userId,
      );
      action = 'remove';
    } else {
      // Remove any existing reaction by this user and add the new one
      post.userReactions = post.userReactions.filter(
        (ur) => ur.userId.toString() !== userId,
      );
      post.userReactions.push({
        userId: new Types.ObjectId(userId),
        username,
        reaction,
        createdAt: new Date(),
      });
      action = 'add';
    }

    // Update the reactions count
    const reactionTypes = ['like', 'love', 'wow', 'funny', 'dislike', 'happy'];
    post.reactions = reactionTypes.reduce((acc, type) => {
      acc[type] = post.userReactions.filter(
        (ur) => ur.reaction === type,
      ).length;
      return acc;
    }, {} as any);

    await post.save();

    // Populate userReactions.userId and createdBy before returning
    await post.populate('createdBy', '-password');
    await post.populate({
      path: 'userReactions.userId',
      select: '_id firstName lastName avatar role',
    });

    return { post, action };
  }

  // Remove getAllTags and add trending tags
  async getTrendingTags(): Promise<{ name: string; count: number }[]> {
    try {
      const result = await this.postModel.aggregate([
        { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { _id: 0, name: '$_id', count: 1 } }
      ]);
      return result;
    } catch (error) {
      console.error('Error in getTrendingTags:', error.message, error.stack);
      return [];
    }
  }

  /**
   * Finds posts that have code and at least one comment with hasAiEvaluation true (i.e., a 'Great Answer from AI').
   * Returns paginated results with comments that have aiComment field.
   */
  async findArchivePosts(page = 1, limit = 10, search?: string): Promise<Post[]> {
    // Step 1: Find all postIds that have at least one comment with hasAiEvaluation true and "Good Answer" evaluation
    const aiCommented = await this.commentModel.aggregate([
      { $match: { hasAiEvaluation: true } },
      {
        $lookup: {
          from: 'aicommentevaluations',
          localField: '_id',
          foreignField: 'commentId',
          as: 'evaluation'
        }
      },
      { $unwind: '$evaluation' },
      { $match: { 'evaluation.evaluation': { $regex: /^Good Answer/i } } },
      { $group: { _id: '$postId' } },
    ]);
    const postIds = aiCommented.map((doc) => doc._id);
    if (!postIds.length) return [];

    // Step 2: Find posts with code and in the above postIds, with optional search
    const postQuery: any = {
      _id: { $in: postIds },
      code: { $exists: true, $ne: null, $regex: /\S/ },
    };

    // Add search filter if provided
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      postQuery.$or = [
        { text: searchRegex },
        { code: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    const posts = await this.postModel
      .find(postQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', '-password')
      .populate({
        path: 'userReactions.userId',
        select: '_id firstName lastName avatar role',
      })
      .exec();

    // Step 3: For each post, fetch top-level comments and add aiComment field
    const postsWithComments = await Promise.all(
      posts.map(async (post) => {
        // Get top-level comments for this post that have AI evaluation
        const comments = await this.commentModel
          .find({ 
            postId: post._id,
            parentCommentId: null, // Only top-level comments
            hasAiEvaluation: true // Only comments with AI evaluation
          })
          .populate('createdBy', '-password')
          .populate({
            path: 'userReactions.userId',
            select: '_id firstName lastName avatar role',
          })
          .sort({ createdAt: -1 })
          .exec();

        // Add aiComment field to each comment and filter for "Good Answer" evaluations
        const commentsWithAiFlag = await Promise.all(comments.map(async (comment) => {
          const commentObj = comment.toObject() as any;
          
          // Add name field to createdBy user data
          if (commentObj.createdBy && commentObj.createdBy.firstName && commentObj.createdBy.lastName) {
            commentObj.createdBy.name = `${commentObj.createdBy.firstName} ${commentObj.createdBy.lastName}`;
          }
          
          // Fetch the AI evaluation data
          const aiEvaluation = await this.aiCommentEvalModel.findOne({ 
            commentId: comment._id 
          }).lean();
          
          // Only include comments with "Good Answer" evaluation (must start with "Good Answer")
          if (aiEvaluation && (aiEvaluation as any).evaluation && /^Good Answer/i.test((aiEvaluation as any).evaluation)) {
            commentObj.aiComment = aiEvaluation;
            return commentObj;
          } else {
            return null; // Filter out comments that don't have "Good Answer" evaluation
          }
        }));

        // Filter out null comments (those without "Good Answer" evaluation)
        const filteredComments = commentsWithAiFlag.filter(comment => comment !== null);

        // Attach comments to the post object
        const postWithComments = post.toObject() as any;
        postWithComments.comments = filteredComments;
        
        return postWithComments;
      })
    );

    return postsWithComments;
  }
} 

