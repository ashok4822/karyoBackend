import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import cookieParser from "cookie-parser";
import { isAdmin, verifyToken } from "./middleware/authMiddleware.js";
import session from "express-session";
import passport from "passport";
import "./config/google.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import offerRoutes from "./routes/offerRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Log current environment
console.log(`Running in ${NODE_ENV} mode`);

// app.use(cors());
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (NODE_ENV === "development") {
        const allowedDevOrigins = ["http://localhost:8080"];
        if (allowedDevOrigins.includes(origin)) {
          return callback(null, true);
        }
      } else {
        const allowedProdOrigins =
          process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [];
        if (allowedProdOrigins.includes(origin)) {
          return callback(null, true);
        }
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);``

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

// Order routes
app.use("/orders", orderRoutes);

// Wishlist routes
app.use("/wishlist", wishlistRoutes);

// Cart routes
app.use("/cart", cartRoutes);

// Offer routes
app.use("/api", offerRoutes);

// Referral routes
app.use("/api", referralRoutes);

//Public routes
app.use("/", publicRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
