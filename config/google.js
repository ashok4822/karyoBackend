import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import Referral from '../models/referralModel.js';
import { generateReferralReward } from '../controllers/referralController.js';
import User from "../models/userModel.js";

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('GoogleStrategy: callback started');
    const email = profile.emails[0].value;
    let user = await User.findOne({ email });
    if (user && user.isDeleted) {
      return done(null, false, { message: "Your account has been blocked. Please contact support." });
    }
    let isNewUser = false;
    if (!user) {
      let baseUsername = profile.displayName.replace(/\s+/g, '').toLowerCase();
      let username = baseUsername;
      let count = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${count}`;
        count++;
      }
      user = await User.create({
        username,
        email,
        password: Math.random().toString(36).slice(-8),
        mobileNo: undefined,
      });
      isNewUser = true;
    }
    console.log('GoogleStrategy: isNewUser:', isNewUser);
    console.log('GoogleStrategy: global._passport_oauth_referral:', global._passport_oauth_referral);
    // --- Referral support for Google sign-in ---
    if (isNewUser && global._passport_oauth_referral) {
      console.log('GoogleStrategy: Starting referral processing...');
      const { referralToken, referralCode } = global._passport_oauth_referral;
      let referral = null;
      let referrerUser = null;
      let usedReferralCode = null;
      if (referralToken || referralCode) {
        if (referralToken) {
          referral = await Referral.isValidReferralToken(referralToken);
        } else if (referralCode) {
          referral = await Referral.isValidReferralCode(referralCode);
          if (!referral) {
            referrerUser = await User.findOne({ referralCode: referralCode });
            if (!referrerUser) {
              console.log('GoogleStrategy: Invalid referral code/token');
            }
            usedReferralCode = referralCode;
          }
        }
        if (referral || referrerUser) {
          try {
            let referralDoc = referral;
            if (!referralDoc && referrerUser) {
              referralDoc = new Referral({
                referrer: referrerUser._id,
                referred: user._id,
                referralCode: usedReferralCode,
                status: "completed",
                completedAt: new Date(),
              });
              await referralDoc.save();
            } else if (referralDoc) {
              referralDoc.referred = user._id;
              await referralDoc.completeReferral();
            }
            const referrerId = referrerUser ? referrerUser._id : referralDoc.referrer;
            await User.findByIdAndUpdate(referrerId, { $inc: { referralCount: 1 } });
            await User.findByIdAndUpdate(user._id, { referredBy: referrerId });
            const rewardCoupon = await generateReferralReward(referrerId);
            referralDoc.rewardCoupon = rewardCoupon._id;
            await referralDoc.save();
            console.log(`GoogleStrategy: Referral completed via Google sign-in. Coupon generated: ${rewardCoupon.code}`);
          } catch (referralError) {
            console.error("GoogleStrategy: Error processing referral (Google sign-in):", referralError);
          }
        }
      }
      // Clear the global/session value after use
      global._passport_oauth_referral = null;
      console.log('GoogleStrategy: Referral processing complete.');
    }
    console.log('GoogleStrategy: callback finished');
    return done(null, user);
  } catch (err) {
    console.error('GoogleStrategy: callback error:', err);
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
}); 