import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { PostsService } from './posts.service';
import { Post as PostModel } from './shemas/post.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all posts with pagination or filter by content type' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'type', required: false, enum: ['code', 'video', 'image'], description: 'Filter posts by content type' })
  @ApiResponse({ status: 200, description: 'List of posts' })
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('type') type?: 'code' | 'video' | 'image',
  ) {
    if (type) {
      return this.postsService.findByContentType(type, Number(page), Number(limit));
    }
    const posts = await this.postsService.findAll(Number(page), Number(limit));
    return posts;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a post by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'The post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
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
  async getByUser(@Param('userId') userId: string) {
    return this.postsService.findByUser(userId);
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
        tags: { type: 'array', items: { type: 'string' }, example: ['swagger', 'test', 'api'] },
        reactions: { type: 'object', example: { like: 0, love: 0, wow: 0, funny: 0, dislike: 0, happy: 0 } },
        userReactions: { type: 'array', items: { type: 'object' }, example: [] },
        image: { type: 'string', example: 'https://example.com/image.png' },
        video: { type: 'string', example: 'https://example.com/video.mp4' }
      },
      required: ['text', 'tags']
    },
    description: 'Post data (without _id, createdBy)'
  })
  @ApiResponse({ status: 201, description: 'The created post' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: Omit<PostModel, '_id' | 'createdBy'>, @Req() req: Request & { user: any }) {
    return this.postsService.create(body, req.user.sub);
  }

  @Post(':id/reactions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add or update a reaction to a post' })
  @ApiBody({ schema: { type: 'object', properties: { reaction: { type: 'string', example: 'like' } }, required: ['reaction'] } })
  @ApiResponse({ status: 200, description: 'The updated post with new reactions' })
  async addReaction(
    @Param('id') postId: string,
    @Body() body: { reaction: string },
    @Req() req: Request & { user: any }
  ) {
    return this.postsService.addOrUpdateReaction(postId, req.user.sub, req.user.username, body.reaction);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a post by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: Object, description: 'Partial post data' })
  @ApiResponse({ status: 200, description: 'The updated post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async update(@Param('id') id: string, @Body() body: Partial<PostModel>, @Req() req: Request & { user: any }) {
    return this.postsService.update(id, body, req.user.sub);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a post by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Post deleted' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Req() req: Request & { user: any }) {
    await this.postsService.delete(id, req.user.sub);
    return;
  }
} 