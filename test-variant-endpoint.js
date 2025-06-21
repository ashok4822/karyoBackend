import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// Test configuration
const BASE_URL = 'http://localhost:5000/admin';
const TEST_PRODUCT_ID = 'YOUR_TEST_PRODUCT_ID'; // Replace with actual product ID

async function testVariantEndpoint() {
  try {
    console.log('Testing variant endpoint...');
    
    // First, let's test if the server is running
    try {
      const healthCheck = await axios.get('http://localhost:5000');
      console.log('✅ Server is running');
    } catch (error) {
      console.log('❌ Server is not running or not accessible');
      return;
    }
    
    // Test the products endpoint to get a valid product ID
    try {
      const productsResponse = await axios.get(`${BASE_URL}/products`);
      console.log('✅ Products endpoint accessible');
      
      if (productsResponse.data && productsResponse.data.length > 0) {
        const firstProduct = productsResponse.data[0];
        console.log('📦 Found product:', firstProduct.name, 'ID:', firstProduct._id);
        
        // Test variant endpoint with this product
        await testVariantCreation(firstProduct._id);
      } else {
        console.log('❌ No products found. Please create a product first.');
      }
    } catch (error) {
      console.log('❌ Products endpoint error:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

async function testVariantCreation(productId) {
  try {
    console.log(`\n🧪 Testing variant creation for product: ${productId}`);
    
    const formData = new FormData();
    
    // Add variant data
    formData.append('colour', 'Test Red');
    formData.append('capacity', '128GB');
    formData.append('price', '999.99');
    formData.append('stock', '10');
    formData.append('status', 'active');
    
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
      `${BASE_URL}/products/${productId}/variants`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer YOUR_ADMIN_TOKEN' // Replace with actual token
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log('✅ Variant created successfully!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.log('❌ Variant creation failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('💡 Authentication required. Please provide a valid admin token.');
    }
    
    if (error.response?.status === 500) {
      console.log('💡 Check server logs for detailed error information.');
    }
  }
}

// Run the test
testVariantEndpoint(); 