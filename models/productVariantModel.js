import mongoose from 'mongoose';

const productVariantSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  colour: { type: String, required: true },
  capacity: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  imageUrls: [{ type: String, required: true }], // Cloudinary URLs for this variant
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ProductVariant', productVariantSchema); 