import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import jwt from "jsonwebtoken";

export const adminLogin = async function (req, res) {
  console.log("request received");
  const { email, password } = req.body;
  try {
    // 1. Validate fields
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email, role: "admin" });
    if (!user) {
      return res
        .status(400)
        .json({ message: "Admin not found or not authorized" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });
    const isProduction = process.env.NODE_ENV === "production";
    // res.clearCookie("refreshToken", { path: "/" });
    res.cookie("adminRefreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "Strict" : "Lax",
      path: "/admin",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res
      .status(200)
      .json({ user: { id: user.id, role: user.role }, token: accessToken });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const getUsersPaginated = async function (req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || "";
    const status = req.query.status; // 'active', 'blocked', or undefined
    let query = {
      $or: [
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ],
    };
    if (status === "active") query.isDeleted = false;
    else if (status === "blocked") query.isDeleted = true;
    // else show all users
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const blockUnblockUser = async function (req, res) {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // Prevent blocking admin users
    if (user.role === "admin") {
      return res.status(403).json({ message: "Cannot block admin users" });
    }
    
    user.isDeleted = !user.isDeleted;
    await user.save();
    res.json({
      message: user.isDeleted ? "User blocked" : "User unblocked",
      user,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const adminRefreshToken = async (req, res) => {
  try {
    const token = req.cookies["adminRefreshToken"];
    if (!token) return res.status(401).json({ message: "No refresh token" });
    let payload;
    try {
      payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const user = await User.findById(payload.userId);
    if (!user || user.refreshToken !== token || user.role !== "admin") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const newAccessToken = generateAccessToken(user);
    res.json({ token: newAccessToken });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};
