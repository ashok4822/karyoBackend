import Product from '../models/productModel.js';
import ProductVariant from '../models/productVariantModel.js';
import cloudinary from '../config/cloudinary.js';
import sharp from 'sharp';
import fs from 'fs';

export const addProduct = async (req, res) => {
  try {
    const { name, description, category, status, price, variants } = req.body;
    if (!name || !price || !category || !variants) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Parse variants (should be JSON string)
    const variantList = JSON.parse(variants);
    if (!Array.isArray(variantList) || variantList.length === 0) {
      return res.status(400).json({ message: 'At least one variant required' });
    }
    // Images: req.files (multer array)
    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ message: 'At least 3 images required' });
    }
    // Crop/resize and upload images to Cloudinary
    const imageUrls = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const buffer = await sharp(file.path)
        .resize(600, 600, { fit: 'cover' })
        .toBuffer();
      // Save temp file for Cloudinary upload
      const tempPath = file.path + '-resized.jpg';
      fs.writeFileSync(tempPath, buffer);
      const result = await cloudinary.uploader.upload(tempPath, { folder: 'products' });
      imageUrls.push(result.secure_url);
      fs.unlinkSync(file.path);
      fs.unlinkSync(tempPath);
    }
    // Main image is first, others are next two
    const mainImage = imageUrls[0];
    const otherImages = imageUrls.slice(1, 3);
    // Create product
    const product = new Product({
      name,
      description,
      category,
      status,
      price,
      mainImage,
      otherImages,
    });
    await product.save();
    // Create variants
    const variantIds = [];
    for (const v of variantList) {
      // Each variant can have its own images (optional, here we use product images)
      const variant = new ProductVariant({
        product: product._id,
        colour: v.colour,
        capacity: v.capacity,
        imageUrls: v.imageUrls || imageUrls, // Use product images if not provided
      });
      await variant.save();
      variantIds.push(variant._id);
    }
    product.variants = variantIds;
    await product.save();
    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// List products with pagination, search, filter
export const listProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status, category } = req.query;
    const query = { isDeleted: false };
    if (search) query.name = { $regex: search, $options: 'i' };
    if (status) query.status = status;
    if (category) query.category = category;
    const products = await Product.find(query)
      .populate('category')
      .populate('variants')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Product.countDocuments(query);
    res.json({ products, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get product by ID
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .populate('variants');
    if (!product || product.isDeleted) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Edit product (basic fields, images, variants)
export const editProduct = async (req, res) => {
  try {
    const { name, description, category, status, price, variants } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) return res.status(404).json({ message: 'Product not found' });
    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (status) product.status = status;
    if (price) product.price = price;
    // Handle images if uploaded
    if (req.files && req.files.length > 0) {
      // Remove old images from Cloudinary? (optional)
      // Upload new images
      const imageUrls = [];
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const buffer = await sharp(file.path)
          .resize(600, 600, { fit: 'cover' })
          .toBuffer();
        const tempPath = file.path + '-resized.jpg';
        fs.writeFileSync(tempPath, buffer);
        const result = await cloudinary.uploader.upload(tempPath, { folder: 'products' });
        imageUrls.push(result.secure_url);
        fs.unlinkSync(file.path);
        fs.unlinkSync(tempPath);
      }
      product.mainImage = imageUrls[0];
      product.otherImages = imageUrls.slice(1, 3);
    }
    await product.save();
    // Update variants
    if (variants) {
      const variantList = JSON.parse(variants);
      // Remove old variants
      await ProductVariant.deleteMany({ product: product._id });
      // Add new variants
      const variantIds = [];
      for (const v of variantList) {
        const variant = new ProductVariant({
          product: product._id,
          colour: v.colour,
          capacity: v.capacity,
          imageUrls: v.imageUrls || [product.mainImage, ...product.otherImages],
        });
        await variant.save();
        variantIds.push(variant._id);
      }
      product.variants = variantIds;
      await product.save();
    }
    res.json({ message: 'Product updated', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Soft delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) return res.status(404).json({ message: 'Product not found' });
    product.isDeleted = true;
    await product.save();
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 