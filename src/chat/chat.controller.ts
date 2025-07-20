import { Controller, Post, UploadedFile, UseGuards, UseInterceptors, Req, Get, Query, Param, Body, Res, HttpStatus, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileUploadService } from './file-upload.service';
import { ChatService } from './chat.service';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags('chat')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly fileUploadService: FileUploadService, private readonly chatService: ChatService) {}

  @Post('uploadBase64')
  async uploadBase64File(
    @Body('base64') base64: string,
    @Body('mimetype') mimetype: string,
    @Body('originalname') originalname: string,
  ) {
    const fileId = await this.fileUploadService.uploadBase64File(base64, mimetype, originalname);
    return { url: `/chat/file/${fileId}` };
  }

  @Get('rooms')
  async getUserRooms(@Req() req) {
    const userId = req.user._id || req.user.id || req.user.sub;
    const rooms = await this.chatService.getUserChatRooms(userId);
    return { rooms };
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

  @Get('file/:id')
  async getFile(@Param('id') id: string, @Res() res: Response) {
    const file = await this.fileUploadService.getFileById(id);
    if (!file) {
      return res.status(HttpStatus.NOT_FOUND).send('File not found');
    }
    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalname}"`);
    const buffer = Buffer.from(file.data, 'base64');
    return res.send(buffer);
  }

  @Delete('rooms/:roomId')
  async removeUserFromRoom(@Req() req, @Param('roomId') roomId: string) {
    const userId = req.user._id || req.user.id || req.user.sub;
    return await this.chatService.removeUserFromRoom(roomId, userId);
  }
} 