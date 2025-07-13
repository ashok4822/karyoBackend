import mongoose from 'mongoose';
import Referral from './models/referralModel.js';
import User from './models/userModel.js';
import Coupon from './models/couponModel.js';
import Offer from './models/offerModel.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Debug a specific referral by code or token
async function debugReferral(referralCodeOrToken) {
  try {
    console.log('\n=== REFERRAL DEBUGGING TOOL ===\n');
    
    // Find the referral
    let referral = await Referral.findOne({
      $or: [
        { referralCode: referralCodeOrToken },
        { referralToken: referralCodeOrToken }
      ]
    }).populate('referrer', 'username email firstName lastName referralCount totalReferralRewards')
      .populate('referred', 'username email firstName lastName createdAt')
      .populate('rewardCoupon', 'code discountType discountValue description validFrom validTo status');

    if (!referral) {
      console.log(`❌ No referral found with code/token: ${referralCodeOrToken}`);
      return;
    }

    console.log('📋 REFERRAL DETAILS:');
    console.log('====================');
    console.log(`ID: ${referral._id}`);
    console.log(`Code: ${referral.referralCode}`);
    console.log(`Token: ${referral.referralToken}`);
    console.log(`Status: ${referral.status}`);
    console.log(`Created: ${referral.createdAt}`);
    console.log(`Expires: ${referral.expiresAt}`);
    console.log(`Completed: ${referral.completedAt || 'Not completed'}`);
    console.log(`Reward Claimed: ${referral.rewardClaimed}`);

    console.log('\n👤 REFERRER (User who shared the code):');
    console.log('=====================================');
    if (referral.referrer) {
      console.log(`ID: ${referral.referrer._id}`);
      console.log(`Username: ${referral.referrer.username}`);
      console.log(`Email: ${referral.referrer.email}`);
      console.log(`Name: ${referral.referrer.firstName} ${referral.referrer.lastName}`);
      console.log(`Referral Count: ${referral.referrer.referralCount}`);
      console.log(`Total Rewards: ${referral.referrer.totalReferralRewards}`);
    } else {
      console.log('❌ Referrer not found!');
    }

    console.log('\n👥 REFERRED USER (User who used the code):');
    console.log('==========================================');
    if (referral.referred) {
      console.log(`ID: ${referral.referred._id}`);
      console.log(`Username: ${referral.referred.username}`);
      console.log(`Email: ${referral.referred.email}`);
      console.log(`Name: ${referral.referred.firstName} ${referral.referred.lastName}`);
      console.log(`Created: ${referral.referred.createdAt}`);
    } else {
      console.log('❌ No referred user (referral not completed)');
    }

    console.log('\n🎁 REWARD COUPON:');
    console.log('=================');
    if (referral.rewardCoupon) {
      console.log(`ID: ${referral.rewardCoupon._id}`);
      console.log(`Code: ${referral.rewardCoupon.code}`);
      console.log(`Description: ${referral.rewardCoupon.description}`);
      console.log(`Discount Type: ${referral.rewardCoupon.discountType}`);
      console.log(`Discount Value: ${referral.rewardCoupon.discountValue}`);
      console.log(`Valid From: ${referral.rewardCoupon.validFrom}`);
      console.log(`Valid To: ${referral.rewardCoupon.validTo}`);
      console.log(`Status: ${referral.rewardCoupon.status}`);
    } else {
      console.log('❌ No reward coupon found!');
    }

    // Check if referral is expired
    const now = new Date();
    const isExpired = referral.expiresAt < now;
    console.log(`\n⏰ EXPIRY STATUS: ${isExpired ? 'EXPIRED' : 'VALID'}`);

    // Check if there are active referral offers
    console.log('\n🎯 ACTIVE REFERRAL OFFERS:');
    console.log('==========================');
    const activeOffers = await Offer.find({
      offerType: "referral",
      status: "active",
      isDeleted: false,
      validFrom: { $lte: now },
      validTo: { $gte: now }
    });

    if (activeOffers.length > 0) {
      activeOffers.forEach((offer, index) => {
        console.log(`Offer ${index + 1}:`);
        console.log(`  Name: ${offer.name}`);
        console.log(`  Discount: ${offer.discountValue}${offer.discountType === 'percentage' ? '%' : '₹'}`);
        console.log(`  Min Amount: ₹${offer.minimumAmount}`);
        console.log(`  Max Discount: ${offer.maximumDiscount ? '₹' + offer.maximumDiscount : 'No limit'}`);
      });
    } else {
      console.log('❌ No active referral offers found!');
    }

    // Check all referrals for this referrer
    console.log('\n📊 ALL REFERRALS FOR THIS REFERRER:');
    console.log('====================================');
    const allReferrals = await Referral.find({ referrer: referral.referrer._id })
      .populate('referred', 'username email')
      .populate('rewardCoupon', 'code discountValue discountType')
      .sort({ createdAt: -1 });

    console.log(`Total referrals: ${allReferrals.length}`);
    allReferrals.forEach((ref, index) => {
      console.log(`${index + 1}. ${ref.referralCode} - ${ref.status} - ${ref.referred ? ref.referred.username : 'No user'} - ${ref.rewardCoupon ? ref.rewardCoupon.code : 'No coupon'}`);
    });

    // Check if the referred user has referredBy field set
    if (referral.referred) {
      console.log('\n🔗 REFERRED USER REFERREDBY FIELD:');
      console.log('==================================');
      const referredUser = await User.findById(referral.referred._id).select('referredBy');
      console.log(`referredBy field: ${referredUser.referredBy}`);
      console.log(`Expected referrer ID: ${referral.referrer._id}`);
      console.log(`Match: ${referredUser.referredBy?.toString() === referral.referrer._id.toString() ? '✅' : '❌'}`);
    }

    // Check for any coupons with REF prefix (referral coupons)
    console.log('\n🎫 ALL REFERRAL COUPONS (REF prefix):');
    console.log('=====================================');
    const referralCoupons = await Coupon.find({
      code: { $regex: '^REF', $options: 'i' }
    }).select('code discountValue discountType status validFrom validTo description');

    console.log(`Total referral coupons: ${referralCoupons.length}`);
    referralCoupons.forEach((coupon, index) => {
      console.log(`${index + 1}. ${coupon.code} - ${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : '₹'} - ${coupon.status} - ${coupon.description}`);
    });

    console.log('\n=== ANALYSIS ===');
    console.log('================');
    
    if (referral.status === 'pending') {
      console.log('⚠️  Referral is still pending - not completed yet');
    } else if (referral.status === 'completed') {
      if (!referral.rewardCoupon) {
        console.log('❌ Referral completed but NO REWARD COUPON generated!');
        console.log('   This indicates an issue in the processReferral function');
      } else {
        console.log('✅ Referral completed successfully with reward coupon');
      }
    } else if (referral.status === 'expired') {
      console.log('⏰ Referral has expired');
    }

    if (isExpired && referral.status === 'pending') {
      console.log('⚠️  Referral has expired and was never completed');
    }

    if (activeOffers.length === 0) {
      console.log('❌ No active referral offers - this prevents coupon generation');
    }

  } catch (error) {
    console.error('Error debugging referral:', error);
  }
}

// Debug by user ID (show all referrals for a user)
async function debugUserReferrals(userId) {
  try {
    console.log('\n=== USER REFERRALS DEBUGGING ===\n');
    
    const user = await User.findById(userId).select('username email firstName lastName referralCode referralCount totalReferralRewards');
    if (!user) {
      console.log(`❌ User not found with ID: ${userId}`);
      return;
    }

    console.log('👤 USER DETAILS:');
    console.log('================');
    console.log(`ID: ${user._id}`);
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`Referral Code: ${user.referralCode}`);
    console.log(`Referral Count: ${user.referralCount}`);
    console.log(`Total Rewards: ${user.totalReferralRewards}`);

    // Get all referrals where this user is the referrer
    const referrals = await Referral.find({ referrer: userId })
      .populate('referred', 'username email firstName lastName createdAt')
      .populate('rewardCoupon', 'code discountValue discountType status')
      .sort({ createdAt: -1 });

    console.log('\n📋 ALL REFERRALS BY THIS USER:');
    console.log('==============================');
    console.log(`Total referrals: ${referrals.length}`);

    referrals.forEach((referral, index) => {
      console.log(`\n${index + 1}. Referral: ${referral.referralCode}`);
      console.log(`   Status: ${referral.status}`);
      console.log(`   Created: ${referral.createdAt}`);
      console.log(`   Completed: ${referral.completedAt || 'Not completed'}`);
      console.log(`   Referred User: ${referral.referred ? referral.referred.username : 'None'}`);
      console.log(`   Reward Coupon: ${referral.rewardCoupon ? referral.rewardCoupon.code : 'None'}`);
    });

    // Get all referrals where this user was referred by someone
    const referredBy = await Referral.find({ referred: userId })
      .populate('referrer', 'username email firstName lastName')
      .populate('rewardCoupon', 'code discountValue discountType status');

    if (referredBy.length > 0) {
      console.log('\n🔗 REFERRALS WHERE THIS USER WAS REFERRED:');
      console.log('==========================================');
      referredBy.forEach((referral, index) => {
        console.log(`${index + 1}. Referred by: ${referral.referrer.username}`);
        console.log(`   Code used: ${referral.referralCode}`);
        console.log(`   Status: ${referral.status}`);
        console.log(`   Reward Coupon: ${referral.rewardCoupon ? referral.rewardCoupon.code : 'None'}`);
      });
    }

  } catch (error) {
    console.error('Error debugging user referrals:', error);
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node debug-referral.js <referral_code_or_token>');
    console.log('  node debug-referral.js --user <user_id>');
    console.log('');
    console.log('Examples:');
    console.log('  node debug-referral.js ABC12345');
    console.log('  node debug-referral.js --user 507f1f77bcf86cd799439011');
    return;
  }

  if (args[0] === '--user' && args[1]) {
    await debugUserReferrals(args[1]);
  } else {
    await debugReferral(args[0]);
  }

  // Close connection
  await mongoose.connection.close();
  console.log('\nDatabase connection closed');
}

main().catch(console.error); 