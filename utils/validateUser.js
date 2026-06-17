import { body } from "express-validator";
import { MESSAGES } from "../constants/messages.js";

// Validation Rules
const validateUser = [
  // Validate username: not empty and between 3-20 characters
  body("username")
    .notEmpty()
    .withMessage(MESSAGES.VALIDATION.USERNAME_REQUIRED)
    .isLength({ min: 3, max: 20 })
    .withMessage(MESSAGES.VALIDATION.USERNAME_LENGTH)
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage(MESSAGES.VALIDATION.USERNAME_FORMAT),

  // Validate email: check if it's a valid email
  body("email")
    .isEmail()
    .withMessage(MESSAGES.GENERAL.INVALID_EMAIL)
    .normalizeEmail(),

  // Validate password: minimum 8 characters, must contain letters and numbers
  body("password")
    .notEmpty()
    .withMessage(MESSAGES.VALIDATION.PASSWORD_REQUIRED)
    .isLength({ min: 8 })
    .withMessage(MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH)
    .matches(/[A-Za-z]/)
    .withMessage(MESSAGES.VALIDATION.PASSWORD_LETTERS)
    .matches(/[0-9]/)
    .withMessage(MESSAGES.VALIDATION.PASSWORD_NUMBERS),
];

export default validateUser;
