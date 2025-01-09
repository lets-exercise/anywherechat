#!/usr/bin/env node

const axios = require('axios');
const { io } = require('socket.io-client');
const readline = require('readline');

// 실제 배포 환경에 맞게 수정필요
const BASE_URL = process.env.CHAT_SERVER_URL || 'http://localhost:4000';

// Socket.IO 클라이언트 (아직은 connect하지 않고 필요 시에 연결)
let socket = null;

// JWT 토큰과 사용자 ID를 저장할 변수
let token = null;
let userId = null;

// readline 설정
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Socket.IO 관련 이벤트 설정
function initSocketEvents() {
  if (!socket) return;

  socket.on('connect', () => {
    console.log('[socket.io] Connected:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('[socket.io] Disconnected');
  });

  // 서버에서 'newMessage' 이벤트 수신
  socket.on('newMessage', (data) => {
    const { roomId, sender, content } = data;
    console.log(`[${roomId}] ${sender} : ${content}`);
  });
}

// Socket.IO 서버 연결
function connectSocket() {
  if (!socket || socket.disconnected) {
    socket = io(BASE_URL, {
      // 서버에 쿠키/토큰 전송 시 참고
      // withCredentials: true,
    });
    initSocketEvents();
  }
}

// 메뉴 출력
function printMenu() {
  console.log('\n===================');
  console.log('1. Register');
  console.log('2. Login');
  console.log('3. Create Room');
  console.log('4. Join Room');
  console.log('5. Send Message');
  console.log('6. Disconnect Socket');
  console.log('0. Exit');
  console.log('===================');
}

async function main() {
  while (true) {
    printMenu();
    const choice = await askQuestion('Select an option: ');

    switch (choice) {
      case '0': {
        // 종료
        console.log('Exiting...');
        rl.close();
        process.exit(0);
      }

      case '1': {
        // Register
        const username = await askQuestion('Username: ');
        const password = await askQuestion('Password: ');

        try {
          const res = await axios.post(`${BASE_URL}/api/auth/register`, {
            username,
            password,
          });
          console.log('Register response:', res.data);
        } catch (error) {
          console.error('Register error:', error?.response?.data || error);
        }
        break;
      }

      case '2': {
        // Login
        const username = await askQuestion('Username: ');
        const password = await askQuestion('Password: ');

        try {
          const res = await axios.post(`${BASE_URL}/api/auth/login`, {
            username,
            password,
          });
          const data = res.data;

          if (data.token) {
            token = data.token;
            userId = data.userId;
            console.log('Login successful!');
          } else {
            console.log('Login failed.');
          }
        } catch (error) {
          console.error('Login error:', error?.response?.data || error);
        }
        break;
      }

      case '3': {
        // Create Room
        if (!token) {
          console.log('Please login first!');
          break;
        }

        const roomId = await askQuestion('Room ID: ');
        const roomName = await askQuestion('Room Name: ');
        const roomPassword = await askQuestion('Room Password: ');

        try {
          const headers = { Authorization: `Bearer ${token}` };
          const res = await axios.post(`${BASE_URL}/api/rooms/create`, {
            roomId,
            roomName,
            roomPassword,
          }, { headers });

          console.log('Create room response:', res.data);
        } catch (error) {
          console.error('Create room error:', error?.response?.data || error);
        }
        break;
      }

      case '4': {
        // Join Room
        if (!token) {
          console.log('Please login first!');
          break;
        }

        const joinId = await askQuestion('Room ID to join: ');
        const joinPw = await askQuestion('Room Password: ');

        try {
          const headers = { Authorization: `Bearer ${token}` };
          const res = await axios.post(`${BASE_URL}/api/rooms/join`, {
            roomId: joinId,
            roomPassword: joinPw,
          }, { headers });

          if (res.status === 200) {
            console.log(`Joined room: ${joinId}`);
            // Socket.io 연결 후 joinRoom 이벤트 발송
            connectSocket();
            socket.emit('joinRoom', { roomId: joinId, userId });
          } else {
            console.log('Room join failed:', res.data);
          }
        } catch (error) {
          console.error('Join room error:', error?.response?.data || error);
        }
        break;
      }

      case '5': {
        // Send Message
        if (!socket || socket.disconnected) {
          console.log('Socket is not connected. Please join a room first.');
          break;
        }
        const targetRoomId = await askQuestion('Target Room ID: ');
        const message = await askQuestion('Message: ');

        socket.emit('sendMessage', {
          roomId: targetRoomId,
          userId,
          content: message,
        });
        break;
      }

      case '6': {
        // Disconnect Socket
        if (socket && socket.connected) {
          socket.disconnect();
          console.log('Socket disconnected manually.');
        } else {
          console.log('Socket is not connected.');
        }
        break;
      }

      default: {
        console.log('Invalid choice. Try again.');
        break;
      }
    }
  }
}

// 실행
main().catch((err) => {
  console.error('Error in main:', err);
  rl.close();
  process.exit(1);
});
