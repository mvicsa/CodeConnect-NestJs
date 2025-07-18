import { Injectable } from '@nestjs/common';
import { S3 } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FileUploadService {
  private s3 = new S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });
  private bucket: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET!;
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET environment variable is not set');
    }
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const key = `${uuidv4()}-${file.originalname}`;
    await this.s3
      .putObject({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      })
      .promise();
    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }
} 