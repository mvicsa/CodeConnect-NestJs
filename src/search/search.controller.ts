import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Search results.' })
  @ApiBadRequestResponse({
    description: 'Missing or invalid search query (q).',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async search(
    @Query('q') q: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    if (!q || typeof q !== 'string' || !q.trim()) {
      throw new BadRequestException('Missing or invalid search query (q)');
    }
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    let limitNum = Math.max(1, parseInt(limit as string, 10) || 10);
    if (limitNum > 50) limitNum = 50;
    // Only return public/allowed results (for now, all are public)
    const result = await this.searchService.searchAll(q, pageNum, limitNum);
    return result;
  }
}
