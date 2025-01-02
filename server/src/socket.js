import Message from '../models/message.js';
import Room from '../models/room.js';

export default (io) => {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // 방 입장
    socket.on('joinRoom', async ({ roomId, userId }) => {
      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);
    });

    // 메시지 전송
    socket.on('sendMessage', async ({ roomId, userId, content }) => {
      const newMessage = new Message({
        roomId,
        sender: userId,
        content,
        createdAt: new Date(),
      });
      await newMessage.save();

      // 방에 있는 모든 클라이언트에게 메시지 전송
      io.to(roomId).emit('newMessage', {
        roomId,
        sender: userId,
        content,
        createdAt: newMessage.createdAt,
      });
    });
됨

    // 연결 해제
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};
