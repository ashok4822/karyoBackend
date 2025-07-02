import mongoose from 'mongoose';
import Order from './models/orderModel.js';
import Wallet from './models/walletModel.js';
import User from './models/userModel.js';

// Test the refund functionality
async function testRefund() {
  try {
    console.log('Testing refund functionality...');
    
    // Find a test order with online payment or COD
    const order = await Order.findOne({ 
      status: 'returned'
    });
    
    if (!order) {
      console.log('No test order found with online payment and returned status');
      return;
    }
    
    console.log('Found test order:', {
      id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      user: order.user
    });
    
    // Check if user has a wallet
    let wallet = await Wallet.findOne({ user: order.user });
    console.log('Wallet found:', wallet ? 'Yes' : 'No');
    
    if (wallet) {
      console.log('Current wallet balance:', wallet.balance);
      console.log('Current transactions:', wallet.transactions.length);
    }
    
    // Simulate the refund process
    const isEligibleForRefund = (
      (order.paymentMethod === 'online' && (order.paymentStatus === 'paid' || order.paymentStatus === 'pending')) ||
      (order.paymentMethod === 'cod')
    );
    
    if (isEligibleForRefund) {
      console.log(`Processing refund for ${order.paymentMethod.toUpperCase()} payment...`);
      
      // Find or create user's wallet
      if (!wallet) {
        console.log('Creating new wallet for user:', order.user);
        wallet = await Wallet.create({ user: order.user });
      }
      
      console.log('Wallet before refund:', {
        balance: wallet.balance,
        transactions: wallet.transactions.length
      });
      
      // Add refund amount to wallet
      wallet.balance += order.total;
      wallet.transactions.push({
        type: 'credit',
        amount: order.total,
        description: `Refund for order ${order.orderNumber} (${order.paymentMethod.toUpperCase()}) - Return verified by admin`
      });
      await wallet.save();
      
      console.log('Wallet after refund:', {
        balance: wallet.balance,
        transactions: wallet.transactions.length
      });
      
      // Update order payment status to refunded
      order.paymentStatus = 'refunded';
      order.status = 'return_verified';
      await order.save();
      
      console.log('Order updated successfully');
      console.log('Refund processed successfully!');
    } else {
      console.log('No refund processed - Payment method:', order.paymentMethod, 'Payment status:', order.paymentStatus);
      console.log('Order is not eligible for refund');
    }
    
    // Test verify without refund functionality
    console.log('\n--- Testing Verify Without Refund ---');
    const orderForNoRefund = await Order.findOne({ 
      status: 'returned'
    });
    
    if (orderForNoRefund) {
      console.log('Found order for no-refund test:', orderForNoRefund.orderNumber);
      
      // Simulate verify without refund
      orderForNoRefund.status = 'return_verified';
      orderForNoRefund.returnVerifiedBy = 'test-admin-id';
      orderForNoRefund.returnVerifiedAt = new Date();
      await orderForNoRefund.save();
      
      console.log('Order verified without refund successfully!');
      console.log('Payment status remains:', orderForNoRefund.paymentStatus);
    } else {
      console.log('No order found for no-refund test');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Connect to database and run test
mongoose.connect('mongodb://localhost:27017/karyo1L')
  .then(() => {
    console.log('Connected to MongoDB');
    return testRefund();
  })
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  }); 