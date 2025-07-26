import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Spark, SparkDocument } from './spark.schema';

@Injectable()
export class SparksService {
  constructor(@InjectModel(Spark.name) private sparkModel: Model<SparkDocument>) {}

  async create(data) {
    const spark = await this.sparkModel.create(data);
    await spark.populate('owner', '-password');
    return spark;
  }

  async findOne(id: string) {
    const spark = await this.sparkModel.findById(id)
      .populate('owner', '-password')
      .populate({
        path: 'forkedFrom',
        select: '_id owner',
        populate: { path: 'owner', select: 'username' }
      });
    if (!spark) throw new NotFoundException('Spark not found');
    return spark;
  }

  async update(id: string, data, userId: string) {
    const spark = await this.sparkModel.findById(id);
    if (!spark) throw new NotFoundException('Spark not found');
    if (spark.owner.toString() !== userId) throw new ForbiddenException('Not your spark');
    Object.assign(spark, data);
    await spark.save();
    await spark.populate('owner', '-password');
    return spark;
  }

  async delete(id: string, userId: string) {
    const spark = await this.sparkModel.findById(id);
    if (!spark) throw new NotFoundException('Spark not found');
    if (spark.owner.toString() !== userId) throw new ForbiddenException('Not your spark');
    await spark.deleteOne();
    return { success: true };
  }

  async findByUser(userId: string) {
    return this.sparkModel.find({ owner: userId }).populate('owner', '-password');
  }

  async rateSpark(id: string, userId: string, value: number) {
    const spark = await this.sparkModel.findById(id);
    if (!spark) throw new NotFoundException('Spark not found');
    if (spark.owner.toString() === userId) throw new ForbiddenException('You cannot rate your own spark');
    // Remove any existing rating by this user
    spark.ratings = spark.ratings.filter(r => r.userId.toString() !== userId);
    // Add new rating
    spark.ratings.push({ userId: new Types.ObjectId(userId), value });
    // Recalculate average
    spark.averageRating =
      spark.ratings.reduce((sum, r) => sum + r.value, 0) / spark.ratings.length;
    await spark.save();
    return { averageRating: spark.averageRating, ratingsCount: spark.ratings.length };
  }

  async getRatings(id: string) {
    const spark = await this.sparkModel.findById(id);
    if (!spark) throw new NotFoundException('Spark not found');
    return { ratings: spark.ratings, averageRating: spark.averageRating };
  }

  async findAll(page = 1, limit = 10) {
    return this.sparkModel
      .find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', '-password')
      .populate({
        path: 'forkedFrom',
        select: 'owner',
        populate: { path: 'owner', select: 'username' }
      });
  }

  async forkSpark(id: string, userId: string) {
    const original = await this.sparkModel.findById(id);
    if (!original) throw new NotFoundException('Spark not found');
    const forked = await this.sparkModel.create({
      files: original.files,
      title: original.title + ' (fork)',
      description: original.description,
      previewImage: original.previewImage,
      owner: userId,
      isPublic: original.isPublic,
      forkedFrom: original._id,
    });
    await forked.populate('owner', '-password');
    await forked.populate({
      path: 'forkedFrom',
      select: '_id owner',
      populate: { path: 'owner', select: 'username' }
    });
    return forked;
  }
} 