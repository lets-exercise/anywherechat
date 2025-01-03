import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true, // 방에 접근할 때 사용하는 ID (중복 불가)
      trim: true,
    },
    roomName: {
      type: String,
      required: true,
    },
    roomPassword: {
      type: String,
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// 비밀번호 해싱 (방을 생성할 때 비밀번호가 바뀌면 해싱)
roomSchema.pre('save', async function (next) {
  if (!this.isModified('roomPassword')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.roomPassword = await bcrypt.hash(this.roomPassword, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// 방 비밀번호 비교 메서드
roomSchema.methods.compareRoomPassword = async function (inputPassword) {
  return bcrypt.compare(inputPassword, this.roomPassword);
};

export default mongoose.model('Room', roomSchema);
