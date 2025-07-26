import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Spark, SparkSchema } from './spark.schema';
import { SparksService } from './sparks.service';
import { SparksController } from './sparks.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Spark.name, schema: SparkSchema },
    ]),
    UsersModule,
  ],
  providers: [SparksService],
  controllers: [SparksController],
  exports: [SparksService],
})
export class SparksModule {} 