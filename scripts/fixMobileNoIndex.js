import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/userModel.js";

dotenv.config();

async function fixMobileNoIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Update all documents with null mobileNo to undefined
    const result = await User.updateMany(
      { mobileNo: null },
      { $unset: { mobileNo: "" } }
    );

    console.log(`Updated ${result.modifiedCount} documents`);

    // Drop the old index if it exists
    try {
      await User.collection.dropIndex("mobileNo_1");
      console.log("Dropped old mobileNo index");
    } catch (error) {
      console.log("Old index doesn't exist or already dropped");
    }

    // Create the new partial index (without sparse option)
    await User.collection.createIndex(
      { mobileNo: 1 },
      { 
        unique: true,
        partialFilterExpression: { mobileNo: { $type: "string" } }
      }
    );
    console.log("Created new partial index for mobileNo");

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run the migration
fixMobileNoIndex(); 