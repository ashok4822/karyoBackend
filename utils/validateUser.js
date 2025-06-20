import { body } from "express-validator";

// Validation Rules
const validateUser = [
  // Validate username: not empty and between 3-20 characters
  body("username")
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 3, max: 20 })
    .withMessage("Username must be between 3 and 20 characters")
    .matches(/^[A-Za-z0-9]+$/)
    .withMessage("Username must contain letters or numbers"),

  // Validate email: check if it's a valid email
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  // Validate password: minimum 8 characters, must contain letters and numbers
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password should be at least 8 characters")
    .matches(/[A-Za-z]/)
    .withMessage("Password must contain letters")
    .matches(/[0-9]/)
    .withMessage("Password must contain numbers"),
];

export default validateUser;
