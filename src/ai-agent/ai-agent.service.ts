import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import { CodeHelpRequestDto } from './dto/code-help-request.dto';
import { AiConfig } from './interfaces/ai-config.interface';
import { CommentEvaluationRequestDto } from './dto/code-help-request.dto';

@Injectable()
export class AiAgentService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AiAgentService.name);
  private readonly aiConfig: AiConfig;

  constructor(private configService: ConfigService) {
    // Initialize OpenAI client with API key from environment variables
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    if (!apiKey) {
      this.logger.error('OpenAI API key not found in environment variables');
    }

    this.aiConfig = {
      apiKey,
      model: this.configService.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
      temperature: Number(
        this.configService.get<string>('OPENAI_TEMPERATURE') || 0.9,
      ),
      maxTokens: Number(
        this.configService.get<string>('OPENAI_MAX_TOKENS') || 500,
      ),
    };

    this.openai = new OpenAI({
      apiKey: this.aiConfig.apiKey,
    });
  }

  /**
   * Get code help suggestions without providing complete solutions
   * @param codeHelpRequest The code help request containing code and description
   * @returns Suggestions on how to fix the code problem
   */
  async getCodeHelpSuggestions(
    codeHelpRequest: CodeHelpRequestDto,
  ): Promise<string> {
    try {
      const { code, description, language } = codeHelpRequest;

      const response = await this.openai.chat.completions.create({
        model: this.aiConfig.model,
        temperature: Number(this.aiConfig.temperature), // Ensure this is a number
        max_tokens: Number(this.aiConfig.maxTokens), // Ensure this is a number
        messages: [
          {
            role: 'system',
            content: `You are a helpful coding assistant that provides guidance on fixing code problems. 
            You should ONLY suggest approaches, concepts, or debugging techniques that could help solve the problem. 
            DO NOT provide complete solutions or write code for the user. 
            Focus on explaining the potential issues and pointing the user in the right direction.
            Use bullet points for clarity when appropriate.`,
          },
          {
            role: 'user',
            content: `I have a problem with my ${language} code: 
            
            \`\`\`${language}
            ${code}
            \`\`\`
            
            Problem description: ${description}
            
            Please suggest how I might fix this issue WITHOUT giving me the complete solution or writing code for me.`,
          },
        ],
      });

      return (
        response.choices[0]?.message?.content || 'No suggestions available'
      );
    } catch (error) {
      this.logger.error(
        `Error getting code help suggestions: ${error.message}`,
      );
      throw new Error('Failed to get code help suggestions');
    }
  }

  /**
   * Evaluate a comment as an answer to a post (question + code)
   * @param evaluationRequest The evaluation request containing post and comment data
   * @returns Evaluation result: Good Answer, Incorrect Answer with suggestions, or corrections
   */
  async evaluateCommentAnswer(
    evaluationRequest: CommentEvaluationRequestDto,
  ): Promise<string> {
    try {
      const { postText, postCode, commentText, commentCode, language } =
        evaluationRequest;
      const response = await this.openai.chat.completions.create({
        model: this.aiConfig.model,
        temperature: Number(this.aiConfig.temperature),
        max_tokens: Number(this.aiConfig.maxTokens),
        messages: [
          {
            role: 'system',
            content: `You are an expert code reviewer. The post below is a question (with text and code). The comment is an answer (with text and code). Your job is to:
- Judge if the answer is correct and complete, partially correct, or incorrect.
- If the answer is fully correct, reply ONLY with: Good Answer.
- If the answer uses the correct function, method, or approach, but is missing arguments, details, or has minor mistakes, reply ONLY with: I agree with you, but... and then explain what is missing or could be improved, even if the answer is not fully correct.
- If the answer is incorrect, reply ONLY with: Incorrect Answer. Then, explain what is wrong and provide suggestions or corrections.
- For example, if the question is about console.log("Hello") and the answer is console.log(), reply: I agree with you, but... you need to provide the value to log, e.g., console.log("Hello").
- Be concise and clear. Do not repeat the question or answer in your reply.`,
          },
          {
            role: 'user',
            content: `POST (Question):\nText: ${postText}\n\nCode:\n\u0060\u0060\u0060${language}\n${postCode}\n\u0060\u0060\u0060\n\nCOMMENT (Answer):\nText: ${commentText}\n\nCode:\n\u0060\u0060\u0060${language}\n${commentCode}\n\u0060\u0060\u0060`,
          },
        ],
      });
      return response.choices[0]?.message?.content || 'No evaluation available';
    } catch (error) {
      this.logger.error(`Error evaluating comment answer: ${error.message}`);
      throw new Error('Failed to evaluate comment answer');
    }
  }
}
