import Wallet from "../models/walletModel.js";
import User from "../models/userModel.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZOR_KEY_ID,
  key_secret: process.env.RAZOR_SECRET_ID,
});

// Get wallet for a user
export const getWallet = async (req, res) => {
  try {
    const userId = req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      // Create wallet if not exists
      wallet = await Wallet.create({ user: userId });
    }
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wallet", error });
  }
};

// Add funds to wallet
export const addFunds = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, description } = req.body;
    if (amount <= 0) return res.status(400).json({ message: "Amount must be positive" });
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId });
    }
    // Wallet balance limit
    if (wallet.balance + amount > 10000) {
      return res.status(400).json({ message: "Wallet balance cannot exceed ₹10,000" });
    }
    wallet.balance += amount;
    wallet.transactions.push({ type: "credit", amount, description });
    await wallet.save();
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Error adding funds", error });
  }
};

// Deduct funds from wallet
export const deductFunds = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, description } = req.body;
    if (amount <= 0) return res.status(400).json({ message: "Amount must be positive" });
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    if (wallet.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    wallet.balance -= amount;
    wallet.transactions.push({ type: "debit", amount, description });
    await wallet.save();
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Error deducting funds", error });
  }
};

// Get wallet transaction history
export const getTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    res.json(wallet.transactions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching transactions", error });
  }
};

// Create Razorpay order for wallet add funds
export const createWalletRazorpayOrder = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const userId = req.user.userId;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    if (amount < 1) {
      return res.status(400).json({ message: "Minimum amount for wallet recharge is ₹1" });
    }

    if (amount > 5000) {
      return res.status(400).json({ message: "You can only add up to ₹5,000 at a time" });
    }
    if (amount > 10000) {
      return res.status(400).json({ message: "Maximum amount for wallet recharge is ₹10,000" });
    }

    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency: "INR",
      receipt: `wallet_${userId.slice(-6)}_${Date.now().toString().slice(-6)}`,
      notes: {
        description: description || "Wallet recharge",
        userId: userId,
        type: "wallet_recharge"
      }
    };

    const order = await razorpay.orders.create(options);
    res.status(201).json({ 
      success: true,
      order,
      key_id: process.env.RAZOR_KEY_ID 
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.message,
    });
  }
};

// Verify Razorpay payment and add funds to wallet
export const verifyWalletPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, description } = req.body;
    const userId = req.user.userId;

    // Verify payment signature
    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZOR_SECRET_ID)
      .update(sign)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid payment signature" 
      });
    }

    // Verify payment with Razorpay
    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      if (payment.status !== 'captured') {
        return res.status(400).json({ 
          success: false, 
          message: "Payment not completed" 
        });
      }

      // Verify amount matches
      const expectedAmount = Math.round(amount * 100); // Convert to paise
      if (payment.amount !== expectedAmount) {
        return res.status(400).json({ 
          success: false, 
          message: "Payment amount mismatch" 
        });
      }
    } catch (razorpayError) {
      console.error("Razorpay payment verification error:", razorpayError);
      return res.status(400).json({ 
        success: false, 
        message: "Payment verification failed" 
      });
    }

    // Add funds to wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = await Wallet.create({ user: userId });
    }

    // Wallet balance limit
    if (wallet.balance + amount > 10000) {
      return res.status(400).json({ message: "Wallet balance cannot exceed ₹10,000" });
    }
    wallet.balance += amount;
    wallet.transactions.push({ 
      type: "credit", 
      amount, 
      description: description || "Wallet recharge via Razorpay",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id
    });
    await wallet.save();

    res.json({
      success: true,
      message: "Payment successful! Funds added to wallet",
      wallet,
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    console.error("Wallet payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing payment",
      error: error.message,
    });
  }
}; 