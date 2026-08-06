import { statusCodes } from "../constants/statusCodes.js";
import { MESSAGES } from "../constants/messages.js";
import User from "../models/userModel.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import cloudinary, { uploadFromBuffer } from "../config/cloudinary.js";
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
    res.status(statusCodes.OK).json({ message: MESSAGES.AUTH.LOGOUT_SUCCESS });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
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
    res.status(statusCodes.OK).json({ message: MESSAGES.AUTH.LOGOUT_SUCCESS });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
  }
};

export const updateProfile = async function (req, res) {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, mobileNo, address } = req.body;

    // Validation
    if (!firstName || typeof firstName !== "string" || !/^[A-Za-z]{2,30}$/.test(firstName.trim())) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.VALIDATION.FIRST_NAME });
    }
    if (!lastName || typeof lastName !== "string" || !/^[A-Za-z]{2,30}$/.test(lastName.trim())) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.VALIDATION.LAST_NAME });
    }
    if (!mobileNo || typeof mobileNo !== "string" || !/^\d{10}$/.test(mobileNo.trim())) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.VALIDATION.MOBILE_REQUIRED });
    }
    if (!address || typeof address !== "string" || address.trim().length < 5 || address.trim().length > 100) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.VALIDATION.ADDRESS_REQUIRED });
    }

    // If mobile number is being updated, check for uniqueness
    if (mobileNo) {
      const existingUser = await User.findOne({
        mobileNo: mobileNo,
        _id: { $ne: userId },
      });
      if (existingUser) {
        return res.status(statusCodes.BAD_REQUEST).json({
          message: MESSAGES.VALIDATION.MOBILE_TAKEN,
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
      return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.GENERAL.USER_NOT_FOUND });
    }

    res.status(statusCodes.OK).json({
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
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
  }
};

export const getProfile = async function (req, res) {
  try {
    const userId = req.user.userId;
    console.log("[getProfile] Request from user:", userId);
    
    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user) {
      console.log("[getProfile] User not found:", userId);
      return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.GENERAL.USER_NOT_FOUND });
    }

    console.log("[getProfile] Profile retrieved successfully for:", user.email);
    res.status(statusCodes.OK).json({
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
      .status(statusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
  }
};

export const uploadProfileImage = async function (req, res) {
  try {
    const userId = req.user.userId;
    if (!req.file) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.VALIDATION.NO_FILE });
    }
    // Upload to Cloudinary using memory buffer
    const result = await uploadFromBuffer(req.file.buffer, {
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
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.GENERAL.USER_NOT_FOUND });
    }
    res.status(statusCodes.OK).json({
      message: "Profile image updated successfully",
      profileImage: user.profileImage,
    });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
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
      errors.recipientName = MESSAGES.SHIPPING.RECIPIENT_NAME;
    }
    if (!addressLine1 || typeof addressLine1 !== 'string' || addressLine1.trim().length < 5 || addressLine1.trim().length > 100) {
      errors.addressLine1 = MESSAGES.SHIPPING.ADDRESS_LINE1;
    }
    if (!city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(city.trim())) {
      errors.city = MESSAGES.SHIPPING.CITY;
    }
    if (!state || typeof state !== 'string' || state.trim().length < 2 || state.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(state.trim())) {
      errors.state = MESSAGES.SHIPPING.STATE;
    }
    if (!postalCode || typeof postalCode !== 'string' || postalCode.trim().length < 4 || postalCode.trim().length > 10 || !/^\d{4,10}$/.test(postalCode.trim())) {
      errors.postalCode = MESSAGES.SHIPPING.POSTAL_CODE;
    }
    if (!country || typeof country !== 'string' || country.trim().length < 2 || country.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(country.trim())) {
      errors.country = MESSAGES.SHIPPING.COUNTRY;
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || !/^\d{10,15}$/.test(phoneNumber.trim())) {
      errors.phoneNumber = MESSAGES.SHIPPING.PHONE;
    }
    if (Object.keys(errors).length > 0) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.SHIPPING.VALIDATION_FAILED, errors });
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
    res.status(statusCodes.CREATED).json({ message: MESSAGES.SHIPPING.ADDRESS_ADDED, address });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
  }
};

export const getShippingAddresses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addresses = await ShippingAddress.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
    res.status(statusCodes.OK).json({ addresses });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
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
    if (!updated) return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.SHIPPING.ADDRESS_NOT_FOUND });
    res.status(statusCodes.OK).json({ message: 'Default address set', address: updated });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
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
      errors.recipientName = MESSAGES.SHIPPING.RECIPIENT_NAME;
    }
    if (!addressLine1 || typeof addressLine1 !== 'string' || addressLine1.trim().length < 5 || addressLine1.trim().length > 100) {
      errors.addressLine1 = MESSAGES.SHIPPING.ADDRESS_LINE1;
    }
    if (!city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(city.trim())) {
      errors.city = MESSAGES.SHIPPING.CITY;
    }
    if (!state || typeof state !== 'string' || state.trim().length < 2 || state.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(state.trim())) {
      errors.state = MESSAGES.SHIPPING.STATE;
    }
    if (!postalCode || typeof postalCode !== 'string' || postalCode.trim().length < 4 || postalCode.trim().length > 10 || !/^\d{4,10}$/.test(postalCode.trim())) {
      errors.postalCode = MESSAGES.SHIPPING.POSTAL_CODE;
    }
    if (!country || typeof country !== 'string' || country.trim().length < 2 || country.trim().length > 50 || !/^[A-Za-z\s.'-]+$/.test(country.trim())) {
      errors.country = MESSAGES.SHIPPING.COUNTRY;
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || !/^\d{10,15}$/.test(phoneNumber.trim())) {
      errors.phoneNumber = MESSAGES.SHIPPING.PHONE;
    }
    if (Object.keys(errors).length > 0) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.SHIPPING.VALIDATION_FAILED, errors });
    }

    // Check if address belongs to user
    const existingAddress = await ShippingAddress.findOne({ _id: addressId, user: userId });
    if (!existingAddress) {
      return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.SHIPPING.ADDRESS_NOT_FOUND });
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

    res.status(statusCodes.OK).json({ message: MESSAGES.SHIPPING.ADDRESS_UPDATED, address: updatedAddress });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
  }
};

export const deleteShippingAddress = async (req, res) => {
  try {
    const userId = req.user.userId;
    const addressId = req.params.id;

    // Check if address belongs to user
    const address = await ShippingAddress.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.SHIPPING.ADDRESS_NOT_FOUND });
    }

    // If this is the default address, don't allow deletion
    if (address.isDefault) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.SHIPPING.CANNOT_DELETE_DEFAULT });
    }

    await ShippingAddress.findByIdAndDelete(addressId);
    res.status(statusCodes.OK).json({ message: MESSAGES.SHIPPING.ADDRESS_DELETED });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: `${MESSAGES.GENERAL.INTERNAL_SERVER_ERROR}: ${error.message}` });
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const requestEmailChangeOtp = [
  body("email").isEmail().withMessage(MESSAGES.GENERAL.INVALID_EMAIL).normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: errors.array().map(e => e.msg).join(", ") });
    }
    const { email } = req.body;
    const userId = req.user.userId;
    // Check if email is already used by another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.AUTH.EMAIL_TAKEN });
    }
    // Generate and save OTP
    const otp = generateOtp();
    await Otp.deleteMany({ email });
    await Otp.create({ email, otp });
    // Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Your Email Change OTP Code",
      text: `Your OTP code is: ${otp}`,
    });
    res.json({ message: MESSAGES.AUTH.OTP_SENT });
  }
];

export const verifyEmailChangeOtp = [
  body("email").isEmail().withMessage(MESSAGES.GENERAL.INVALID_EMAIL).normalizeEmail(),
  body("otp").isLength({ min: 6, max: 6 }).withMessage(MESSAGES.AUTH.OTP_DIGITS),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: errors.array().map(e => e.msg).join(", ") });
    }
    const { email, otp } = req.body;
    const userId = req.user.userId;
    // Find OTP
    const otpDoc = await Otp.findOne({ email, otp });
    if (!otpDoc) {
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.AUTH.OTP_INVALID });
    }
    if (Date.now() - new Date(otpDoc.createdAt).getTime() > OTP_EXPIRY_SECONDS * 1000) {
      await Otp.deleteMany({ email });
      return res.status(statusCodes.BAD_REQUEST).json({ message: MESSAGES.AUTH.OTP_EXPIRED });
    }
    // Update user's email
    const user = await User.findById(userId);
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({ message: MESSAGES.GENERAL.USER_NOT_FOUND });
    }
    user.email = email;
    await user.save();
    await Otp.deleteMany({ email });
    res.status(statusCodes.OK).json({ message: "Email updated successfully", email });
  }
];
