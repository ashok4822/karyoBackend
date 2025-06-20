import mongoose from 'mongoose';

const productVariantSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  colour: { type: String, required: true },
  capacity: { type: String, required: true },
  imageUrls: [{ type: String, required: true }], // Cloudinary URLs for this variant
});

export default mongoose.model('ProductVariant', productVariantSchema); 