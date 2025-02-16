require('dotenv').config();

/**
 * Chat Server
 *
 * This version does NOT store room membership in the database.
 * Instead, membership is managed by Socket.io sessions.
 *
 * - If the user wants to join a room, we do so via Socket.io only.
 * - The REST API no longer records membership. 'join' route is removed.
 * - For reading messages (GET /rooms/:roomName/messages), we do NOT check membership.
 *   (Alternatively, you could require that only the creator can see them, etc.)
 * - If you want to restrict reading messages, you can add your own logic.
 * - The user can only delete a room if they are the room's owner.
 */

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());

app.use(cors());
//////////////////////////////////////////////////
// CONFIGURATION (ENV VARIABLES)
//////////////////////////////////////////////////

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
mongoose.connect(MONGO_URI, {});
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

// We remove members array, only store room name + owner
const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

// Messages reference room and user
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
    this.password = await bcrypt.hash(this.password, 10);
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
// REST ROUTES
//////////////////////////////////////////////////

// Sign up
app.post('/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    // Check duplicates
    const existingUser = await User.findOne({ $or: [{ username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already taken' });
    }

    const newUser = new User({ username, email, password });
    await newUser.save();

    return res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('Signup error:', err);
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

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: '1d',
    });

    return res.status(200).json({ message: 'Login successful', token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create room (only name + owner)
app.post('/rooms', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    const existing = await Room.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Room name already exists' });
    }

    const newRoom = new Room({ name, owner: req.user.userId });
    await newRoom.save();

    return res.status(201).json({ message: 'Room created', room: newRoom });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List all rooms
app.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({});
    return res.status(200).json(rooms);
  } catch (err) {
    console.error('List rooms error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Delete a room if you are the owner
app.delete('/rooms/:roomName', authMiddleware, async (req, res) => {
  try {
    const { roomName } = req.params;
    const room = await Room.findOne({ name: roomName });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.owner.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'You are not the owner of this room' });
    }

    await Room.findByIdAndDelete(room._id);
    return res.status(200).json({ message: 'Room deleted' });
  } catch (err) {
    console.error('Delete room error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get messages in a room (no membership check)
app.get('/rooms/:roomName/messages', authMiddleware, async (req, res) => {
  try {
    const { roomName } = req.params;
    const room = await Room.findOne({ name: roomName });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // We do NOT check membership here.
    // Optionally, require that only the owner can read messages:
    // if (room.owner.toString() !== req.user.userId) {
    //   return res.status(403).json({ message: 'Only owner can read this room messages' });
    // }

    const messages = await Message.find({ room: room._id }).populate('user', 'username');
    return res.status(200).json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

//////////////////////////////////////////////////
// SOCKET.IO AUTH
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
// SOCKET.IO EVENTS
//////////////////////////////////////////////////
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Join room event - ephemeral membership
  socket.on('joinRoom', (roomName, callback) => {
    // We no longer store membership in DB.
    // Just do socket.join.
    socket.join(roomName);
    if (callback) {
      callback({ success: true, message: `Joined the room (ephemeral) '${roomName}'` });
    }
  });

  // chatMessage - ephemeral membership check with Socket.io
  socket.on('chatMessage', async (data) => {
    const { roomName, message } = data;

    // Check ephemeral membership
    // if (!socket.rooms.has(roomName)) {
    //   console.log('User not joined via socket, ignoring message');
    //   return;
    // }

    // Save message to DB
    try {
      const room = await Room.findOne({ name: roomName });
      if (!room) {
        return;
      }

      const newMessage = new Message({
        room: room._id,
        user: socket.user.userId,
        text: message,
      });
      await newMessage.save();

      // MENTION-BY-USERNAME LOGIC
      const mentionRegex = /@(\w+)/g; // or /@([\w.-]+)/g if you allow '.' or '-'
      const mentions = message.match(mentionRegex);

      if (mentions) {
        for (const mention of mentions) {
          const mentionedUsername = mention.slice(1);
          const userMentioned = await User.findOne({ username: mentionedUsername });
          if (userMentioned) {
            // If userMentioned is not ephemeral in the socket, we do not know.
            // If you want to email them if they're not connected, do this:
            // (No DB membership check now)
            try {
              await transporter.sendMail({
                from: GMAIL_USER,
                to: userMentioned.email,
                subject: `[Anywherechat] ${socket.user.username}님이 멘션했했어요! `,
                text: `누추한 당신에게 ${socket.user.username}님이 이런 귀한 '${roomName}'에요. \n ${socket.user.username} : "${message}"`,
              });
              console.log(`Mention email sent to ${userMentioned.email}`);
            } catch (emailErr) {
              console.error(`Failed to send mention email to ${userMentioned.email}:`, emailErr);
            }
          }
        }
      }

      // Broadcast the message to everyone in that socket room
      io.to(roomName).emit('chatMessage', {
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
    console.log('Socket disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
