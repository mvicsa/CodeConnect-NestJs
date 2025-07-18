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

@WebSocketGateway({ namespace: '/chat', cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService, private readonly jwtService: JwtService) {}

  @UseGuards(JwtAuthGuard)
  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers['authorization']?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }
      // Verify token and get user
      const payload = this.jwtService.verify(token);
      const userId = payload.sub || payload.id || payload._id;
      if (!userId) {
        client.disconnect();
        return;
      }
      // Fetch all chat rooms for user
      const rooms = await this.chatService.getUserChatRooms(userId) as ChatRoomDocument[];
      const roomIds = rooms.map(room => (room as any)._id.toString());
      // Join each room
      roomIds.forEach(roomId => client.join(roomId));
      // Optionally, store userId on socket for later use
      (client as any).userId = userId;
      // Emit connected event
      client.emit('connected', { rooms: roomIds });
    } catch (err) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
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
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    await this.chatService.markMessagesAsSeen(userId, data.messageIds);
    // Broadcast to room that these messages were seen by this user
    client.to(data.roomId).emit('chat:seen', { messageIds: data.messageIds, userId });
    // Optionally, emit to sender for instant UI update
    client.emit('chat:seen', { messageIds: data.messageIds, userId });
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
      client.emit('chat:error', { message: 'Unauthorized' });
      return;
    }
    await this.chatService.deleteMessage(userId, data.messageId, data.forAll);
    // Broadcast to room
    this.server.to(data.roomId).emit('chat:delete_message', { messageId: data.messageId, forAll: data.forAll, userId });
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

  // Event handlers will be added here
} 