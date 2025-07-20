import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import { CodeHelpRequestDto } from './dto/code-help-request.dto';
import { AiConfig } from './interfaces/ai-config.interface';

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
}
