import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  brand: { type: String, required: true, trim: true },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  totalStock: { type: Number, default: 0 },
  // mainImage: { type: String },
  // otherImages: [{ type: String }],
  variants: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant" }],
  createdAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
});

export default mongoose.model("Product", productSchema);
