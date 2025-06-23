import mongoose from 'mongoose';
import Product from './productModel.js';

const productVariantSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  colour: { type: String, required: true },
  capacity: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d+(\.\d+)*L$/.test(v);
      },
      message: 'Invalid capacity. Must start with a number, can have dots (not at the beginning or end), and end with a capital L.'
    }
  },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  imageUrls: [{ type: String, required: true }], // Cloudinary URLs for this variant
  createdAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
});

// Helper to update totalStock in parent product
async function updateProductTotalStock(productId) {
  const ProductVariant = mongoose.model('ProductVariant');
  const allVariants = await ProductVariant.find({ product: productId });
  const totalStock = allVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
  await Product.findByIdAndUpdate(productId, { totalStock });
}

// Update totalStock after save (create/update)
productVariantSchema.post('save', async function(doc) {
  await updateProductTotalStock(doc.product);
});

// Update totalStock after remove (delete)
productVariantSchema.post('remove', async function(doc) {
  await updateProductTotalStock(doc.product);
});

export default mongoose.model('ProductVariant', productVariantSchema); 