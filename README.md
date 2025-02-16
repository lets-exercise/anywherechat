# anywherechat  
anywherechat  
  
back  
npm install express mongoose bcrypt jsonwebtoken nodemailer dotenv

  
# REST API Routes for Chat Server

## Authentication

### POST /auth/signup
- **Description**: Register a new user with `username`, `email`, and `password`.

### POST /auth/login
- **Description**: Login with `username` and `password` to receive a JWT.

---

## Room Management

### POST /rooms
- **Description**: Create a new chat room. Requires JWT authentication.

### POST /rooms/:roomId/join
- **Description**: Join an existing room by `roomId`. Requires JWT authentication.

### DELETE /rooms/:roomId
- **Description**: Delete a room by `roomId`. Only accessible by room members.

### GET /rooms/:roomId/messages
- **Description**: Fetch all messages in a room by `roomId`. Requires JWT authentication.


# front (cli)  
npm run start ㄱㄱ  