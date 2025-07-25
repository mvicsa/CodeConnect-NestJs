import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Inject,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { Post as PostModel } from './shemas/post.schema';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { NotificationType } from 'src/notification/entities/notification.schema';
import { UsersService } from '../users/users.service';
import { AICommentEvaluation } from './shemas/code-suggestion.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

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

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    @Inject('RABBITMQ_PRODUCER') private readonly client: ClientProxy,
    private readonly usersService: UsersService,
    @InjectModel(AICommentEvaluation.name)
    private aiCommentEvalModel: Model<any>,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get all posts with pagination or filter by content type',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['code', 'video', 'image'],
    description: 'Filter posts by content type',
  })
  @ApiResponse({ status: 200, description: 'List of posts', type: [PostModel] })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('type') type?: 'code' | 'video' | 'image',
  ) {
    if (isNaN(Number(page)) || isNaN(Number(limit))) {
      throw new BadRequestException('Invalid pagination parameters.');
    }
    if (type && !['code', 'video', 'image'].includes(type)) {
      throw new BadRequestException('Invalid type parameter.');
    }
    try {
      if (type) {
        return this.postsService.findByContentType(
          type,
          Number(page),
          Number(limit),
        );
      }
      const posts = await this.postsService.findAll(
        Number(page),
        Number(limit),
      );
      return posts;
    } catch (error) {
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Get('tags')
  @ApiOperation({ summary: 'Get trending tags (top 10 most used)' })
  @ApiResponse({
    status: 200,
    description: 'List of trending tags with usage count',
    type: [Object],
  })
  async getTrendingTags() {
    return this.postsService.getTrendingTags();
  }

  @Get('archive')
  @ApiOperation({ summary: 'Get archived posts with comments (posts with code and at least one comment with Great Answer from AI)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in post text, code, or tags' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of archived posts with comments. AI comments are marked with aiComment field.', 
    schema: {
      type: 'array',
      items: {
        allOf: [
          { $ref: '#/components/schemas/Post' },
          {
            type: 'object',
            properties: {
              comments: {
                type: 'array',
                items: {
                  allOf: [
                    { $ref: '#/components/schemas/Comment' },
                    {
                      type: 'object',
                      properties: {
                        aiComment: {
                          type: 'object',
                          nullable: true,
                          description: 'AI comment data if this comment has AI evaluation (Great Answer from AI), null otherwise'
                        }
                      }
                    }
                  ]
                },
                description: 'Comments with AI comments marked'
              }
            }
          }
        ]
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
  async getArchive(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    if (isNaN(Number(page)) || isNaN(Number(limit))) {
      throw new BadRequestException('Invalid query parameters.');
    }
    try {
      return await this.postsService.findArchivePosts(Number(page), Number(limit), search);
    } catch (error) {
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a post by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'The post', type: PostModel })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiBadRequestResponse({ description: 'Invalid post ID.' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
  async findOne(@Param('id') id: string) {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('Invalid post ID.');
    }
    try {
      return await this.postsService.findOne(id);
    } catch (error) {
      if (error.status === 404) throw new NotFoundException('Post not found');
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Get('tag/:tag')
  @ApiOperation({ summary: 'Get posts by tag' })
  @ApiParam({ name: 'tag', type: String })
  @ApiResponse({ status: 200, description: 'List of posts with the given tag' })
  async getByTag(@Param('tag') tag: string) {
    return this.postsService.findByTag(tag);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get posts by userId' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'List of posts by the given user' })
  @ApiBadRequestResponse({ description: 'Invalid user ID.' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
  async getByUser(@Param('userId') userId: string) {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('Invalid user ID.');
    }
    try {
      return await this.postsService.findByUser(userId);
    } catch (error) {
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new post' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', example: 'This is a test post from Swagger!' },
        code: { type: 'string', example: "console.log('Hello, world!');" },
        codeLang: { type: 'string', example: 'javascript' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          example: ['swagger', 'test', 'api'],
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
        image: { type: 'string', example: 'https://example.com/image.png' },
        video: { type: 'string', example: 'https://example.com/video.mp4' },
      },
      required: ['text', 'tags'],
    },
    description: 'Post data (without _id, createdBy)',
  })
  @ApiResponse({
    status: 201,
    description: 'The created post',
    type: PostModel,
  })
  @ApiBadRequestResponse({ description: 'Invalid post data.' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Post already exists.' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: Omit<PostModel, '_id' | 'createdBy'>,
    @Req() req: Request & { user: any },
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid post data.');
    }
    try {
      const response = await this.postsService.create(body, req.user.sub);
      // Mention notifications
      // Process mentions for notifications
      const mentions = extractMentions(String(response.text));
      if (mentions.length > 0) {
        const mentionedUsers = await this.usersService.findByUsernames(
          mentions as string[],
        );
        for (const user of mentionedUsers) {
          // Emit mention notification
          if ((user as any)._id.toString() !== req.user.sub) {
            this.client.emit('notification.mentioned', {
              toUserId: (user as any)._id.toString(),
              fromUserId: req.user.sub,
              data: response,
              type: NotificationType.USER_MENTIONED,
              content: `mention you in a post`,
            });
          }
        }
      }
      // Send notification for new post to followers
      console.log('🔥 Emitting post.created event for user:', req.user.sub);
      console.log('📝 Post data:', response);
      console.log('🆔 Post ID:', (response as any)._id || (response as any).id);
      
      const notificationData = {
        toUserId: extractObjectId(response.createdBy),
        data: {
          ...response,
          postId: (response as any)._id || (response as any).id
        },
        fromUserId: req.user.sub,
        type: NotificationType.POST_CREATED,
        content: 'New post created',
      };
      
      this.client.emit('post.created', notificationData);
      
      console.log('✅ post.created event emitted successfully');
      return response;
    } catch (error) {
      if (error instanceof BadRequestException) {
        // Return the error message in a consistent format for the frontend
        throw new BadRequestException(error.message || 'Invalid request.');
      }
      if (error.status === 409) throw new ConflictException('Post already exists.');
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Post(':id/reactions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add or update a reaction to a post' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { reaction: { type: 'string', example: 'like' } },
      required: ['reaction'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'The updated post with new reactions',
  })
  async addReaction(
    @Param('id') postId: string,
    @Body() body: { reaction: string },
    @Req() req: Request & { user: any },
  ) {
    const { post: response, action } =
      await this.postsService.addOrUpdateReaction(
        postId,
        req.user.sub,
        req.user.username,
        body.reaction,
      );

    // ابعت الإشعار فقط لو الريأكشن اتضاف
    if (action === 'add') {
      const postId = (response as any)._id
        ? (response as any)._id.toString()
        : (response as any).id?.toString();
      // Prevent self-notification for post.reaction
      if (extractObjectId(response.createdBy) !== req.user.sub) {
        this.client.emit('post.reaction', {
          toUserId: extractObjectId(response.createdBy),
          data: { postId, reaction: body.reaction },
          fromUserId: req.user.sub,
          type: NotificationType.POST_REACTION,
          content: 'New reaction added to your post',
        });
        console.log('we emitted the post.reaction event emojied', response);
      }
    }
    // أضف هذا الجزء لحذف الإشعار عند إلغاء الريأكشن
    if (action === 'remove') {
      const toUserId = extractObjectId(response.createdBy);
      const fromUserId = req.user.sub?.toString();
      const postId = (response as any)._id?.toString();
      this.client.emit('notification.source.deleted', {
        type: NotificationType.POST_REACTION,
        toUserId,
        fromUserId,
        postId,
      });
      console.log(
        'we emitted the notification.source.deleted event for post reaction removal',
        response,
      );
    }
    return response;
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a post by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: PostModel, description: 'Partial post data' })
  @ApiResponse({
    status: 200,
    description: 'The updated post',
    type: PostModel,
  })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiForbiddenResponse({ description: 'You can only edit your own posts' })
  async update(
    @Param('id') id: string,
    @Body() body: Partial<PostModel>,
    @Req() req: Request & { user: any },
  ) {
    try {
      return await this.postsService.update(id, body, req.user.sub);
    } catch (error) {
      if (error instanceof HttpException) {
        throw new HttpException(error.message || 'Request failed', error.getStatus ? error.getStatus() : 400);
      }
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a post by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Post deleted' })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiForbiddenResponse({ description: 'You can only delete your own posts' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Req() req: Request & { user: any }) {
    try {
      await this.postsService.delete(id, req.user.sub);
      // Emit event to delete all notifications related to this post
      this.client.emit('notification.source.deleted', {
        type: 'POST',
        postId: id,
      });
      return;
    } catch (error) {
      if (error instanceof HttpException) {
        throw new HttpException(error.message || 'Request failed', error.getStatus ? error.getStatus() : 400);
      }
      throw new InternalServerErrorException('Internal server error.');
    }
  }

  @Get(':id/code-suggestions')
  @ApiOperation({ summary: 'Get AI code suggestions for a post' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Code suggestions for the post' })
  @ApiNotFoundResponse({
    description: 'Post not found or no suggestions available',
  })
  async getCodeSuggestions(@Param('id') id: string) {
    const suggestion = await this.postsService.getCodeSuggestions(id);
    if (!suggestion) {
      return { message: 'No suggestions available for this post.' };
    }
    return suggestion;
  }
}
