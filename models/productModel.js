import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  price: { type: Number, required: true },
  mainImage: { type: String, required: true },
  otherImages: [{ type: String }],
  variants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' }],
  createdAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
});

export default mongoose.model('Product', productSchema); 