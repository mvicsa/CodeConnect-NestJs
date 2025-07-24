import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { Comment as CommentModel } from './shemas/comment.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ClientProxy } from '@nestjs/microservices';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { AICommentEvaluation } from './shemas/code-suggestion.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    @Inject('RABBITMQ_PRODUCER') private readonly client: ClientProxy,
    @InjectModel(AICommentEvaluation.name) private aiCommentEvalModel: Model<any>,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new comment or reply' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', example: 'Nice post!' },
        code: { type: 'string', example: "console.log('Hello, world!');" },
        codeLang: { type: 'string', example: 'javascript' },
        postId: { type: 'string', example: 'postObjectId' },
        parentCommentId: {
          type: 'string',
          example: 'parentCommentObjectId',
          nullable: true,
        },
        reactions: {
          type: 'object',
          example: { like: 0, love: 0, wow: 0, funny: 0, dislike: 0, happy: 0 },
        },
        userReactions: {
          type: 'array',
          items: { type: 'object' },
          example: [],
        },
      },
      required: ['text', 'postId'],
    },
    description: 'Comment data (without _id, createdBy)',
  })
  @ApiBody({ type: CommentModel, description: 'Comment data (without _id, createdBy)' })
  @ApiResponse({ status: 201, description: 'The created comment or reply', type: CommentModel })
  @ApiBadRequestResponse({ description: 'Invalid comment data.' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Comment already exists.' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: Omit<CommentModel, '_id' | 'createdBy'>,
    @Req() req: Request & { user: any },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid comment data.');
    }
    try {
      return await this.commentsService.create(body, req.user.sub);
    } catch (error) {
      if (error.status === 409) throw new ConflictException('Comment already exists.');
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'Get all top-level comments for a post' })
  @ApiParam({ name: 'postId', type: String })
  @ApiResponse({ status: 200, description: 'List of comments for the post', type: [CommentModel] })
  async findByPost(@Param('postId') postId: string) {
    return this.commentsService.findByPost(postId);
  }

  @Get('replies/:parentCommentId')
  @ApiOperation({ summary: 'Get replies for a comment' })
  @ApiParam({ name: 'parentCommentId', type: String })
  @ApiResponse({ status: 200, description: 'List of replies for the comment', type: [CommentModel] })
  async findReplies(@Param('parentCommentId') parentCommentId: string) {
    return this.commentsService.findReplies(parentCommentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a comment by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'The comment', type: CommentModel })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @Get(':id/ai-evaluation')
  @ApiOperation({ summary: 'Get AI evaluation for a comment' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'AI evaluation for the comment' })
  @ApiNotFoundResponse({ description: 'No AI evaluation available for this comment.' })
  async getAICommentEvaluation(@Param('id') id: string) {
    const evaluation = await this.aiCommentEvalModel.findOne({ commentId: id }).lean();
    if (!evaluation) {
      return { message: 'No AI evaluation available for this comment.' };
    }
    return evaluation;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a comment or reply by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: CommentModel, description: 'Partial comment data' })
  @ApiResponse({ status: 200, description: 'The updated comment or reply', type: CommentModel })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async update(
    @Param('id') id: string,
    @Body() body: Partial<CommentModel>,
    @Req() req: Request & { user: any },
  ) {
    // The mention handling logic is now inside commentsService.update() method
    // So we just call it directly and it will handle mention updates automatically
    return this.commentsService.update(id, body, req.user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a comment or reply by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Comment or reply deleted' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Req() req: Request & { user: any }) {
    await this.commentsService.delete(id, req.user.sub);
    return;
  }

  @Post(':id/reactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add or update a reaction to a comment or reply' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { reaction: { type: 'string', example: 'like' } },
      required: ['reaction'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'The updated comment or reply with new reactions',
  })
  async addReaction(
    @Param('id') commentId: string,
    @Body() body: { reaction: string },
    @Req() req: Request & { user: any },
  ) {
    const { comment: response, action } = await this.commentsService.addOrUpdateReaction(
      commentId,
      req.user.sub,
      req.user.username,
      body.reaction,
    );

    if (action === 'add') {
      const toUserId = (response as any).createdBy?._id
        ? (response as any).createdBy._id.toString()
        : (response as any).createdBy.toString();
      const fromUserId = req.user.sub?.toString();
      if (toUserId !== fromUserId) {
        this.client.emit('comment.reaction', {
          toUserId,
          fromUserId,
          data: { commentId: (response as any)._id?.toString(), _id: (response as any)._id?.toString(), reaction: body.reaction },
          type: NotificationType.COMMENT_REACTION,
          content: 'New reaction added to your comment',
        });
      }
    }
    if (action === 'remove') {
      const toUserId = typeof (response as any).createdBy === 'object' && (response as any).createdBy._id
        ? (response as any).createdBy._id.toString()
        : (response as any).createdBy.toString();
      const fromUserId = typeof req.user.sub === 'object' && req.user.sub._id
        ? req.user.sub._id.toString()
        : req.user.sub.toString();
      const commentId = typeof (response as any)._id === 'object' && (response as any)._id._id
        ? (response as any)._id._id.toString()
        : (response as any)._id?.toString();
      this.client.emit('notification.source.deleted', {
        type: NotificationType.COMMENT_REACTION,
        toUserId,
        fromUserId,
        commentId,
      });
    }
    return response;
  }
}
