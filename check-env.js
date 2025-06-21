import dotenv from 'dotenv';
import cloudinary from './config/cloudinary.js';

dotenv.config();

console.log('🔍 Environment Variables Check');
console.log('==============================');

const requiredVars = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY', 
  'CLOUDINARY_API_SECRET',
  'MONGODB_URI',
  'JWT_SECRET'
];

let allGood = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${varName.includes('SECRET') || varName.includes('KEY') ? '***SET***' : value}`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
    allGood = false;
  }
});

console.log('\n🔧 Testing Cloudinary Connection...');
try {
  // Test cloudinary connection
  const result = await cloudinary.api.ping();
  console.log('✅ Cloudinary connection successful');
} catch (error) {
  console.log('❌ Cloudinary connection failed:', error.message);
  allGood = false;
}

console.log('\n📁 Checking uploads directory...');
import fs from 'fs';
import path from 'path';

const uploadsDir = path.join(process.cwd(), 'uploads');
if (fs.existsSync(uploadsDir)) {
  console.log('✅ Uploads directory exists');
  
  // Check if writable
  try {
    const testFile = path.join(uploadsDir, 'test-write.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✅ Uploads directory is writable');
  } catch (error) {
    console.log('❌ Uploads directory is not writable:', error.message);
    allGood = false;
  }
} else {
  console.log('❌ Uploads directory does not exist');
  allGood = false;
}

console.log('\n📊 Summary:');
if (allGood) {
  console.log('✅ All checks passed! Your environment is properly configured.');
} else {
  console.log('❌ Some checks failed. Please fix the issues above.');
}

console.log('\n💡 If you see any ❌ marks, please:');
console.log('1. Check your .env file exists and has all required variables');
console.log('2. Ensure Cloudinary credentials are correct');
console.log('3. Make sure the uploads directory has proper permissions'); 