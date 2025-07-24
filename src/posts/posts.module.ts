import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './shemas/post.schema';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { Comment, CommentSchema } from './shemas/comment.schema';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import {
  CodeSuggestion,
  CodeSuggestionSchema,
} from './shemas/code-suggestion.schema';
import { RabbitMQModule } from 'src/rabbitmq/rabbitmq.module';
import { UsersModule } from '../users/users.module';
import { AICommentEvaluation, AICommentEvaluationSchema } from './shemas/code-suggestion.schema';

@Module({
  imports: [
    RabbitMQModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: CodeSuggestion.name, schema: CodeSuggestionSchema },
      { name: AICommentEvaluation.name, schema: AICommentEvaluationSchema }, // Register new schema
    ]),
    AiAgentModule,
    UsersModule,
  ],
  providers: [PostsService, CommentsService],
  controllers: [PostsController, CommentsController],
  
})
export class PostsModule {}
