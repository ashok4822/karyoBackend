import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Referral from './models/referralModel.js';

dotenv.config();

async function debugReferralExpiry(tokenOrCode = null) {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  const now = new Date();
  console.log('Server current time:', now.toISOString());

  let referrals;
  if (tokenOrCode) {
    // Try as token first, then as code
    referrals = await Referral.find({
      $or: [
        { referralToken: tokenOrCode },
        { referralCode: tokenOrCode }
      ]
    });
    if (referrals.length === 0) {
      console.log('No referral found with token or code:', tokenOrCode);
      await mongoose.disconnect();
      return;
    }
  } else {
    referrals = await Referral.find().sort({ createdAt: -1 }).limit(5);
    if (referrals.length === 0) {
      console.log('No referral documents found.');
      await mongoose.disconnect();
      return;
    }
  }

  referrals.forEach((ref, idx) => {
    const expired = now > ref.expiresAt;
    const diffMs = ref.expiresAt - ref.createdAt;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    console.log(`\nReferral #${idx + 1}`);
    console.log('  _id:       ', ref._id);
    console.log('  status:    ', ref.status);
    console.log('  createdAt: ', ref.createdAt.toISOString());
    console.log('  expiresAt: ', ref.expiresAt.toISOString());
    console.log('  expired?   ', expired ? 'YES' : 'NO');
    console.log('  Days valid:', diffDays);
    console.log('  referralToken:', ref.referralToken);
    console.log('  referralCode: ', ref.referralCode);
  });
  await mongoose.disconnect();
  console.log('\nDone.');
}

const arg = process.argv[2];
debugReferralExpiry(arg).catch(err => {
  console.error('Error:', err);
  mongoose.disconnect();
}); 