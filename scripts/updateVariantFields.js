import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductVariant from '../models/productVariantModel.js';

dotenv.config();

const updateVariantFields = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all variants that don't have status or createdAt fields
    const variantsToUpdate = await ProductVariant.find({
      $or: [
        { status: { $exists: false } },
        { createdAt: { $exists: false } }
      ]
    });
    
    console.log(`Found ${variantsToUpdate.length} variants to update`);

    // Update each variant
    for (const variant of variantsToUpdate) {
      const updateData = {};
      
      if (!variant.status) {
        updateData.status = 'active';
      }
      
      if (!variant.createdAt) {
        updateData.createdAt = new Date();
      }
      
      if (Object.keys(updateData).length > 0) {
        await ProductVariant.findByIdAndUpdate(variant._id, updateData);
        console.log(`Updated variant ${variant._id}`);
      }
    }

    console.log('Variant fields update completed successfully');
  } catch (error) {
    console.error('Error updating variant fields:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

updateVariantFields(); 