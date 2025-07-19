import User from "../models/userModel.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";
import ShippingAddress from "../models/shippingAddressModel.js";
import { body, validationResult } from "express-validator";
import Otp from "../models/otpModel.js";
import { transporter } from "../config/mail.js";
import { OTP_EXPIRY_SECONDS } from "../config/constants.js";
dotenv.config();

export const logout = async function (req, res) {
  try {
    const refreshToken = req.cookies["refreshToken"];
    if (refreshToken) {
      await User.updateOne({ refreshToken }, { $set: { refreshToken: "" } });
    }
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
      path: '/',
    });
    res.status(200).json({ message: `Successfully Logged out!` });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const adminLogout = async function (req, res) {
  try {
    const refreshToken = req.cookies["adminRefreshToken"];
    if (refreshToken) {
      await User.updateOne({ refreshToken }, { $set: { refreshToken: "" } });
    }
    res.clearCookie("adminRefreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
      path: '/admin',
    });
    res.status(200).json({ message: `Successfully Logged out!` });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const updateProfile = async function (req, res) {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, mobileNo, address } = req.body;

    // Validation
    if (!firstName || typeof firstName !== "string" || !/^[A-Za-z]{2,30}$/.test(firstName.trim())) {
      return res.status(400).json({ message: "First name is required and must be 2-30 letters." });
    }
    if (!lastName || typeof lastName !== "string" || !/^[A-Za-z]{2,30}$/.test(lastName.trim())) {
      return res.status(400).json({ message: "Last name is required and must be 2-30 letters." });
    }
    if (!mobileNo || typeof mobileNo !== "string" || !/^\d{10}$/.test(mobileNo.trim())) {
      return res.status(400).json({ message: "Mobile number is required and must be 10 digits." });
    }
    if (!address || typeof address !== "string" || address.trim().length < 5 || address.trim().length > 100) {
      return res.status(400).json({ message: "Address is required and must be 5-100 characters." });
    }

    // If mobile number is being updated, check for uniqueness
    if (mobileNo) {
      const existingUser = await User.findOne({
        mobileNo: mobileNo,
        _id: { $ne: userId },
      });
      if (existingUser) {
        return res.status(400).json({
          message: `Mobile number is already registered with another account`,
        });
      }
    }

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (mobileNo !== undefined) {
      updateData.mobileNo = mobileNo.trim();
    }
    if (address !== undefined) updateData.address = address;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: `User not found` });
    }

    res.status(200).json({
      message: `Profile updated successfully`,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobileNo: user.mobileNo,
        address: user.address,
        role: user.role,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const getProfile = async function (req, res) {
  try {
    const userId = req.user.userId;
    console.log("[getProfile] Request from user:", userId);
    
    const user = await User.findById(userId).select("-password -refreshToken");
    // console.log(user);

    if (!user) {
      console.log("[getProfile] User not found:", userId);
      return res.status(404).json({ message: `User not found` });
    }

    console.log("[getProfile] Profile retrieved successfully for:", user.email);
    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobileNo: user.mobileNo,
        address: user.address,
        profileImage: user.profileImage,
        role: user.role,
        createdAt: user.createdAt,
        isDeleted: user.isDeleted,
      },
    });
  } catch (error) {
    console.log("[getProfile] Error:", error.message);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const uploadProfileImage = async function (req, res) {
  try {
    const userId = req.user.userId;
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "user-profile-images",
      width: 300,
      height: 300,
      crop: "fill",
    });
    // Update user profileImage
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { profileImage: result.secure_url } },
      { new: true }
    );
    // Delete local file after upload
    const fs = await import('fs');
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (err) {
      console.log('Error deleting profile image file:', err.message);
    }
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({
      message: "Profile image updated successfully",
      profileImage: user.profileImage,
    });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const createShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      recipientName,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault,
    } = req.body;

    // Backend validation
    const errors = {};
    if (!recipientName || typeof recipientName !== 'string' || recipientName.trim().length < 2 || recipientName.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(recipientName.trim())) {
      errors.recipientName = 'Recipient name is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!addressLine1 || typeof addressLine1 !== 'string' || addressLine1.trim().length < 5 || addressLine1.trim().length > 100) {
      errors.addressLine1 = 'Address Line 1 is required and must be 5-100 characters.';
    }
    if (!city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(city.trim())) {
      errors.city = 'City is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!state || typeof state !== 'string' || state.trim().length < 2 || state.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(state.trim())) {
      errors.state = 'State is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!postalCode || typeof postalCode !== 'string' || postalCode.trim().length < 4 || postalCode.trim().length > 10 || !/^\d{4,10}$/.test(postalCode.trim())) {
      errors.postalCode = 'Postal code is required and must be 4-10 digits.';
    }
    if (!country || typeof country !== 'string' || country.trim().length < 2 || country.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(country.trim())) {
      errors.country = 'Country is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || !/^\d{10,15}$/.test(phoneNumber.trim())) {
      errors.phoneNumber = 'Phone number is required and must be 10-15 digits.';
    }
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    // If isDefault is true, unset previous default
    if (isDefault) {
      await ShippingAddress.updateMany({ user: userId, isDefault: true }, { $set: { isDefault: false } });
    }

    const address = new ShippingAddress({
      user: userId,
      recipientName,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault: !!isDefault,
    });
    await address.save();
    res.status(201).json({ message: "Shipping address added", address });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const getShippingAddresses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addresses = await ShippingAddress.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
    res.status(200).json({ addresses });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const setDefaultShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;
    // Unset previous default
    await ShippingAddress.updateMany({ user: userId, isDefault: true }, { $set: { isDefault: false } });
    // Set new default
    const updated = await ShippingAddress.findByIdAndUpdate(addressId, { $set: { isDefault: true } }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Address not found' });
    res.status(200).json({ message: 'Default address set', address: updated });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const updateShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;
    const {
      recipientName,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phoneNumber,
      isDefault,
    } = req.body;

    // Backend validation
    const errors = {};
    if (!recipientName || typeof recipientName !== 'string' || recipientName.trim().length < 2 || recipientName.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(recipientName.trim())) {
      errors.recipientName = 'Recipient name is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!addressLine1 || typeof addressLine1 !== 'string' || addressLine1.trim().length < 5 || addressLine1.trim().length > 100) {
      errors.addressLine1 = 'Address Line 1 is required and must be 5-100 characters.';
    }
    if (!city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(city.trim())) {
      errors.city = 'City is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!state || typeof state !== 'string' || state.trim().length < 2 || state.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(state.trim())) {
      errors.state = 'State is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!postalCode || typeof postalCode !== 'string' || postalCode.trim().length < 4 || postalCode.trim().length > 10 || !/^\d{4,10}$/.test(postalCode.trim())) {
      errors.postalCode = 'Postal code is required and must be 4-10 digits.';
    }
    if (!country || typeof country !== 'string' || country.trim().length < 2 || country.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(country.trim())) {
      errors.country = 'Country is required, 2-50 letters, and may only contain letters, spaces, apostrophes, hyphens, and periods.';
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || !/^\d{10,15}$/.test(phoneNumber.trim())) {
      errors.phoneNumber = 'Phone number is required and must be 10-15 digits.';
    }
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    // Check if address belongs to user
    const existingAddress = await ShippingAddress.findOne({ _id: addressId, user: userId });
    if (!existingAddress) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // If isDefault is true, unset previous default
    if (isDefault) {
      await ShippingAddress.updateMany({ user: userId, isDefault: true }, { $set: { isDefault: false } });
    }

    const updatedAddress = await ShippingAddress.findByIdAndUpdate(
      addressId,
      {
        recipientName,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        phoneNumber,
        isDefault: !!isDefault,
      },
      { new: true }
    );

    res.status(200).json({ message: 'Address updated successfully', address: updatedAddress });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const deleteShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;

    // Check if address belongs to user
    const address = await ShippingAddress.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // If this is the default address, don't allow deletion
    if (address.isDefault) {
      return res.status(400).json({ message: 'Cannot delete default address. Please set another address as default first.' });
    }

    await ShippingAddress.findByIdAndDelete(addressId);
    res.status(200).json({ message: 'Address deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const requestEmailChangeOtp = [
  body("email").isEmail().withMessage("Please provide a valid email address").normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array().map(e => e.msg).join(", ") });
    }
    const { email } = req.body;
    const userId = req.user.userId;
    // Check if email is already used by another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered with another account" });
    }
    // Generate and save OTP
    const otp = generateOtp();
    await Otp.deleteMany({ email });
    await Otp.create({ email, otp });
    // Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Email Change OTP Code",
      text: `Your OTP code is: ${otp}`,
    });
    res.json({ message: "OTP sent to email" });
  }
];

export const verifyEmailChangeOtp = [
  body("email").isEmail().withMessage("Please provide a valid email address").normalizeEmail(),
  body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array().map(e => e.msg).join(", ") });
    }
    const { email, otp } = req.body;
    const userId = req.user.userId;
    // Find OTP
    const otpDoc = await Otp.findOne({ email, otp });
    if (!otpDoc) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    if (Date.now() - new Date(otpDoc.createdAt).getTime() > OTP_EXPIRY_SECONDS * 1000) {
      await Otp.deleteMany({ email });
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }
    // Update user's email
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.email = email;
    await user.save();
    await Otp.deleteMany({ email });
    res.status(200).json({ message: "Email updated successfully", email });
  }
];
