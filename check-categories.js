import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/categoryModel.js';

dotenv.config();

async function checkCategories() {
  try {
    console.log('🔍 Checking categories in database...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check existing categories
    const categories = await Category.find({});
    console.log(`📊 Found ${categories.length} categories in database:`);
    
    if (categories.length === 0) {
      console.log('❌ No categories found. Creating sample categories...');
      
      const sampleCategories = [
        { name: 'Electronics', status: 'active' },
        { name: 'Clothing', status: 'active' },
        { name: 'Books', status: 'active' },
        { name: 'Home & Garden', status: 'active' },
        { name: 'Sports & Outdoors', status: 'active' }
      ];
      
      for (const categoryData of sampleCategories) {
        const category = new Category(categoryData);
        await category.save();
        console.log(`✅ Created category: ${categoryData.name}`);
      }
      
      console.log('🎉 Sample categories created successfully!');
    } else {
      categories.forEach((cat, index) => {
        console.log(`${index + 1}. ${cat.name} (${cat.status})`);
      });
    }
    
    // Check active categories specifically
    const activeCategories = await Category.find({ status: 'active' });
    console.log(`\n✅ Found ${activeCategories.length} active categories`);
    
    if (activeCategories.length === 0) {
      console.log('⚠️  No active categories found. This might cause issues with product creation.');
    }
    
  } catch (error) {
    console.error('❌ Error checking categories:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the check
checkCategories(); 