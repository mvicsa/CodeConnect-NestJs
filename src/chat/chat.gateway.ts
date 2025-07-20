import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatRoomDocument } from './schemas/chat-room.schema';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({ namespace: '/chat', cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService, 
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async handleConnection(client: Socket) {
    try {
      console.log('Socket.IO: handleConnection called');
      // Extract JWT token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers['authorization']?.split(' ')[1];
      console.log('Socket.IO: Received token:', token);

      if (!token) {
        console.log('Socket.IO: No token provided, disconnecting');
        client.disconnect();
        return;
      }

      // Option 1: Use manual verification with jwt library
      let payload;
      try {
        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret) {
          console.log('Socket.IO: JWT_SECRET not found in config');
          client.disconnect();
          return;
        }
        payload = jwt.verify(token, secret) as any;
      } catch (error) {
        console.log('Socket.IO: Token verification failed:', error.message);
        client.disconnect();
        return;
      }

      // Option 2: Alternative using NestJS JwtService with explicit secret
      // const secret = this.configService.get<string>('JWT_SECRET');
      // const payload = await this.jwtService.verifyAsync(token, { secret });

      console.log('Socket.IO: Token payload:', payload);

      const userId = payload.sub || payload.id || payload._id;
      if (!userId) {
        console.log('Socket.IO: No userId in token, disconnecting');
        client.disconnect();
        return;
      }

      // Fetch all chat rooms for user
      const rooms = await this.chatService.getUserChatRooms(userId);
      
      // Join user to all their chat rooms
      rooms.forEach(room => {
        client.join((room as any)._id.toString());
      });

      // Emit connected event with full room data
      client.emit('connected', { rooms });
      (client as any).userId = userId;
      console.log('Socket.IO: Connection successful for user', userId);
    } catch (err) {
      console.error('Socket.IO: handleConnection error:', err);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log('Socket.IO: handleDisconnect called for client', client.id);
    // Handle disconnect
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(@MessageBody() data: CreateMessageDto, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    // Create and save the message
    const message = await this.chatService.createMessage(userId, data);
    // Emit to all users in the room except sender
    client.to(data.roomId).emit('chat:new_message', message);
    // Optionally, emit to sender as well (for confirmation/UI update)
    client.emit('chat:new_message', message);
  }

  @SubscribeMessage('chat:seen')
  async handleSeen(@MessageBody() data: { roomId: string; messageIds: string[] }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      console.log('[GATEWAY] Unauthorized seen attempt');
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }

    console.log('[GATEWAY] Processing seen message request:', { ...data, userId });
    try {
      await this.chatService.markMessagesAsSeen(userId, data.messageIds);
      console.log('[GATEWAY] Messages marked as seen, broadcasting to room:', data.roomId);
      
      // Broadcast to all clients in the room, including sender
      this.server.to(data.roomId).emit('chat:seen', {
        messageIds: data.messageIds,
        roomId: data.roomId,
        userId
      });
      
      console.log('[GATEWAY] Seen event broadcasted successfully');
    } catch (error) {
      console.error('[GATEWAY] Error marking messages as seen:', error);
      client.emit('chat:error', { message: 'Failed to mark messages as seen' });
    }
  }

  @SubscribeMessage('chat:typing')
  async handleTyping(@MessageBody() data: { roomId: string; isTyping: boolean }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    // Broadcast typing status to the room except sender
    client.to(data.roomId).emit('chat:typing', { userId, isTyping: data.isTyping });
  }

  @SubscribeMessage('chat:delete_message')
  async handleDeleteMessage(@MessageBody() data: { roomId: string; messageId: string; forAll: boolean }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      console.log('[GATEWAY] Unauthorized delete attempt');
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    
    console.log('[GATEWAY] Processing delete message request:', { ...data, userId });
    try {
      await this.chatService.deleteMessage(userId, data.messageId, data.forAll);
      console.log('[GATEWAY] Message deleted successfully, broadcasting to room:', data.roomId);
      
      // Broadcast to all clients in the room, including sender
      this.server.to(data.roomId).emit('chat:delete_message', {
        messageId: data.messageId,
        roomId: data.roomId,
        forAll: data.forAll,
        userId
      });
      
      console.log('[GATEWAY] Delete event broadcasted successfully');
    } catch (error) {
      console.error('[GATEWAY] Error deleting message:', error);
      client.emit('chat:error', { message: 'Failed to delete message' });
    }
  }

  @SubscribeMessage('chat:react_message')
  async handleReactMessage(@MessageBody() data: { roomId: string; messageId: string; emoji: string }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    const updatedMessage = await this.chatService.reactToMessage(userId, data.messageId, data.emoji);
    // Broadcast updated message to room
    this.server.to(data.roomId).emit('chat:react_message', { message: updatedMessage, userId, emoji: data.emoji });
  }

  @SubscribeMessage('group:create')
  async handleCreateGroup(@MessageBody() data: { title: string; avatar: string; members: string[] }, @ConnectedSocket() client: Socket) {
    const creatorId = (client as any).userId;
    if (!creatorId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    const group = await this.chatService.createGroup(creatorId, data.title, data.avatar, data.members);
    // Join creator to the new group room
    client.join((group as any)._id.toString());
    // Notify all group members (including creator)
    this.server.to((group as any)._id.toString()).emit('group:created', group);
  }

  @SubscribeMessage('group:update_info')
  async handleUpdateGroupInfo(@MessageBody() data: { roomId: string; title?: string; avatar?: string }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    const group = await this.chatService.updateGroupInfo(data.roomId, data.title, data.avatar);
    this.server.to(data.roomId).emit('group:updated', group);
  }

  @SubscribeMessage('group:add_member')
  async handleAddGroupMember(@MessageBody() data: { roomId: string; userId: string }, @ConnectedSocket() client: Socket) {
    const group = await this.chatService.addGroupMember(data.roomId, data.userId);
    // Notify all group members
    this.server.to(data.roomId).emit('group:member_added', { roomId: data.roomId, userId: data.userId });
  }

  @SubscribeMessage('group:remove_member')
  async handleRemoveGroupMember(@MessageBody() data: { roomId: string; userId: string }, @ConnectedSocket() client: Socket) {
    const group = await this.chatService.removeGroupMember(data.roomId, data.userId);
    // Notify all group members
    this.server.to(data.roomId).emit('group:member_removed', { roomId: data.roomId, userId: data.userId });
  }

  @SubscribeMessage('chat:pin_message')
  async handlePinMessage(@MessageBody() data: { roomId: string; messageId: string }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    await this.chatService.pinMessage(data.roomId, data.messageId);
    this.server.to(data.roomId).emit('chat:pin_message', { roomId: data.roomId, messageId: data.messageId, userId });
  }

  @SubscribeMessage('chat:unpin_message')
  async handleUnpinMessage(@MessageBody() data: { roomId: string; messageId: string }, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    await this.chatService.unpinMessage(data.roomId, data.messageId);
    this.server.to(data.roomId).emit('chat:unpin_message', { roomId: data.roomId, messageId: data.messageId, userId });
  }

  @SubscribeMessage('createPrivateRoom')
  async handleCreatePrivateRoom(@MessageBody() data: { receiverId: string }, @ConnectedSocket() client: Socket) {
    const senderId = (client as any).userId;
    if (!senderId) {
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }

    console.log('[GATEWAY] Creating private room:', { senderId, receiverId: data.receiverId });
    
    try {
      const room = await this.chatService.createPrivateRoom(senderId, data.receiverId);
      
      // Join both users to the room
      client.join((room as any)._id.toString());
      
      // Send response using acknowledgment callback
      const response = { 
        roomId: (room as any)._id.toString(),
        room: room
      };
      
      console.log('[GATEWAY] Private room created successfully:', (room as any)._id, 'Response:', response);
      
      // Return the response to the client
      return response;
    } catch (error) {
      console.error('[GATEWAY] Error creating private room:', error);
      throw new Error('Failed to create private room');
    }
  }

  @SubscribeMessage('chat:get_messages')
  async handleGetMessages(
    @MessageBody() data: { roomId: string; limit?: number; before?: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      console.log('[GATEWAY] Unauthorized message fetch attempt');
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }

    console.log('[GATEWAY] Fetching messages:', data);
    try {
      const messages = await this.chatService.getPaginatedMessages(
        data.roomId,
        data.limit || 50,
        data.before
      );
      console.log('[GATEWAY] Fetched messages count:', messages.length);

      // Send messages only to the requesting client
      client.emit('chat:messages', {
        roomId: data.roomId,
        messages,
        hasMore: messages.length === (data.limit || 50)
      });
    } catch (error) {
      console.error('[GATEWAY] Error fetching messages:', error);
      client.emit('chat:error', { message: 'Failed to fetch messages' });
    }
  }

  // Event handlers will be added here
}