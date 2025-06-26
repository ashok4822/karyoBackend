import User from "../models/userModel.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import cloudinary from "../config/cloudinary.js";
import ShippingAddress from "../models/shippingAddressModel.js";
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
      // If mobileNo is empty string, set it to undefined to avoid null values
      updateData.mobileNo =
        mobileNo.trim() === "" ? undefined : mobileNo.trim();
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
    const user = await User.findById(userId).select("-password -refreshToken");
    console.log(user);

    if (!user) {
      return res.status(404).json({ message: `User not found` });
    }

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
