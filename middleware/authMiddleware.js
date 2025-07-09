import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import {
  verifyAccessToken,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
} from "../utils/jwt.js";

export const verifyToken = async function (req, res, next) {
  let accessToken = req.cookies["accessToken"];
  // Check Authorization header if not in cookie
  if (
    !accessToken &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    accessToken = req.headers.authorization.split(" ")[1];
  }

  if (!accessToken) {
    return res.status(401).json({ message: `No token, authorization denied` });
  }

  try {
    // Verify the access token
    const decoded = verifyAccessToken(accessToken);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userId = decoded.userId;
    if (!userId) {
      return res.status(401).json({ message: `Invalid token, authorization denied` });
    }

    // Find the user
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is deleted
    if (user.isDeleted) {
      return res.status(401).json({ message: "User account has been deleted" });
    }

    // Attach user info to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error(`Token verification error:`, error.message);
    return res.status(401).json({ message: "Token verification failed" });
  }
};

//1Middleware for admin access
export const isAdmin = function (req, res, next) {
  console.log("inside isAdmin function");
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: `Access denied. You do not have admin privileges.` });
  }
  next();
};

// Middleware to verify JWT and attach user to req
// export const protect = async (req, res, next) => {
//   let token;
//   if (
//     req.headers.authorization &&
//     req.headers.authorization.startsWith('Bearer ')
//   ) {
//     token = req.headers.authorization.split(' ')[1];
//   }
//   if (!token) {
//     return res.status(401).json({ message: 'Not authorized, no token' });
//   }
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = await User.findById(decoded.id).select('-password');
//     if (!req.user) {
//       return res.status(401).json({ message: 'User not found' });
//     }
//     next();
//   } catch (error) {
//     return res.status(401).json({ message: 'Not authorized, token failed' });
//   }
// };

// Middleware for role-based access
// export const authorizeRoles = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({ message: 'Forbidden: insufficient rights' });
//     }
//     next();
//   };
// };

// Combines verifyToken and isAdmin for admin-only routes
export const verifyAdmin = [verifyToken, isAdmin];
