import { statusCodes } from "../constants/statusCodes.js";
import { MESSAGES } from "../constants/messages.js";
import User from "../models/userModel.js";

export const getUsers = async function (req, res) {
  try {
    const users = await User.find({ isDeleted: false });

    res.status(statusCodes.CREATED).json({ users });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.GENERAL.INTERNAL_SERVER_ERROR });
  }
};
