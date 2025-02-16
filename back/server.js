require('dotenv').config();

// chatServer.js
// A basic Express server with MongoDB using Mongoose and Socket.io
// Provides user login, signup, room creation, room joining, room deletion,
// real-time chat, and mention-by-email functionality using environment variables.

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());

//////////////////////////////////////////////////
// CONFIGURATION (ENV VARIABLES)
//////////////////////////////////////////////////

// Load from .env
// Example of .env:
// MONGO_URI=mongodb://localhost:27017/chat-app
// JWT_SECRET=your_jwt_secret
// GMAIL_USER=yourEmail@gmail.com
// GMAIL_PASSWORD=yourEmailPassword
// PORT=4000

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chat-app';
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret';
const GMAIL_USER = process.env.GMAIL_USER || 'yourEmail@gmail.com';
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD || 'yourEmailPassword';
const PORT = process.env.PORT || 4000;

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASSWORD,
  },
});

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
});

const db = mongoose.connection;
db.on('error', (error) => console.error('MongoDB connection error:', error));
db.once('open', () => console.log('Connected to MongoDB'));

//////////////////////////////////////////////////
// SCHEMAS & MODELS
//////////////////////////////////////////////////

// Define User schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Define Room schema
const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

// Define Message schema
const messageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Hash the user's password before saving
userSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) {
      return next();
    }
    const hashed = await bcrypt.hash(this.password, 10);
    this.password = hashed;
    next();
  } catch (err) {
    next(err);
  }
});

const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const Message = mongoose.model('Message', messageSchema);

//////////////////////////////////////////////////
// MIDDLEWARE
//////////////////////////////////////////////////

// JWT Authentication middleware
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

//////////////////////////////////////////////////
// RESTful ROUTES
//////////////////////////////////////////////////

// Sign up
app.post('/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    // Check if user or email already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already taken' });
    }

    // Create new user
    const newUser = new User({ username, email, password });
    await newUser.save();

    return res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Check user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: '1d',
    });

    return res.status(200).json({ message: 'Login successful', token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create a new room
app.post('/rooms', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return res.status(400).json({ message: 'Room name already exists' });
    }

    const newRoom = new Room({ name, members: [req.user.userId] });
    await newRoom.save();

    return res.status(201).json({ message: 'Room created', room: newRoom });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Join a room
app.post('/rooms/:roomId/join', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is already in the room
    if (room.members.includes(req.user.userId)) {
      return res.status(400).json({ message: 'Already in the room' });
    }

    room.members.push(req.user.userId);
    await room.save();

    return res.status(200).json({ message: 'Joined room successfully', room });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete a room
app.delete('/rooms/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check membership
    if (!room.members.includes(req.user.userId)) {
      return res.status(403).json({ message: 'You are not a member of this room' });
    }

    await Room.findByIdAndDelete(roomId);
    return res.status(200).json({ message: 'Room deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get messages in a room (for history)
app.get('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    // Check if user is a member of the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!room.members.includes(req.user.userId)) {
      return res.status(403).json({ message: 'You are not a member of this room' });
    }

    const messages = await Message.find({ room: roomId }).populate('user', 'username');
    return res.status(200).json(messages);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

//////////////////////////////////////////////////
// SOCKET.IO AUTHENTICATION
//////////////////////////////////////////////////
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

//////////////////////////////////////////////////
// SOCKET.IO CONNECTION
//////////////////////////////////////////////////
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  // Join room event
  socket.on('joinRoom', async (roomId, callback) => {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        if (callback) callback({ error: 'Room not found' });
        return;
      }
      // Check membership
      if (!room.members.includes(socket.user.userId)) {
        if (callback) callback({ error: 'You are not a member of this room' });
        return;
      }
      socket.join(roomId);
      if (callback) callback({ success: true, message: 'Joined the room' });
    } catch (err) {
      console.error('Failed to join room:', err);
      if (callback) callback({ error: 'Failed to join room' });
    }
  });

  // Listen for chat messages
  socket.on('chatMessage', async (data) => {
    // data should contain roomId, message
    const { roomId, message } = data;
    try {
      // Check membership
      const room = await Room.findById(roomId);
      if (!room) {
        return; // or handle error
      }
      if (!room.members.includes(socket.user.userId)) {
        return; // or handle error
      }

      // Save message to DB
      const newMessage = new Message({
        room: roomId,
        user: socket.user.userId,
        text: message,
      });
      await newMessage.save();

      // MENTION-BY-EMAIL LOGIC
      // detect mentions of form @someone@example.com
      const mentionRegex = /@([\w.-]+@[\w.-]+\.[A-Za-z]{2,})/g;
      const mentions = message.match(mentionRegex);

      if (mentions) {
        for (let mention of mentions) {
          // remove the leading @
          const mentionedEmail = mention.slice(1);
          // find the user by email
          const userMentioned = await User.findOne({ email: mentionedEmail });
          if (userMentioned) {
            // if not in the room, send email notification
            if (!room.members.includes(userMentioned._id)) {
              try {
                await transporter.sendMail({
                  from: GMAIL_USER,
                  to: mentionedEmail,
                  subject: 'You were mentioned in ChatApp!',
                  text: `${socket.user.username} mentioned you in room '${room.name}' with message: "${message}"`,
                });
                console.log(`Mention email sent to ${mentionedEmail}`);
              } catch (emailErr) {
                console.error(`Failed to send mention email to ${mentionedEmail}:`, emailErr);
              }
            }
          }
        }
      }

      // Broadcast the message to all in the room
      io.to(roomId).emit('chatMessage', {
        user: {
          _id: socket.user.userId,
          username: socket.user.username,
        },
        text: message,
        createdAt: newMessage.createdAt,
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

//////////////////////////////////////////////////
// START SERVER
//////////////////////////////////////////////////

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
