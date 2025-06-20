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
dotenv.config();

const app = express();
const PORT = 5000;

// app.use(cors());
app.use(
  cors({
    origin: "http://localhost:8080", // your frontend URL
    credentials: true, // allow cookies and credentials
  })
);
app.use(express.json());
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
app.use("/users", verifyToken, userRoutes);

//Public routes
app.use("/", publicRoutes);

// Mock dashboard data
const dashboardData = {
  totalSales: 12345,
  totalOrders: 120,
  totalProducts: 58,
  totalCustomers: 34,
  salesGrowth: 12,
  orderGrowth: 8,
  recentOrders: [
    { id: 1, customer: "John Doe", amount: 250, status: "completed" },
    { id: 2, customer: "Jane Smith", amount: 120, status: "pending" },
    { id: 3, customer: "Alice Brown", amount: 90, status: "cancelled" },
  ],
  lowStockProducts: [
    { id: 1, name: "Product A", stock: 3, maxStock: 50 },
    { id: 2, name: "Product B", stock: 7, maxStock: 40 },
  ],
};

app.get("/dashboard", (req, res) => {
  res.json(dashboardData);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
