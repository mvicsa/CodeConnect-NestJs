# CodeConnect-NestJs

## Installation & Setup

1. **required packages**:

```bash
npm install @nestjs/mongoose mongoose
npm install @nestjs/passport passport @nestjs/jwt passport-jwt bcrypt
npm install class-validator class-transformer
npm install @nestjs/swagger swagger-ui-express
npm install @nestjs/config
npm install
```

3. **Create a `.env` file** in the root directory:

```env
MONGO_URI=<your-mongodb-atlas-uri>
JWT_SECRET=supersecretkey
JWT_SECRET=jwt_secret_key
JWT_EXPIRES=1d
```

4. **Run the development server**:

```bash
npm run start:dev
```

---

## Testing the API with Swagger

After starting the server, open your browser and navigate to:

```
http://localhost:3000/api
```

You’ll find a full Swagger UI where you can test all available routes.

---

## Available Endpoints

### 🔸 `POST /auth/register`

Registers a new user.

📥 Request Body:

```json
{
  "firstName": "Mahmoud",
  "lastName": "Essam",
  "username": "essamDev",
  "email": "essam@example.com",
  "password": "12345678",
  "skills": ["NestJS", "MongoDB"],
  "socialLinks": [{ "title": "GitHub", "url": "https://github.com/essam" }],
  "birthdate": "2000-01-15",
  "gender": "male"
}
```

---

### 🔸 `POST /auth/login`

Logs in the user and returns a JWT token.

📥 Request Body:

```json
{
  "email": "essam@example.com",
  "password": "12345678"
}
```

📤 Response:

```json
{
  "message": "Login successful",
  "user": { ... },
  "token": "Bearer eyJhbGciOiJIUzI1NiIs..."
}
```

---

### 🔸 `GET /auth/profile` (Protected)

Fetches the authenticated user's profile.

🛡 Requires Bearer Token.

📌 Steps:

1. Click **Authorize** in the Swagger top right.
2. Paste your token like this:

```
Bearer eyJhbGciOiJIUzI1NiIs...
```

3. Click "Execute" to get full user profile data.
