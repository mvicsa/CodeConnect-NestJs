import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';
import { MessageType } from '../../messages/schemas/message.schema';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsEnum(MessageType)
  type: MessageType;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsObject()
  @IsOptional()
  fileData?: {
    name?: string;
    size?: number;
    type?: string;
  };

  @IsObject()
  @IsOptional()
  codeData?: {
    code: string;
    language: string;
  };

  @IsString()
  @IsOptional()
  replyTo?: string;
}
