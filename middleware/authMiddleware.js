import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

export const verifyToken = async function (req, res, next) {
  console.log("Inside verifytoken function");
  const accessToken = req.cookies["accessToken"];

  console.log(accessToken);

  if (!accessToken) {
    return res.status(401).json({ message: `No token, authorization denied` });
  }

  const decoded = jwt.decode(accessToken);
  const userId = decoded.userId;
  req.user = decoded;

  if (!userId) {
    return res
      .status(401)
      .json({ message: `Invalid token, authorization denied` });
  }

  try {
    const user = await User.findOne({ _id: userId });
    const isValidToken = verifyAccessToken(accessToken);

    if (!isValidToken) {
      const isRefreshTokenVerified = verifyRefreshToken(user.refreshToken);

      if (isRefreshTokenVerified) {
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await User.findByIdAndUpdate(
          { _id: userId },
          { $set: { refreshToken } }
        );

        res.cookie("accessToken", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: `Strict`,
        });
      } else {
        throw new Error(`verificaion failed`);
      }
    }
    next();
  } catch (error) {
    console.error(`Can't find out the user`);
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
