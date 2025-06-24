import Category from "../models/categoryModel.js";

// List categories with search, pagination, sort, and filter by status
export const listCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || "";
    const status = req.query.status; // 'active', 'inactive', 'deleted', or 'all'
    const sort = req.query.sort === "asc" ? 1 : -1;
    const query = {
      name: { $regex: search, $options: "i" },
    };

    // Filter by status
    if (status === "active") query.status = "active";
    else if (status === "inactive") query.status = "inactive";
    else if (status === "deleted") query.status = "deleted";
    // else show all statuses (including deleted)

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
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Add category
export const addCategory = async (req, res) => {
  try {
    const { name, status } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    // Check if category exists (excluding deleted ones)
    const exists = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      status: { $ne: "deleted" },
    });
    if (exists)
      return res.status(400).json({ message: "Category already exists" });

    const category = new Category({ name, status });
    await category.save();
    res.status(201).json({ message: "Category created", category });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Edit category
export const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const category = await Category.findById(id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    // If changing name, check if it already exists (excluding deleted ones and current category)
    if (name && name !== category.name) {
      const exists = await Category.findOne({
        name: { $regex: `^${name}$`, $options: "i" },
        status: { $ne: "deleted" },
        _id: { $ne: id },
      });
      if (exists)
        return res
          .status(400)
          .json({ message: "Category name already exists" });
    }

    if (name) category.name = name;
    if (status) category.status = status;

    await category.save();
    res.json({ message: "Category updated", category });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Soft delete category (set status to deleted)
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    category.status = "deleted";
    await category.save();
    res.json({ message: "Category deleted" });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Restore deleted category (set status back to active)
export const restoreCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    if (category.status !== "deleted") {
      return res.status(400).json({ message: "Category is not deleted" });
    }

    category.status = "active";
    await category.save();
    res.json({ message: "Category restored", category });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get all active categories for user-facing components
export const getActiveCategories = async (req, res) => {
  try {
    const categories = await Category.find({ status: "active" })
      .sort({ name: 1 })
      .select("name _id");

    res.json({ categories });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};
