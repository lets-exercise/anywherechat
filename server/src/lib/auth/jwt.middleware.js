import jwt from 'jsonwebtoken';
import User from '../models/user.js';

const jwtMiddleware = async (ctx, next) => {
  const token = ctx.cookies.get('access_token');
  if (!token) return next(); // 토큰이 없다면
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    ctx.state.user = {
      _id: decoded._id,
      username: decoded.username,
    };

    // 토큰 유효기간이 3.5일 미만이라면 재발급
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp - now < 60 * 60 * 24 * 3.5) {
      const user = await User.findById(decoded._id);
      const newToken = user.generateToken();
      ctx.cookies.set('access_token', newToken, {
        maxAge: 1000 * 60 * 60 * 7,
        httpOnly: true,
      });
    }
    console.log(decoded);
    return next();
  } catch (e) {
    // 검증 실패
    return next();
  }
};

export default jwtMiddleware;
