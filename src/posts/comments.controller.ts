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
} from '@nestjs/swagger';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

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
  @ApiResponse({ status: 201, description: 'The created comment or reply' })
  async create(
    @Body() body: Omit<CommentModel, '_id' | 'createdBy'>,
    @Req() req: Request & { user: any },
  ) {
    return this.commentsService.create(body, req.user.sub);
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'Get all top-level comments for a post' })
  @ApiParam({ name: 'postId', type: String })
  @ApiResponse({ status: 200, description: 'List of comments for the post' })
  async findByPost(@Param('postId') postId: string) {
    return this.commentsService.findByPost(postId);
  }

  @Get('replies/:parentCommentId')
  @ApiOperation({ summary: 'Get replies for a comment' })
  @ApiParam({ name: 'parentCommentId', type: String })
  @ApiResponse({ status: 200, description: 'List of replies for the comment' })
  async findReplies(@Param('parentCommentId') parentCommentId: string) {
    return this.commentsService.findReplies(parentCommentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a comment by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'The comment' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a comment or reply by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: Object, description: 'Partial comment data' })
  @ApiResponse({ status: 200, description: 'The updated comment or reply' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  async update(
    @Param('id') id: string,
    @Body() body: Partial<CommentModel>,
    @Req() req: Request & { user: any },
  ) {
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
    return this.commentsService.addOrUpdateReaction(
      commentId,
      req.user.sub,
      req.user.username,
      body.reaction,
    );
  }
}
