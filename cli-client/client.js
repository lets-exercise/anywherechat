#!/usr/bin/env node

/**
 * Final CLI Chat Client with blocking Chat Mode
 * - Main menu uses inquirer in a while(true) loop
 * - When Chat is selected, we call handleChat()
 * - handleChat() returns a Promise that resolves only after /quit
 * - No immediate return to main menu until chat ends
 */

const inquirer = require('inquirer');
const axios = require('axios');
const { io } = require('socket.io-client');
const readline = require('readline');

// Adjust server address if needed
const BASE_URL = 'http://localhost:36000';

let authToken = null;       // JWT token
let currentSocket = null;   // Socket.io instance
let currentRoomName = null; // Ephemeral room name
let myUsername = null;      // Store after login

//----------------------------------------------------
// Helper: set JWT in Axios
//----------------------------------------------------
function setAuthToken(token) {
  authToken = token;
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

//====================================================
// 1. Sign Up
//====================================================
async function handleSignUp() {
  const answers = await inquirer.prompt([
    { name: 'username', message: 'Enter username:' },
    { name: 'email', message: 'Enter email:' },
    { type: 'password', name: 'password', message: 'Enter password:' },
  ]);

  try {
    const res = await axios.post(`${BASE_URL}/auth/signup`, {
      username: answers.username,
      email: answers.email,
      password: answers.password,
    });
    console.log('SignUp:', res.data);
  } catch (error) {
    console.error('SignUp error:', error.response?.data || error.message);
  }
}

//====================================================
// 2. Login
//====================================================
async function handleLogin() {
  const answers = await inquirer.prompt([
    { name: 'username', message: 'Enter username:' },
    { type: 'password', name: 'password', message: 'Enter password:' },
  ]);

  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      username: answers.username,
      password: answers.password,
    });
    console.log('Login success. Token:', res.data.token);
    setAuthToken(res.data.token);

    // Store my username for filtering out own messages
    myUsername = answers.username;

  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
  }
}

//====================================================
// 3. Create Room
//====================================================
async function handleCreateRoom() {
  if (!authToken) {
    console.log('Please login first.');
    return;
  }

  const answers = await inquirer.prompt([
    { name: 'roomName', message: 'Enter new room name:' },
  ]);

  try {
    const res = await axios.post(`${BASE_URL}/rooms`, {
      name: answers.roomName,
    });
    console.log('Room created:', res.data);
  } catch (error) {
    console.error('Create room error:', error.response?.data || error.message);
  }
}

//====================================================
// 4. List Rooms
//====================================================
async function handleListRooms() {
  if (!authToken) {
    console.log('Please login first.');
    return;
  }

  try {
    const res = await axios.get(`${BASE_URL}/rooms`);
    console.log('Rooms in DB:', res.data);
  } catch (error) {
    console.error('List rooms error:', error.response?.data || error.message);
  }
}

//====================================================
// 5. Join Room (ephemeral)
//====================================================
async function handleJoinRoom() {
  if (!authToken) {
    console.log('Please login first.');
    return;
  }

  const answers = await inquirer.prompt([
    { name: 'roomName', message: 'Enter room NAME to join (ephemeral):' },
  ]);

  // Disconnect previous socket, if any
  if (currentSocket) {
    currentSocket.disconnect();
  }

  // Create new socket
  currentSocket = io(BASE_URL, {
    auth: {
      token: authToken,
    },
  });
  currentRoomName = answers.roomName;

  currentSocket.on('connect', () => {
    console.log('Socket connected. ID:', currentSocket.id);

    // ephemeral join
    currentSocket.emit('joinRoom', currentRoomName, (response) => {
      if (response?.error) {
        console.error('joinRoom error:', response.error);
      } else {
        console.log('joinRoom:', response);
      }
    });
  });

  // Listen for incoming chat messages
  currentSocket.on('chatMessage', (data) => {
    if (data.user.username === myUsername) {
      return; // skip printing own messages
    }
    const time = data.createdAt
      ? new Date(data.createdAt).toLocaleTimeString()
      : '';
    console.log(`[${time}] ${data.user.username}: ${data.text}`);
  });

  currentSocket.on('disconnect', () => {
    console.log('Socket disconnected.');
  });
}

//====================================================
// 6. Chat Mode with blocking Promise
//====================================================
function handleChat() {
  return new Promise((resolve) => {
    if (!authToken) {
      console.log('Please login first.');
      return resolve();
    }
    if (!currentSocket || !currentRoomName) {
      console.log('Please join a room first.');
      return resolve();
    }

    console.log('(type /quit to exit chat)');

    // create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    rl.prompt();

    rl.on('line', (line) => {
      const input = line.trim();
      if (input === '/quit') {
        rl.close();
        return;
      }
      // send message
      currentSocket.emit('chatMessage', {
        roomName: currentRoomName,
        message: input,
      });
      rl.prompt();
    });

    rl.on('close', () => {
      console.log('Exited chat mode.');
      resolve(); // finishes handleChat
    });
  });
}

//====================================================
// MAIN MENU
//====================================================
async function mainLoop() {
  while (true) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select an action:',
        choices: [
          'Sign Up',
          'Login',
          'Create Room',
          'List Rooms',
          'Join Room',
          'Chat',
          'Exit',
        ],
      },
    ]);

    switch (answer.action) {
      case 'Sign Up':
        await handleSignUp();
        break;
      case 'Login':
        await handleLogin();
        break;
      case 'Create Room':
        await handleCreateRoom();
        break;
      case 'List Rooms':
        await handleListRooms();
        break;
      case 'Join Room':
        await handleJoinRoom();
        break;
      case 'Chat':
        // BLOCK here until user quits
        await handleChat();
        break;
      case 'Exit':
        console.log('Goodbye!');
        process.exit(0);
    }
  }
}

//====================================================
// START
//====================================================
(async function start() {
  console.log('Welcome to the CLI Chat Client!');
  await mainLoop();
})();
