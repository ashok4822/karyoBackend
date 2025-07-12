import User from "../models/userModel.js";

/**
 * Generates a unique referral code for a user
 * @param {string} username - The username to use as base for the referral code
 * @param {number} length - The length of the referral code (default: 8)
 * @returns {string} - A unique referral code
 */
export const generateUniqueReferralCode = async (username, length = 8) => {
  // Clean username: remove special characters, convert to uppercase
  const cleanUsername = username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  
  // Generate base code from username (take first 4 characters)
  const baseCode = cleanUsername.substring(0, 4);
  
  // Generate random alphanumeric string for the remaining part
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  
  for (let i = 0; i < length - baseCode.length; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Combine base code with random part
  let referralCode = baseCode + randomPart;
  
  // Ensure uniqueness by checking database
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const existingUser = await User.findOne({ referralCode });
    
    if (!existingUser) {
      return referralCode;
    }
    
    // If code exists, generate a new random part
    randomPart = '';
    for (let i = 0; i < length - baseCode.length; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    referralCode = baseCode + randomPart;
    attempts++;
  }
  
  // If we still can't find a unique code, add timestamp
  const timestamp = Date.now().toString().slice(-4);
  referralCode = baseCode + timestamp;
  
  return referralCode;
};

/**
 * Validates a referral code format
 * @param {string} code - The referral code to validate
 * @returns {boolean} - True if valid format, false otherwise
 */
export const validateReferralCodeFormat = (code) => {
  // Referral code should be 6-10 characters, alphanumeric, uppercase
  const regex = /^[A-Z0-9]{6,10}$/;
  return regex.test(code);
};

/**
 * Checks if a referral code is available (not already used)
 * @param {string} code - The referral code to check
 * @returns {boolean} - True if available, false if already used
 */
export const isReferralCodeAvailable = async (code) => {
  const existingUser = await User.findOne({ referralCode: code });
  return !existingUser;
}; 