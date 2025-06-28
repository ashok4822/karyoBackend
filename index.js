import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import cookieParser from "cookie-parser";
import { isAdmin, verifyToken } from "./middleware/authMiddleware.js";
import session from "express-session";
import passport from "passport";
import "./config/google.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
dotenv.config();

const app = express();
const PORT = 5000;

// app.use(cors());
app.use(
  cors({
    origin: function (origin, callback) {
      console.log('CORS request from origin:', origin);
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost:8080',
        'http://localhost:8081', 
        'http://localhost:8082',
        'http://localhost:8083',
        'http://localhost:8084',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:8081',
        'http://127.0.0.1:8082',
        'http://127.0.0.1:8083',
        'http://127.0.0.1:8084'
      ];
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // allow cookies and credentials
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Passport session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
connectDB();

//auth route
app.use("/auth", authRoutes);

//admin routes
app.use("/admin", adminRoutes);

// User routes
app.use("/users", userRoutes);

// Wishlist routes
app.use("/wishlist", wishlistRoutes);

// Cart routes
app.use("/cart", cartRoutes);

//Public routes
app.use("/", publicRoutes);





app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
