import mongoose from 'mongoose';
import Order from '../models/orderModel.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/karyo1L';

async function fixDeliveredOrders() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const orders = await Order.find({ status: { $ne: 'delivered' } });
  let fixedCount = 0;
  for (const order of orders) {
    if (order.items.length > 0 && order.items.every(i => i.itemStatus === 'delivered')) {
      order.status = 'delivered';
      await order.save();
      fixedCount++;
      console.log(`Fixed order ${order._id} (set status to delivered)`);
    }
  }
  console.log(`\nTotal orders fixed: ${fixedCount}`);
  await mongoose.disconnect();
}

fixDeliveredOrders().catch(err => {
  console.error('Error fixing orders:', err);
  process.exit(1);
}); 