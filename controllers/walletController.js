import Wallet from "../models/walletModel.js";
import User from "../models/userModel.js";

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