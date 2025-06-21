import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// Test configuration
const BASE_URL = 'http://localhost:5000/admin';

async function testProductEndpoint() {
  try {
    console.log('Testing product creation endpoint...');
    
    // First, let's test if the server is running
    try {
      const healthCheck = await axios.get('http://localhost:5000');
      console.log('✅ Server is running');
    } catch (error) {
      console.log('❌ Server is not running or not accessible');
      return;
    }
    
    // Test the categories endpoint to get a valid category ID
    try {
      const categoriesResponse = await axios.get(`${BASE_URL}/categories`);
      console.log('✅ Categories endpoint accessible');
      
      if (categoriesResponse.data && categoriesResponse.data.length > 0) {
        const firstCategory = categoriesResponse.data[0];
        console.log('📂 Found category:', firstCategory.name, 'ID:', firstCategory._id);
        
        // Test product creation with this category
        await testProductCreation(firstCategory._id);
      } else {
        console.log('❌ No categories found. Please create a category first.');
      }
    } catch (error) {
      console.log('❌ Categories endpoint error:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

async function testProductCreation(categoryId) {
  try {
    console.log(`\n🧪 Testing product creation with category: ${categoryId}`);
    
    const formData = new FormData();
    
    // Add product data
    formData.append('name', 'Test Product');
    formData.append('description', 'This is a test product description');
    formData.append('category', categoryId);
    formData.append('brand', 'Test Brand');
    formData.append('status', 'active');
    
    // Test without variants first
    console.log('📤 Testing product creation WITHOUT variants...');
    
    // Create test images (you'll need to replace these with actual image files)
    const testImagePath = path.join(process.cwd(), 'uploads', 'test-image.jpg');
    
    if (fs.existsSync(testImagePath)) {
      formData.append('images', fs.createReadStream(testImagePath));
      formData.append('images', fs.createReadStream(testImagePath));
      formData.append('images', fs.createReadStream(testImagePath));
    } else {
      console.log('⚠️  No test images found. Creating dummy files...');
      
      // Create dummy image files for testing
      const dummyImageContent = Buffer.from('fake-image-data');
      for (let i = 1; i <= 3; i++) {
        const dummyPath = path.join(process.cwd(), 'uploads', `test-image-${i}.jpg`);
        fs.writeFileSync(dummyPath, dummyImageContent);
        formData.append('images', fs.createReadStream(dummyPath));
      }
    }
    
    console.log('📤 Sending request...');
    
    const response = await axios.post(
      `${BASE_URL}/products`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer YOUR_ADMIN_TOKEN' // Replace with actual token
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log('✅ Product created successfully!');
    console.log('Response:', response.data);
    
    // Test with variants
    await testProductCreationWithVariants(categoryId);
    
  } catch (error) {
    console.log('❌ Product creation failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('💡 Authentication required. Please provide a valid admin token.');
    }
    
    if (error.response?.status === 400) {
      console.log('💡 Validation error. Check the error details above.');
    }
    
    if (error.response?.status === 500) {
      console.log('💡 Check server logs for detailed error information.');
    }
  }
}

async function testProductCreationWithVariants(categoryId) {
  try {
    console.log(`\n🧪 Testing product creation WITH variants...`);
    
    const formData = new FormData();
    
    // Add product data
    formData.append('name', 'Test Product with Variants');
    formData.append('description', 'This is a test product with variants');
    formData.append('category', categoryId);
    formData.append('brand', 'Test Brand');
    formData.append('status', 'active');
    
    // Add variants as JSON
    const variants = [
      {
        colour: 'Red',
        capacity: '128GB',
        price: 999.99,
        stock: 10,
        status: 'active'
      },
      {
        colour: 'Blue',
        capacity: '256GB',
        price: 1299.99,
        stock: 5,
        status: 'active'
      }
    ];
    
    formData.append('variants', JSON.stringify(variants));
    
    // Create test images for variants
    const testImagePath = path.join(process.cwd(), 'uploads', 'test-image.jpg');
    
    if (fs.existsSync(testImagePath)) {
      // Add images for variant 0
      formData.append('variantImages_0', fs.createReadStream(testImagePath));
      formData.append('variantImages_0', fs.createReadStream(testImagePath));
      formData.append('variantImages_0', fs.createReadStream(testImagePath));
      
      // Add images for variant 1
      formData.append('variantImages_1', fs.createReadStream(testImagePath));
      formData.append('variantImages_1', fs.createReadStream(testImagePath));
      formData.append('variantImages_1', fs.createReadStream(testImagePath));
    } else {
      console.log('⚠️  No test images found. Creating dummy files...');
      
      // Create dummy image files for testing
      const dummyImageContent = Buffer.from('fake-image-data');
      
      // For variant 0
      for (let i = 1; i <= 3; i++) {
        const dummyPath = path.join(process.cwd(), 'uploads', `test-variant0-image-${i}.jpg`);
        fs.writeFileSync(dummyPath, dummyImageContent);
        formData.append('variantImages_0', fs.createReadStream(dummyPath));
      }
      
      // For variant 1
      for (let i = 1; i <= 3; i++) {
        const dummyPath = path.join(process.cwd(), 'uploads', `test-variant1-image-${i}.jpg`);
        fs.writeFileSync(dummyPath, dummyImageContent);
        formData.append('variantImages_1', fs.createReadStream(dummyPath));
      }
    }
    
    console.log('📤 Sending request with variants...');
    
    const response = await axios.post(
      `${BASE_URL}/products`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer YOUR_ADMIN_TOKEN' // Replace with actual token
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log('✅ Product with variants created successfully!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.log('❌ Product creation with variants failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

// Run the test
testProductEndpoint(); 