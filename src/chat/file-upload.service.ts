import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export interface UploadedFileDoc {
  _id: string;
  data: string; // base64
  mimetype: string;
  originalname: string;
}

@Injectable()
export class FileUploadService {
  constructor(
    @InjectModel('UploadedFile') private fileModel: Model<UploadedFileDoc>,
  ) {}

  async uploadBase64File(
    base64: string,
    mimetype: string,
    originalname: string,
  ): Promise<string> {
    const file = await this.fileModel.create({
      data: base64,
      mimetype,
      originalname,
    });
    return file._id.toString();
  }

  async getFileById(id: string): Promise<UploadedFileDoc | null> {
    return this.fileModel.findById(id).exec();
  }
}
