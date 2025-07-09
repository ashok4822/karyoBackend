import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;

export const generateAccessToken = function (user) {
  const payload = { userId: user._id, role: user.role };
  return jwt.sign(payload, accessTokenSecret, { expiresIn: "15m" });
};

export const generateRefreshToken = function (user) {
  const payload = { userId: user._id, role: user.role };
  return jwt.sign(payload, refreshTokenSecret, { expiresIn: "7d" });
};

export const verifyAccessToken = function (token) {
  try {
    return jwt.verify(token, accessTokenSecret);
  } catch (error) {
    return null;
  }
};

export const verifyRefreshToken = function (token) {
  try {
    return jwt.verify(token, refreshTokenSecret);
  } catch (error) {
    return null;
  }
};
