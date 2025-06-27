import mongoose from 'mongoose';
const { Schema } = mongoose;

const wishlistItemSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: { type: Schema.Types.ObjectId, required: false },
  addedAt: { type: Date, default: Date.now },
});

const WishlistItem = mongoose.model('WishlistItem', wishlistItemSchema);

export default WishlistItem; 