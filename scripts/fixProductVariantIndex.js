import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/karyo';

async function fixProductVariantIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the database instance
    const db = mongoose.connection.db;

    // Get the productvariants collection
    const collection = db.collection('productvariants');

    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);

    // Check if there's an index on 'sku' field
    const skuIndex = indexes.find(index => 
      index.key && index.key.sku !== undefined
    );

    if (skuIndex) {
      console.log('Found SKU index:', skuIndex);
      
      // Drop the SKU index
      await collection.dropIndex(skuIndex.name);
      console.log('Successfully dropped SKU index');
    } else {
      console.log('No SKU index found');
    }

    // List indexes again to confirm
    const updatedIndexes = await collection.indexes();
    console.log('Updated indexes:', updatedIndexes);

    console.log('Index fix completed successfully');
  } catch (error) {
    console.error('Error fixing index:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the script
fixProductVariantIndex(); 