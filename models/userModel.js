import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  mobileNo: {
    type: String,
    // required: true,
    // unique: true,
    // sparse: true, // allow multiple nulls
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    // required: true,
    trim: true,
  },
  lastName: {
    type: String,
    // required: true,
    trim: true,
  },
  profileImage: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    // enum: ["user", "admin"],
    default: "user",
  },
  refreshToken: { type: String },
});

// Add a compound index to ensure mobile numbers are unique when provided
userSchema.index({ mobileNo: 1 }, { 
  unique: true,
  partialFilterExpression: { mobileNo: { $type: "string" } }
});

const User = mongoose.model("User", userSchema);
export default User;
