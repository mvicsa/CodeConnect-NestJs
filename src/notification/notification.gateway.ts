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
    client.join(`user:${toUserId}`);
    console.log(`User ${toUserId} joined room user:${toUserId}`);
    const notifications = await this.notificationService.findByUser(toUserId);
    notifications.forEach((notification) =>
      client.emit('notification', notification),
    );
  }

  sendNotificationToUser(toUserId: string, notification: Notification): void {
    const room = `user:${toUserId}`;
    const clientsInRoom = this.server.sockets.adapter.rooms.get(room);

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
      this.sendNotificationToUser(notification.toUserId, notification);
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
