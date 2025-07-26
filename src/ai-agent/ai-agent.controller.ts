import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';
import {
  CodeHelpRequestDto,
  CommentEvaluationRequestDto,
} from './dto/code-help-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('AI Agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('code-help')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get suggestions for fixing code problems',
    description:
      '⚠️ This module is still under development and may change in future releases.',
  })
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
    const suggestions =
      await this.aiAgentService.getCodeHelpSuggestions(codeHelpRequest);
    return { suggestions };
  }

  @Post('evaluate-comment-answer')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Evaluate a comment as an answer to a post (question + code)',
    description:
      'Returns Good Answer if the answer is good, or Incorrect Answer with suggestions if not.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns evaluation result',
    type: String,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async evaluateCommentAnswer(
    @Body() evaluationRequest: CommentEvaluationRequestDto,
  ): Promise<{ evaluation: string }> {
    const evaluation =
      await this.aiAgentService.evaluateCommentAnswer(evaluationRequest);
    return { evaluation };
  }
}
