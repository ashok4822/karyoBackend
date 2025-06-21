import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ProductVariant from '../models/productVariantModel.js';
import Product from '../models/productModel.js';

dotenv.config();

const updateVariantPrices = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all product variants that don't have a price field
    const variantsWithoutPrice = await ProductVariant.find({ price: { $exists: false } });
    console.log(`Found ${variantsWithoutPrice.length} variants without price field`);

    // Update each variant to include price from the parent product
    for (const variant of variantsWithoutPrice) {
      const product = await Product.findById(variant.product);
      if (product) {
        await ProductVariant.findByIdAndUpdate(variant._id, {
          price: product.price
        });
        console.log(`Updated variant ${variant._id} with price ${product.price}`);
      }
    }

    // Update products to include totalStock field
    const productsWithoutTotalStock = await Product.find({ totalStock: { $exists: false } });
    console.log(`Found ${productsWithoutTotalStock.length} products without totalStock field`);

    for (const product of productsWithoutTotalStock) {
      const variants = await ProductVariant.find({ product: product._id });
      const totalStock = variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
      
      await Product.findByIdAndUpdate(product._id, {
        totalStock: totalStock
      });
      console.log(`Updated product ${product._id} with totalStock ${totalStock}`);
    }

    console.log('Variant price update completed successfully');
  } catch (error) {
    console.error('Error updating variant prices:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

updateVariantPrices(); 