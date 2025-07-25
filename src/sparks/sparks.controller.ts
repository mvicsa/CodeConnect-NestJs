import { Controller, Get, Post, Put, Delete, Param, Body, Req, UseGuards, Query } from '@nestjs/common';
import { SparksService } from './sparks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Sparks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sparks')
export class SparksController {
  constructor(private readonly sparksService: SparksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new spark' })
  @ApiBody({ schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, files: { type: 'object' }, isPublic: { type: 'boolean' }, previewImage: { type: 'string' } }, required: ['title', 'files', 'previewImage'] } })
  @ApiResponse({ status: 201, description: 'The created spark' })
  async create(@Body() body, @Req() req) {
    try {
      return await this.sparksService.create({ ...body, owner: req.user.sub });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return { statusCode: 400, message: error.message, error: 'Bad Request' };
      }
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all sparks with pagination' })
  @ApiResponse({ status: 200, description: 'List of all sparks' })
  async findAll(@Query('page') page = '1', @Query('limit') limit = '10', @Req() req) {
    try {
      return await this.sparksService.findAll(Number(page), Number(limit));
    } catch (error) {
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a spark by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'The spark' })
  async findOne(@Param('id') id: string) {
    try {
      return await this.sparksService.findOne(id);
    } catch (error) {
      if (error.status === 404) {
        return { statusCode: 404, message: 'Spark not found', error: error.message };
      }
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a spark' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, files: { type: 'object' }, isPublic: { type: 'boolean' }, previewImage: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'The updated spark' })
  async update(@Param('id') id: string, @Body() body, @Req() req) {
    try {
      return await this.sparksService.update(id, body, req.user.sub);
    } catch (error) {
      if (error.status === 403) {
        return { statusCode: 403, message: 'Forbidden', error: error.message };
      }
      if (error.status === 404) {
        return { statusCode: 404, message: 'Spark not found', error: error.message };
      }
      if (error.name === 'ValidationError') {
        return { statusCode: 400, message: error.message, error: 'Bad Request' };
      }
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a spark' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Spark deleted' })
  async delete(@Param('id') id: string, @Req() req) {
    try {
      return await this.sparksService.delete(id, req.user.sub);
    } catch (error) {
      if (error.status === 403) {
        return { statusCode: 403, message: 'Forbidden', error: error.message };
      }
      if (error.status === 404) {
        return { statusCode: 404, message: 'Spark not found', error: error.message };
      }
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all sparks for a user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiResponse({ status: 200, description: 'List of sparks for the user' })
  async findByUser(@Param('userId') userId: string) {
    try {
      return await this.sparksService.findByUser(userId);
    } catch (error) {
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Rate a spark' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: { type: 'object', properties: { value: { type: 'number', example: 5 } }, required: ['value'] } })
  @ApiResponse({ status: 200, description: 'Rating result' })
  async rateSpark(@Param('id') id: string, @Body('value') value: number, @Req() req) {
    try {
      return await this.sparksService.rateSpark(id, req.user.sub, value);
    } catch (error) {
      if (error.status === 403) {
        return { statusCode: 403, message: 'Forbidden', error: error.message };
      }
      if (error.status === 404) {
        return { statusCode: 404, message: 'Spark not found', error: error.message };
      }
      if (error.name === 'ValidationError') {
        return { statusCode: 400, message: error.message, error: 'Bad Request' };
      }
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Get(':id/ratings')
  @ApiOperation({ summary: 'Get all ratings for a spark' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Ratings and average rating' })
  async getRatings(@Param('id') id: string) {
    try {
      return await this.sparksService.getRatings(id);
    } catch (error) {
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }

  @Post(':id/fork')
  @ApiOperation({ summary: 'Fork a spark' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 201, description: 'The forked spark' })
  async forkSpark(@Param('id') id: string, @Req() req) {
    try {
      return await this.sparksService.forkSpark(id, req.user.sub);
    } catch (error) {
      if (error.status === 404) {
        return { statusCode: 404, message: 'Spark not found', error: error.message };
      }
      return { statusCode: 500, message: 'Internal server error', error: error.message };
    }
  }
} 