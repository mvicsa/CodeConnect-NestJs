# CodeConnect-NestJs

## Overview

CodeConnect-NestJs is a backend API built with NestJS, MongoDB, and OpenAI integration. It supports user authentication, posting code/content, and provides AI-powered code suggestions for posts containing code.

---

## Features
- User registration and authentication (JWT)
- Create, update, delete, and fetch posts
- AI agent that analyzes code in posts and provides suggestions (no full solutions)
- Retrieve AI suggestions for any post with code
- Comments and reactions on posts

---

**Notes:**
- If you are not using RabbitMQ, you can remove the RabbitMQ section.
- Fill in the GitHub OAuth and OpenAI variables with your actual credentials.
- Adjust `PORT` and `FRONTEND_URL` as needed for your environment.

---

## Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd CodeConnect-NestJs
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the root directory with the following variables:
    ```env
    # Server
    PORT=5000

    # MongoDB
    MONGO_URI=

    # JWT Authentication
    JWT_SECRET=your_jwt_secret_key
    JWT_EXPIRES=1d

    # Default Images
    DEFAULT_COVER_IMAGE=https://images.unsplash.com/photo-1503264116251-35a269479413
    DEFAULT_AVATAR_IMAGE=https://randomuser.me/api/portraits/lego/1.jpg

    # GitHub OAuth
    GITHUB_CLIENT_ID=
    GITHUB_CLIENT_SECRET=
    GITHUB_CALLBACK_URL=

    # CORS / Frontend
    FRONTEND_URL=http://localhost:3000

    # OpenAI Configuration
    OPENAI_API_KEY=your_openai_api_key
    OPENAI_MODEL=gpt-4o-mini
    OPENAI_TEMPERATURE=0.9
    OPENAI_MAX_TOKENS=500

    # RabbitMQ (if used)
    AMQP_URL=amqp://localhost:5672
    RMQ_QUEUE=notifications_queue
    RMQ_PREFETCH_COUNT=1
    RMQ_RETRY_ATTEMPTS=5
    RMQ_RETRY_DELAY=1000
    RMQ_HEARTBEAT=60
    RMQ_CONNECTION_TIMEOUT=10000
    RMQ_NO_ACK=false
    ```

4. **Run the development server:**
   ```bash
   npm run start:dev
   ```

---

## API Endpoints

### Authentication
- `POST /auth/register` — Register a new user
- `POST /auth/login` — Login and receive JWT
- `GET /auth/profile` — Get current user profile (JWT required)

### Posts
- `GET /posts` — Get all posts (supports pagination)
- `GET /posts/:id` — Get a single post by ID
- `POST /posts` — Create a new post (JWT required)
- `PUT /posts/:id` — Update a post (JWT required)
- `DELETE /posts/:id` — Delete a post (JWT required)

### AI Code Suggestions
- `GET /posts/:id/code-suggestions` — Get AI suggestions for a post with code

  **Response Example:**
  ```json
  {
    "_id": "64a7b2e1c3f4d5e6f7890abc",
    "postId": "64a7b2e1c3f4d5e6f7890123",
    "suggestions": "• Consider using const instead of let for variables that don't change\n• The function could benefit from error handling for edge cases\n• ...",
    "createdAt": "2025-07-17T22:30:45.123Z",
    "updatedAt": "2025-07-17T22:30:45.123Z"
  }
  ```

  **If no suggestions are available:**
  ```json
  { "message": "No suggestions available for this post." }
  ```

- Each post with code will have a `hasAiSuggestions` flag in its response.

---

## How AI Suggestions Work
- When a post is created with code, the backend waits for the AI agent to analyze the code and generate suggestions before responding.
- The suggestions are stored and can be retrieved at any time using the `/posts/:id/code-suggestions` endpoint.
- The AI agent only provides hints and suggestions, never full code solutions.

---

## Swagger API Docs
- After running the server, visit: `http://localhost:5000/api` to view and test all endpoints interactively.

---

## License
This project is for educational/demo purposes.
