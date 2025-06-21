import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';

dotenv.config();

const removeProductPrice = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Remove price field from all products
    const result = await Product.updateMany(
      {},
      { $unset: { price: "" } }
    );

    console.log(`Removed price field from ${result.modifiedCount} products`);
    console.log('Product price removal completed successfully');
  } catch (error) {
    console.error('Error removing product prices:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

removeProductPrice(); 