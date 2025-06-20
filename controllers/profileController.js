import User from "../models/userModel.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
dotenv.config();

export const logout = async function (req, res) {
  try {
    const refreshToken = req.cookies["refreshToken"];
    if (refreshToken) {
      // Find user by refreshToken and clear it
      await User.updateOne({ refreshToken }, { $set: { refreshToken: "" } });
    }
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
    });
    res.status(200).json({ message: `Successfully Logged out!` });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

export const updateProfile = async function (req, res) {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, mobileNo } = req.body;

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
        role: user.role,
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
        profileImage: user.profileImage,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};
