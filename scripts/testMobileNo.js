import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/userModel.js";

dotenv.config();

async function testMobileNo() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Test 1: Create a user without mobile number
    console.log("\nTest 1: Creating user without mobile number...");
    const user1 = new User({
      username: "testuser1",
      email: "test1@example.com",
      password: "hashedpassword",
      mobileNo: undefined
    });
    await user1.save();
    console.log("✓ User 1 created successfully");

    // Test 2: Create another user without mobile number
    console.log("\nTest 2: Creating another user without mobile number...");
    const user2 = new User({
      username: "testuser2",
      email: "test2@example.com",
      password: "hashedpassword",
      mobileNo: undefined
    });
    await user2.save();
    console.log("✓ User 2 created successfully");

    // Test 3: Create user with mobile number
    console.log("\nTest 3: Creating user with mobile number...");
    const user3 = new User({
      username: "testuser3",
      email: "test3@example.com",
      password: "hashedpassword",
      mobileNo: "1234567890"
    });
    await user3.save();
    console.log("✓ User 3 created successfully");

    // Test 4: Try to create another user with same mobile number (should fail)
    console.log("\nTest 4: Trying to create user with duplicate mobile number...");
    try {
      const user4 = new User({
        username: "testuser4",
        email: "test4@example.com",
        password: "hashedpassword",
        mobileNo: "1234567890"
      });
      await user4.save();
      console.log("✗ Test failed - duplicate mobile number was allowed");
    } catch (error) {
      if (error.code === 11000) {
        console.log("✓ Test passed - duplicate mobile number correctly rejected");
      } else {
        console.log("✗ Unexpected error:", error.message);
      }
    }

    // Test 5: Update user to add mobile number
    console.log("\nTest 5: Updating user to add mobile number...");
    await User.findByIdAndUpdate(user1._id, { mobileNo: "9876543210" });
    console.log("✓ User updated successfully");

    // Clean up test data
    console.log("\nCleaning up test data...");
    await User.deleteMany({ 
      email: { $in: ["test1@example.com", "test2@example.com", "test3@example.com"] } 
    });
    console.log("✓ Test data cleaned up");

    console.log("\nAll tests completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run the test
testMobileNo(); 