# CodeConnect-NestJs

## Overview

CodeConnect-NestJs is a collaborative backend platform built with [NestJS](https://nestjs.com/) that empowers developers to connect, share code, and receive AI-powered code suggestions. It features real-time notifications, video/audio rooms via LiveKit, and robust authentication (including GitHub OAuth). The project is designed for developer communities to interact, post code snippets, comment, and get AI-driven help for code issues.

## Main Features

- **User Authentication**: Register, login, and manage user profiles. Supports JWT and GitHub OAuth.
- **Posts & Comments**: Share code snippets, text, images, and videos. Comment and react to posts.
- **AI Code Help**: Get AI-powered suggestions for code problems using OpenAI (guidance only, no full solutions).
- **LiveKit Integration**: Create and join real-time video/audio rooms for collaborative sessions.
- **Real-Time Notifications**: Receive instant notifications for new posts, comments, likes, and more via WebSockets.
- **Microservices & RabbitMQ**: Scalable architecture using RabbitMQ for event-driven notifications.
- **Swagger API Docs**: Interactive API documentation available at `/api`.

---

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Create a `.env` file** in the root directory:
   ```env
   MONGO_URI=<your-mongodb-atlas-uri>
   JWT_SECRET=supersecretkey
   JWT_EXPIRES=1d
   OPENAI_API_KEY=<your-openai-api-key>
   # (Optional) LiveKit and RabbitMQ configs
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   AMQP_URL=amqp://localhost:5672
   ```
3. **Run the development server**:
   ```bash
   npm run start:dev
   ```

---

## API Documentation

After starting the server, open your browser and navigate to:
```
http://localhost:3000/api
```
You’ll find a full Swagger UI where you can test all available routes.

---

## Key Endpoints

### `POST /auth/register`
Registers a new user.

### `POST /auth/login`
Logs in the user and returns a JWT token.

### `GET /auth/profile` (Protected)
Fetches the authenticated user's profile. Requires Bearer Token.

### `POST /ai-agent/code-help` (Protected)
Get AI-powered suggestions for fixing code problems. Requires Bearer Token.

**Request Body Example:**
```json
{
  "code": "function add(a, b) { return a - b; }",
  "description": "The add function is not working correctly",
  "language": "javascript"
}
```
**Response Example:**
```json
{
  "suggestions": "- Check the operator in your return statement..."
}
```

### `POST /livekit/rooms` (Protected)
Create a new LiveKit room for real-time collaboration.

### `GET /livekit/token?secretId=...` (Protected)
Get a LiveKit access token for joining a room.

---

## Real-Time Notifications

- Notifications are delivered via WebSockets.
- Users join their notification room on connection and receive updates for new posts, comments, likes, and more.

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

## License

This project is UNLICENSED. See the [LICENSE](LICENSE) file for details.
