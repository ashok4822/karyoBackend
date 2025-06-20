import mongoose from "mongoose";
import { OTP_EXPIRY_SECONDS } from "../config/constants.js";

const otpSchema = new mongoose.Schema({
  email: String,
  otp: String,
  createdAt: { type: Date, default: Date.now, expires: OTP_EXPIRY_SECONDS },
});

export default mongoose.model("otp", otpSchema);
