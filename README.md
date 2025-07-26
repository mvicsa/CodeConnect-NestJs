# CodeConnect Backend 🚀

A powerful, feature-rich backend API for CodeConnect - a collaborative coding platform built with **NestJS**, **MongoDB**, and **Socket.IO**. This platform enables developers to connect, collaborate, and learn through real-time communication, AI-powered code assistance, and interactive coding sessions.

## ✨ Features

### 🔐 Authentication & Authorization
- **JWT-based Authentication** with secure token management
- **GitHub OAuth Integration** for seamless social login
- **Password Reset** functionality with email verification
- **Role-based Access Control** for different user types

### 💬 Real-time Communication
- **WebSocket-powered Chat System** with Socket.IO
- **Real-time Notifications** for posts, comments, reactions, and mentions
- **Live Video/Audio Calls** integration with LiveKit
- **File Upload & Sharing** in chat conversations

### 🤖 AI-Powered Features
- **Code Analysis & Suggestions** using OpenAI GPT models
- **Comment Evaluation System** - AI automatically evaluates code answers
- **Smart Code Help** - Get guidance without complete solutions
- **Archive System** - Curated posts with verified AI answers

### 📝 Content Management
- **Posts & Comments System** with rich text and code support
- **Code Snippets** with syntax highlighting and language detection
- **Reactions & Interactions** (likes, reactions, etc.)
- **Search Functionality** across posts, users, and content
- **Tagging System** for better content organization

### 👥 Social Features
- **User Profiles** with customizable avatars and information
- **Follow/Unfollow System** for building connections
- **User Blocking** functionality for content moderation
- **Mention System** (@username) in posts and comments
- **Activity Feed** with personalized content

### 🔍 Advanced Features
- **Microservices Architecture** with RabbitMQ message queuing
- **Real-time Search** with instant results
- **Notification Management** (mark as read, delete, preferences)
- **Sparks System** for gamification and engagement
- **Group Management** for team collaboration

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   External      │
│   (NextJS)      │◄──►│   (NestJS)      │◄──►│   Services      │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Database      │
                       │   (MongoDB)     │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Message       │
                       │   Queue         │
                       │   (RabbitMQ)    │
                       └─────────────────┘
```

## 🛠️ Tech Stack

### Core Framework
- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type-safe JavaScript
- **MongoDB** - NoSQL database with Mongoose ODM
- **Socket.IO** - Real-time bidirectional communication

### Authentication & Security
- **Passport.js** - Authentication middleware
- **JWT** - JSON Web Tokens for stateless authentication
- **bcrypt** - Password hashing
- **GitHub OAuth** - Social authentication

### AI & External Services
- **OpenAI API** - GPT models for code analysis
- **LiveKit** - Real-time video/audio communication
- **AWS SDK** - Cloud services integration

### Message Queuing & Microservices
- **RabbitMQ** - Message broker for microservices
- **AMQP** - Advanced Message Queuing Protocol

### Development Tools
- **Swagger/OpenAPI** - API documentation
- **Jest** - Testing framework
- **ESLint & Prettier** - Code quality and formatting

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (v5 or higher)
- RabbitMQ (v3.8 or higher)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/CodeConnect-NestJs.git
   cd CodeConnect-NestJs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Configure your `.env` file with the required environment variables (see [Environment Variables](#environment-variables) section).

4. **Start the application**
   ```bash
   # Development mode
   npm run start:dev
   
   # Production mode
   npm run build
   npm run start:prod
   ```

5. **Access the API**
   - API Base URL: `http://localhost:5000`
   - Swagger Documentation: `http://localhost:5000/api`

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/codeconnect

# JWT Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRATION=1d

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=500

# LiveKit Configuration
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-livekit-server.com

# RabbitMQ Configuration
AMQP_URL=amqp://localhost:5672
RMQ_QUEUE=notifications_queue

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

## 📚 API Documentation

### Authentication Endpoints
```http
POST /auth/register - User registration
POST /auth/login - User login
POST /auth/github - GitHub OAuth login
POST /auth/forgot-password - Request password reset
POST /auth/reset-password - Reset password
```

### User Management
```http
GET /users/profile - Get user profile
PUT /users/profile - Update user profile
GET /users/:id - Get user by ID
POST /users/follow/:id - Follow user
DELETE /users/follow/:id - Unfollow user
```

### Posts & Content
```http
GET /posts - Get all posts
POST /posts - Create new post
GET /posts/:id - Get specific post
PUT /posts/:id - Update post
DELETE /posts/:id - Delete post
GET /posts/:id/comments - Get post comments
POST /posts/:id/comments - Add comment
```

### AI Features
```http
POST /ai-agent/code-help - Get code suggestions
POST /ai-agent/evaluate-comment-answer - Evaluate comment quality
GET /posts/:id/code-suggestions - Get AI suggestions for post
```

### Real-time Features
```http
GET /chat/rooms - Get chat rooms
POST /chat/rooms - Create chat room
GET /chat/rooms/:id/messages - Get room messages
POST /chat/rooms/:id/messages - Send message
```

### LiveKit Integration
```http
POST /livekit/create-room - Create video call room
GET /livekit/room/:id/token - Get room access token
DELETE /livekit/room/:id - Delete room
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# e2e tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🐳 Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "run", "start:prod"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      - MONGO_URI=mongodb://mongo:27017/codeconnect
      - AMQP_URL=amqp://rabbitmq:5672
    depends_on:
      - mongo
      - rabbitmq

  mongo:
    image: mongo:5
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  mongo_data:
  rabbitmq_data:
```

## 🔒 Security Features

- **JWT Token Authentication** with secure token management
- **Input Validation** using class-validator and DTOs
- **CORS Configuration** for cross-origin requests
- **Rate Limiting** to prevent abuse
- **Password Hashing** with bcrypt
- **Environment Variable Protection** for sensitive data

## 📊 Performance Optimizations

- **Database Indexing** for faster queries
- **Connection Pooling** for MongoDB
- **Message Queuing** for async operations
- **Caching Strategies** for frequently accessed data
- **Compression** for API responses
- **Memory Management** with proper garbage collection

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Write unit tests for new features
- Update API documentation
- Follow the existing code style
- Add proper error handling

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [API Documentation](http://localhost:5000/api)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Email**: support@codeconnect.com

## 🙏 Acknowledgments

- **NestJS Team** for the amazing framework
- **Socket.IO** for real-time communication
- **OpenAI** for AI-powered features
- **LiveKit** for video/audio capabilities
- **MongoDB** for flexible data storage
- **RabbitMQ** for message queuing

## 📈 Roadmap

- [ ] **Advanced AI Features**
  - Code review automation
  - Pair programming AI assistant
  - Code quality scoring

- [ ] **Enhanced Collaboration**
  - Real-time code editing
  - Collaborative debugging sessions
  - Team workspaces

- [ ] **Performance Improvements**
  - Redis caching layer
  - CDN integration
  - Database optimization

- [ ] **Mobile Support**
  - React Native app
  - Push notifications
  - Offline capabilities

---

**Made with ❤️ by the CodeConnect Team**

*Connect, Collaborate, Code Together!*
