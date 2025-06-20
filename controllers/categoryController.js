import Category from '../models/categoryModel.js';

// List categories with search, pagination, sort, and filter by isDeleted
export const listCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const status = req.query.status; // 'active', 'inactive', or 'all'
    const sort = req.query.sort === 'asc' ? 1 : -1;
    const query = {
      isDeleted: false,
      name: { $regex: search, $options: 'i' },
    };
    if (status === 'active') query.status = 'active';
    else if (status === 'inactive') query.status = 'inactive';
    // else show all statuses
    const total = await Category.countDocuments(query);
    const categories = await Category.find(query)
      .sort({ createdAt: sort })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({
      categories,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Add category
export const addCategory = async (req, res) => {
  try {
    const { name, status } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const exists = await Category.findOne({ name, isDeleted: false });
    if (exists) return res.status(400).json({ message: 'Category already exists' });
    const category = new Category({ name, status });
    await category.save();
    res.status(201).json({ message: 'Category created', category });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Edit category
export const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    const category = await Category.findById(id);
    if (!category || category.isDeleted) return res.status(404).json({ message: 'Category not found' });
    if (name) category.name = name;
    if (status) category.status = status;
    await category.save();
    res.json({ message: 'Category updated', category });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Soft delete category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category || category.isDeleted) return res.status(404).json({ message: 'Category not found' });
    category.isDeleted = true;
    await category.save();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
}; 