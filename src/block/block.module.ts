import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlockController } from './block.controller';
import { BlockService } from './block.service';
import { Block, BlockSchema } from './block.schema';
import { BlockGuard } from './guards/block.guard';
import { BlockFilterInterceptor } from './interceptors/block-filter.interceptor';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Block.name, schema: BlockSchema },
    ]),
    UsersModule,
  ],
  controllers: [BlockController],
  providers: [BlockService, BlockGuard, BlockFilterInterceptor],
  exports: [BlockService, BlockGuard, BlockFilterInterceptor],
})
export class BlockModule {}