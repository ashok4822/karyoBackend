import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import { validationResult } from "express-validator";
import User from "../models/userModel.js";
import Otp from "../models/otpModel.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { transporter } from "../config/mail.js";
import { OTP_EXPIRY_SECONDS } from "../config/constants.js";
import jwt from "jsonwebtoken";
dotenv.config();

const PASSWORD_RESET_TOKEN_SECRET = process.env.PASSWORD_RESET_TOKEN_SECRET || "reset_secret";
const PASSWORD_RESET_TOKEN_EXPIRY = "3m"; // 3 minutes

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const registerUser = async function (req, res) {
  const { username, email, password } = req.body;
  // console.log(username, email, password);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors
        .array()
        .map((error) => error.msg)
        .join(", "),
    });
  }

  try {
    const isUserExist = await User.findOne({ email });

    if (isUserExist) {
      return res.status(400).json({ message: `User already exists` });
    }

    const isUserNameExist = await User.findOne({ username });

    if (isUserNameExist) {
      return res.status(400).json({ message: `Username already exists` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      mobileNo: undefined,
    });

    const savedUserData = await user.save();

    if (!savedUserData) {
      return res.status(400).json({ message: `Failed to update on database` });
    } else {
      const accessToken = generateAccessToken(savedUserData);
      const refreshToken = generateRefreshToken(savedUserData);
      await User.updateOne(
        { _id: savedUserData._id },
        { $set: { refreshToken } }
      );
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "Strict" : "Lax",
        path: "/",
      });
      res.status(200).json({
        user: { id: savedUserData.id, role: savedUserData.role },
        token: accessToken,
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const loginUser = async function (req, res) {
  const { email, password } = req.body;
  // console.log(req.body);

  try {
    // console.log(email);
    // console.log(password);
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: `User not found` });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        message:
          "Your account has been blocked by the admin. Please contact support.",
      });
    }

    if (user.role === "admin") {
      return res
        .status(403)
        .json({ message: "Admins must log in through the admin login page." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: `Invalid Credentials` });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "Strict" : "Lax",
      path: "/",
    });

    res
      .status(200)
      .json({
        user: { id: user.id, role: user.role, username: user.username },
        token: accessToken,
      });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const requestOtp = async (req, res) => {
  const { email, username } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  if (!username)
    return res.status(400).json({ message: "Username is required" });
  const userByEmail = await User.findOne({ email });
  if (userByEmail)
    return res.status(400).json({ message: "User already exists" });
  const userByUsername = await User.findOne({ username });
  if (userByUsername)
    return res.status(400).json({ message: "Username already exists" });
  const otp = generateOtp();
  await Otp.deleteMany({ email });
  await Otp.create({ email, otp });
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Signup OTP Code",
    text: `Your OTP code is: ${otp}`,
  });
  res.json({ message: "OTP sent to email" });
};

export const verifyOtp = async (req, res) => {
  const { email, otp, username, password } = req.body;
  if (!email || !otp || !username || !password)
    return res.status(400).json({ message: "All fields required" });
  const otpDoc = await Otp.findOne({ email, otp });
  if (!otpDoc)
    return res.status(400).json({ message: "Invalid or expired OTP" });
  if (
    Date.now() - new Date(otpDoc.createdAt).getTime() >
    OTP_EXPIRY_SECONDS * 1000
  ) {
    await Otp.deleteMany({ email });
    return res
      .status(400)
      .json({ message: "OTP expired. Please request a new one." });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({
    email,
    username,
    password: hashedPassword,
    mobileNo: undefined,
  });
  await user.save();
  await Otp.deleteMany({ email });
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const isProduction = process.env.NODE_ENV === "production";
  await User.updateOne({ _id: user._id }, { $set: { refreshToken } });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "Strict" : "Lax",
    path: "/",
  });
  res
    .status(200)
    .json({ user: { id: user.id, role: user.role }, token: accessToken });
};

export const requestPasswordResetOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });
  const otp = generateOtp();
  await Otp.deleteMany({ email });
  const otpDoc = await Otp.create({ email, otp });
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Password Reset OTP Code",
    text: `Your OTP code is: ${otp}`,
  });
  res.json({ 
    message: "OTP sent to email",
    expiresAt: new Date(otpDoc.createdAt).getTime() + OTP_EXPIRY_SECONDS * 1000 // ms timestamp
  });
};

export const verifyPasswordResetOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ message: "All fields required" });
  const otpDoc = await Otp.findOne({ email, otp });
  if (!otpDoc)
    return res.status(400).json({ message: "Invalid or expired OTP" });
  if (
    Date.now() - new Date(otpDoc.createdAt).getTime() >
    OTP_EXPIRY_SECONDS * 1000
  ) {
    await Otp.deleteMany({ email });
    return res
      .status(400)
      .json({ message: "OTP expired. Please request a new one." });
  }
  // Generate a password reset token (JWT)
  const resetToken = jwt.sign({ email }, PASSWORD_RESET_TOKEN_SECRET, { expiresIn: PASSWORD_RESET_TOKEN_EXPIRY });
  await Otp.deleteMany({ email }); // Invalidate OTP after successful verification
  res.status(200).json({ message: "OTP verified", resetToken });
};

export const resetPassword = async (req, res) => {
  const { email, newPassword, resetToken } = req.body;
  if (!email || !newPassword || !resetToken)
    return res.status(400).json({ message: "All fields required" });
  // Verify the reset token
  try {
    const payload = jwt.verify(resetToken, PASSWORD_RESET_TOKEN_SECRET);
    if (payload.email !== email) {
      return res.status(400).json({ message: "Invalid reset token" });
    }
  } catch (err) {
    return res.status(400).json({ message: "Reset token expired or invalid. Please request a new OTP." });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.status(200).json({ message: "Password reset successful" });
};

export const refreshToken = async (req, res) => {
  try {
    const token = req.cookies["refreshToken"];
    console.log("[refreshToken] Starting refresh process");
    
    if (!token) {
      console.log("[refreshToken] No refresh token cookie found");
      return res.status(401).json({ message: "No refresh token" });
    }
    
    let payload;
    try {
      payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      console.log("[refreshToken] JWT verification successful for user:", payload.userId);
    } catch (err) {
      console.log("[refreshToken] JWT verification failed:", err.message);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
    const user = await User.findById(payload.userId);
    if (!user) {
      console.log("[refreshToken] No user found for userId:", payload.userId);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
    if (user.refreshToken !== token) {
      console.log("[refreshToken] Token mismatch. User's stored token:", user.refreshToken ? "exists" : "missing", "Cookie token:", token ? "exists" : "missing");
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    
    const newAccessToken = generateAccessToken(user);
    console.log("[refreshToken] Success for user:", user.email);
    res.json({ token: newAccessToken });
  } catch (error) {
    console.log("[refreshToken] Internal server error:", error.message);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};
