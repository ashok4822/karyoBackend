import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";

// Limit login attempts: max 5 per 15 minutes
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    message: "Too many login attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Limit refresh token calls: max 120 per hour per user (fallback to IP)
export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 120, // 120 per hour
  keyGenerator: (req) => {
    try {
      const token = req.cookies["refreshToken"];
      if (!token) return req.ip;
      const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      return payload.userId || req.ip;
    } catch {
      return req.ip;
    }
  },
  message: {
    message: "Too many refresh attempts. Please try again after an hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
