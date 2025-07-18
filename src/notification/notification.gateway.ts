// // notification.gateway.ts
// import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
// import { Server } from 'socket.io';
// import { Notification } from './entities/notification.schema';

// @WebSocketGateway()
// export class NotificationGateway {
//   @WebSocketServer()
//   server: Server;

//   afterInit() {
//     console.log('WebSocket Gateway initialized');
//   }

//   // notification.gateway.ts
//   @SubscribeMessage('join')
//   handleJoin(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
//     client.join(`user:${userId}`);
//     console.log(`User ${userId} joined room user:${userId}`);
//   }

//   sendNotificationToUser(userId: string, notification: Notification) {
//     this.server.to(`user:${userId}`).emit('notification', notification);
//   }
// }

// notification.gateway.tsimport
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
import { forwardRef, Inject } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(forwardRef(() => NotificationService)) // ✅ use forwardRef here
    private readonly notificationService: NotificationService,
  ) {}
  // When a user joins, assign them to a room based on their ID
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!isValidObjectId(userId)) {
      // Add validation
      client.emit('error', 'Invalid userId');
      return;
    }
    client.join(`user:${userId}`);
    console.log(`User ${userId} joined room user:${userId}`);
    const notifications = await this.notificationService.findByUser(userId);
    notifications.forEach((notification) =>
      client.emit('notification', notification),
    );
  }
  // Send notification to a specific user room
  sendNotificationToUser(userId: string, notification: Notification): void {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}

//   @SubscribeMessage('join')
//   handleJoin(
//     @MessageBody() userId: string,
//     @ConnectedSocket() client: Socket,
//   ): void {
//     client.join(`user:${userId}`);
//     console.log(`User ${userId} joined room user:${userId}`);
//   }
// // Example with Socket.IO in React
// import io from 'socket.io-client';

// const socket = io('http://your-backend-url');
// socket.emit('join', userId); // Join user-specific room

// socket.on('notification', (notification) => {
//   console.log('New notification:', notification);
//   // Update UI (e.g., show toast or update notification list)
// });
