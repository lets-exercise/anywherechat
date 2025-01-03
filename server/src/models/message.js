import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room', // 어떤 Room에서 작성된 메시지인지
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // 메시지를 보낸 사람
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    // 보낸 시각
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Message', messageSchema);
