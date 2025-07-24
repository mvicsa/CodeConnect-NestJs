import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';

@Module({
  imports: [ConfigModule],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService], // Export service for use in other modules
})
export class AiAgentModule {}
