# anywherechat  
anywherechat  
  

# front (cli)  
git clone https://github.com/lets-exercise/anywherechat  
cd anywherechat  
cd cli-client  
npm install  
npm run start ㄱㄱ  
  
  
# 설명  
대충 보이는대로 쓰면 됩니다  
주요기능으로는 @상대방이름 작성하면 상대방한테 메일이 전송됩니다.  


# back   
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

