const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/admin';

// Test pagination functionality
async function testPagination() {
  try {
    console.log('Testing pagination with 5 products per page...\n');

    // Test page 1
    console.log('=== Testing Page 1 ===');
    const page1Response = await axios.get(`${BASE_URL}/products?page=1&limit=5`);
    console.log('Page 1 - Total products:', page1Response.data.total);
    console.log('Page 1 - Products returned:', page1Response.data.products.length);
    console.log('Page 1 - Product IDs:', page1Response.data.products.map(p => p._id).slice(0, 3));
    console.log('');

    // Test page 2
    console.log('=== Testing Page 2 ===');
    const page2Response = await axios.get(`${BASE_URL}/products?page=2&limit=5`);
    console.log('Page 2 - Products returned:', page2Response.data.products.length);
    console.log('Page 2 - Product IDs:', page2Response.data.products.map(p => p._id).slice(0, 3));
    console.log('');

    // Test default limit (should be 5)
    console.log('=== Testing Default Limit ===');
    const defaultResponse = await axios.get(`${BASE_URL}/products?page=1`);
    console.log('Default limit - Products returned:', defaultResponse.data.products.length);
    console.log('');

    // Test with search
    console.log('=== Testing Pagination with Search ===');
    const searchResponse = await axios.get(`${BASE_URL}/products?page=1&limit=5&search=test`);
    console.log('Search results - Total:', searchResponse.data.total);
    console.log('Search results - Products returned:', searchResponse.data.products.length);
    console.log('');

    // Test with filters
    console.log('=== Testing Pagination with Filters ===');
    const filterResponse = await axios.get(`${BASE_URL}/products?page=1&limit=5&status=active`);
    console.log('Filter results - Total:', filterResponse.data.total);
    console.log('Filter results - Products returned:', filterResponse.data.products.length);
    console.log('');

    console.log('✅ Pagination test completed successfully!');

  } catch (error) {
    console.error('❌ Pagination test failed:', error.response?.data || error.message);
  }
}

// Run the test
testPagination(); 