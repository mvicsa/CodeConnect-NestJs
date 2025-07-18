import { Controller, Post, UploadedFile, UseGuards, UseInterceptors, Req, Get, Query, Param } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileUploadService } from './file-upload.service';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly fileUploadService: FileUploadService, private readonly chatService: ChatService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req) {
    // Optionally validate file type/size here
    const url = await this.fileUploadService.uploadFile(file);
    return { url };
  }

  @Get(':roomId/messages')
  async getMessages(
    @Param('roomId') roomId: string,
    @Query('limit') limit: string,
    @Query('before') before?: string,
  ) {
    const messages = await this.chatService.getPaginatedMessages(roomId, parseInt(limit) || 20, before);
    return { messages };
  }
} 