import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';
import { CodeHelpRequestDto } from './dto/code-help-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('AI Agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('code-help')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get suggestions for fixing code problems' })
  @ApiResponse({
    status: 200,
    description: 'Returns suggestions on how to fix the code problem',
    type: String,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getCodeHelpSuggestions(
    @Body() codeHelpRequest: CodeHelpRequestDto,
  ): Promise<{ suggestions: string }> {
    const suggestions = await this.aiAgentService.getCodeHelpSuggestions(
      codeHelpRequest,
    );
    return { suggestions };
  }
} 