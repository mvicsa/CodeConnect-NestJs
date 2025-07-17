import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Post, PostSchema } from './shemas/post.schema';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { Comment, CommentSchema } from './shemas/comment.schema';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
  ],
  providers: [PostsService, CommentsService],
  controllers: [PostsController, CommentsController],
})
export class PostsModule {} 