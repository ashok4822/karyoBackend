import { statusCodes } from "../constants/statusCodes.js";
import User from "../models/userModel.js";

export const getUsers = async function (req, res) {
  try {
    const users = await User.find({ isDeleted: false });

    res.status(201).json({ users });
    createResponse(res,statusCodes.CREATED,true,"User feched successfully",{users})
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error` });
  }
};

