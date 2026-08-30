# Caryo — Backend API

> RESTful API server for **Caryo**, a full-featured e-commerce platform for backpacks.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)](https://mongodb.com)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Routes](#-api-routes)
- [Deployment](#-deployment)

---

## 🌐 Overview

Karyo's backend is a Node.js REST API built with Express.js v5, connected to a MongoDB Atlas database via Mongoose. It handles authentication, product management, order processing, payment integration, and admin analytics.

The frontend repository (React + Vite) can be found separately.

---

## ✨ Features

### Authentication & Security

- **JWT-based auth** with short-lived access tokens (5m) and refresh tokens (7d)
- **Google OAuth 2.0** via Passport.js
- **OTP email verification** via Nodemailer on signup and password reset
- **HTTP-only cookies** for secure token storage
- **bcrypt** password hashing
- **Rate limiting** on sensitive routes (login, OTP, etc.)

### Product & Catalog

- Multi-variant product management (size, color, stock per variant)
- Category management with soft-delete (list/unlist)
- Image upload, crop, and optimization via **Multer → Sharp → Cloudinary**
- Pagination, search, and multi-filter support

### Shopping & Orders

- Persistent **Cart** management with stock validation
- **Wishlist** support
- Multi-address management per user
- Full order lifecycle: Placed → Shipped → Delivered → Returned/Refunded
- **Razorpay** payment gateway integration
- **Cash on Delivery (COD)** with configurable max amount
- Automated **PDF invoice** generation with jsPDF + autotable

### Discounts & Promotions

- **Coupons** — single-use, minimum purchase, expiry-based
- **Offers** — product-level and category-level percentage discounts
- **Referral Program** — unique codes, bonus wallet credits on successful referral
- **Digital Wallet** — auto-credit on returns/refunds, usable at checkout

### Admin

- Full **User Management** (block/unblock)
- **Order Management** with status transitions and return approvals
- **Dashboard analytics** — revenue, orders, top products/categories (Recharts-ready data)
- **Sales Report** generation with date-range filtering, downloadable as PDF

---

## 🛠 Tech Stack

| Layer       | Technology                                  |
| ----------- | ------------------------------------------- |
| Runtime     | Node.js 20.x                                |
| Framework   | Express.js 5.x                              |
| Database    | MongoDB (Mongoose ODM)                      |
| Auth        | JWT, Passport.js (Google OAuth 2.0)         |
| Email       | Nodemailer, Resend                          |
| File Upload | Multer, Sharp, Cloudinary                   |
| Payment     | Razorpay                                    |
| PDF         | jsPDF, jsPDF-autotable                      |
| Validation  | express-validator                           |
| Security    | bcryptjs, express-rate-limit, cookie-parser |
| Sessions    | express-session + connect-mongo             |

---

## 📁 Project Structure

```
server/
├── config/
│   ├── db.js               # MongoDB connection
│   └── google.js           # Passport Google OAuth strategy
├── constants/              # App-wide constants
├── controllers/
│   ├── adminController.js
│   ├── adminDashboard.js
│   ├── authController.js
│   ├── cartController.js
│   ├── categoryController.js
│   ├── contactController.js
│   ├── couponController.js
│   ├── discountController.js
│   ├── offerController.js
│   ├── orderController.js
│   ├── productController.js
│   ├── profileController.js
│   ├── referralController.js
│   ├── walletController.js
│   └── wishlistController.js
├── middleware/
│   ├── authMiddleware.js   # JWT verification, role guard
│   ├── rateLimiter.js      # Route-specific rate limiters
│   └── upload.js           # Multer config for image uploads
├── models/
│   ├── cartModel.js
│   ├── categoryModel.js
│   ├── couponModel.js
│   ├── discountModel.js
│   ├── offerModel.js
│   ├── orderModel.js
│   ├── otpModel.js
│   ├── productModel.js
│   ├── productVariantModel.js
│   ├── referralModel.js
│   ├── shippingAddressModel.js
│   ├── userDiscountUsageModel.js
│   ├── userModel.js
│   ├── walletModel.js
│   └── wishlistModel.js
├── routes/
│   ├── adminRoutes.js
│   ├── authRoutes.js
│   ├── cartRoutes.js
│   ├── offerRoutes.js
│   ├── orderRoutes.js
│   ├── publicRoutes.js
│   ├── referralRoutes.js
│   ├── userRoutes.js
│   └── wishlistRoutes.js
├── utils/                  # Helper utilities
├── scripts/                # Seeding / migration scripts
├── .env.example            # Environment variable template
├── render.yaml             # Render deployment config
└── index.js                # App entry point
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+ and npm
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster
- [Cloudinary](https://cloudinary.com) account
- [Razorpay](https://razorpay.com) account
- Google OAuth credentials from [Google Cloud Console](https://console.cloud.google.com)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ashok4822/karyoBackend.git
cd karyo-backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Fill in all values in .env (see Environment Variables section)

# 4. Start the development server
npm run dev
```

The server will start at `http://localhost:5000`.

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in the following:

```env
# Server
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/<dbname>

# CORS (frontend URL)
ALLOWED_ORIGINS=http://localhost:8080

# JWT
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
JWT_ACCESSTOKEN_EXPIRY_IN=5m
JWT_REFRESHTOKEN_EXPIRY_IN=7d

# Cookies & Sessions
COOKIE_MAX_AGE_DAYS=7
SESSION_SECRET=your_session_secret

# Password Reset
PASSWORD_RESET_TOKEN_SECRET=your_reset_secret
PASSWORD_RESET_TOKEN_EXPIRY=3m

# Email (Nodemailer / Gmail App Password)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
GOOGLE_AUTH_SUCCESS_REDIRECT_URL=http://localhost:8080/google-auth-success
LOGIN_FAILURE_REDIRECT_URL=http://localhost:8080/login

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Razorpay
RAZOR_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZOR_SECRET_ID=your_razorpay_secret

# Business Logic
MAX_COD_AMOUNT=1000
OTP_EXPIRY_SECONDS=60
REFERRAL_COUPON_VALID_DAYS=30
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_WINDOW_HOURS=1
```

---

## 🗺 API Routes

| Prefix        | Description                                               |
| ------------- | --------------------------------------------------------- |
| `GET /`       | Public product catalog, category listing                  |
| `/auth/*`     | Register, login, logout, Google OAuth, OTP, refresh token |
| `/users/*`    | User profile, addresses, wallet, orders (authenticated)   |
| `/cart/*`     | Cart operations (authenticated)                           |
| `/wishlist/*` | Wishlist operations (authenticated)                       |
| `/orders/*`   | Place orders, Razorpay payment, invoice download          |
| `/api/offers` | Active offers and referral endpoints                      |
| `/admin/*`    | Admin-only routes (requires admin role)                   |

> Full API documentation (Postman collection) is available in the `/docs` directory.

---

## ☁️ Deployment

The backend is configured to deploy on **[Render](https://render.com)** using `render.yaml`.

```yaml
services:
  - type: web
    name: karyo-backend
    runtime: node
    buildCommand: npm install
    startCommand: npm start
```

### Deployment Steps

1. Push the repository to GitHub.
2. Connect the repo on [Render Dashboard](https://dashboard.render.com).
3. Add all environment variables from `.env.example` in the Render Dashboard → **Environment** tab.
4. Deploy.

> ⚠️ **Never commit `.env` or secrets to version control.**

---

## 📄 License

ISC © 2025 Caryo
