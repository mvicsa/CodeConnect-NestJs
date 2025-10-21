// // notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Notification } from './entities/notification.schema';
import { isValidObjectId } from 'mongoose';
import { NotificationService } from './notification.service';
import { forwardRef, Inject, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  constructor(
    @Inject(forwardRef(() => NotificationService)) // ✅ use forwardRef here
    private readonly notificationService: NotificationService,
  ) {}
  // When a user joins, assign them to a room based on their ID
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() toUserId: string,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!isValidObjectId(toUserId)) {
      // Add validation
      client.emit('error', 'Invalid toUserId');
      return;
    }
    const room = `user:${toUserId}`;
    // Prevent joining the same room multiple times
    if (!client.rooms.has(room)) {
      client.join(room);
      console.log(`User ${toUserId} joined room ${room}`);
    } else {
      // Optionally log or ignore
      // console.log(`User ${toUserId} already in room ${room}`);
    }
    const notifications = await this.notificationService.findByUser(toUserId);
    notifications.notifications.forEach((notification) =>
      client.emit('notification', notification),
    );
  }

  sendNotificationToUser(toUserId: string, notification: Notification): void {
    const room = `user:${toUserId}`;
    const clientsInRoom = this.server.sockets.adapter.rooms.get(room);

    console.log('📡 sendNotificationToUser called with:');
    console.log('📡 toUserId:', toUserId);
    console.log('📡 room:', room);
    console.log('📡 clientsInRoom:', clientsInRoom);
    console.log('📡 clientsInRoom size:', clientsInRoom?.size);

    if (clientsInRoom && clientsInRoom.size > 0) {
      this.logger.log(
        `📡 Emitting notification to ${room} (${clientsInRoom.size} client(s))`,
      );
      this.server.to(room).emit('notification', notification);
    } else {
      this.logger.warn(
        `🔕 No connected WebSocket clients in room ${room}. Notification not emitted live.`,
      );
    }
  }

  sendToUsers(notifications: Notification[]): void {
    for (const notification of notifications) {
      const toUserId = typeof notification.toUserId === 'object' 
        ? (notification.toUserId as any)._id || (notification.toUserId as any).id
        : notification.toUserId;
      
      console.log('📤 sendToUsers - toUserId:', toUserId);
      console.log('📤 sendToUsers - notification.toUserId type:', typeof notification.toUserId);
      
      this.sendNotificationToUser(toUserId, notification);
    }
  }
}

//   @SubscribeMessage('join')
//   handleJoin(
//     @MessageBody() toUserId: string,
//     @ConnectedSocket() client: Socket,
//   ): void {
//     client.join(`user:${toUserId}`);
//     console.log(`User ${toUserId} joined room user:${toUserId}`);
//   }
// // Example with Socket.IO in React
// import io from 'socket.io-client';

// const socket = io('http://your-backend-url');
// socket.emit('join', toUserId); // Join user-specific room

// socket.on('notification', (notification) => {
//   console.log('New notification:', notification);
//   // Update UI (e.g., show toast or update notification list)
// });
