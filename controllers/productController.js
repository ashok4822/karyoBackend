import Product from "../models/productModel.js";
import ProductVariant from "../models/productVariantModel.js";
import cloudinary from "../config/cloudinary.js";
import sharp from "sharp";
import fs from "fs";
import mongoose from "mongoose";

// Add this helper at the top of the file (or in a utils file and import it)
async function updateProductTotalStock(productId) {
  const allVariants = await ProductVariant.find({ product: productId });
  const totalStock = allVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
  await Product.findByIdAndUpdate(productId, { totalStock });
}

export const addProduct = async (req, res) => {
  try {
    console.log("AddProduct request body:", req.body);
    console.log(
      "AddProduct files:",
      req.files ? Object.keys(req.files) : "No files"
    );
    console.log(
      "AddProduct file details:",
      req.files
        ? Object.entries(req.files).map(
            ([field, files]) => `${field}: ${files.length} files`
          )
        : "No files"
    );

    const { name, description, category, brand, status, variants } = req.body;

    // Validate required fields with detailed error messages
    const missingFields = [];
    if (!name || !name.trim()) missingFields.push("name");
    if (!category || !category.trim()) missingFields.push("category");
    if (!brand || !brand.trim()) missingFields.push("brand");

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required fields",
        missingFields,
        received: { name, category, brand },
      });
    }

    // Validate category ID format
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID format" });
    }

    // Check if variants are provided
    const hasVariants = variants && variants.trim() !== "";
    console.log("Has variants:", hasVariants);
    console.log("Variants string:", variants);

    if (hasVariants) {
      try {
        // Parse variants (should be JSON string)
        const variantList = JSON.parse(variants);
        console.log("Parsed variants:", variantList);

        if (!Array.isArray(variantList)) {
          return res.status(400).json({ message: "Variants must be an array" });
        }

        // Validate each variant
        for (let i = 0; i < variantList.length; i++) {
          const variant = variantList[i];
          const variantErrors = [];

          if (!variant.colour || !variant.colour.trim()) {
            variantErrors.push("colour is required");
          }
          if (!variant.capacity || !variant.capacity.trim()) {
            variantErrors.push("capacity is required");
          } else if (!/^\d+(\.\d+)*L$/.test(variant.capacity.trim())) {
            variantErrors.push(
              "Invalid capacity. Must start with a number, can have dots (not at the beginning or end), and end with a capital L."
            );
          }
          if (!variant.price || variant.price <= 0) {
            variantErrors.push("valid price is required");
          }
          if (!variant.stock || variant.stock < 0) {
            variantErrors.push("valid stock is required");
          }

          if (variantErrors.length > 0) {
            return res.status(400).json({
              message: `Variant ${i + 1} validation failed`,
              errors: variantErrors,
              variant: variant,
            });
          }
        }

        // Check if variant images are provided
        const variantImageFields = Object.keys(req.files || {}).filter((key) =>
          key.startsWith("variantImages_")
        );
        console.log("Variant image fields found:", variantImageFields);

        if (variantImageFields.length === 0) {
          return res.status(400).json({
            message: "Variant images are required when variants are enabled",
          });
        }

        // Check if each variant has images
        for (let i = 0; i < variantList.length; i++) {
          const variantImages = req.files[`variantImages_${i}`] || [];
          if (variantImages.length < 3) {
            return res.status(400).json({
              message: `At least 3 images required for variant ${i + 1}`,
              variantIndex: i,
              imagesFound: variantImages.length,
            });
          }
        }
      } catch (parseError) {
        console.error("Error parsing variants:", parseError);
        return res.status(400).json({
          message: "Invalid variants format",
          error: parseError.message,
          received: variants,
        });
      }
    } else {
      // Product-level images required when no variants
      const productImages = req.files?.images || [];
      if (productImages.length < 3) {
        return res.status(400).json({
          message: "At least 3 images required for product",
          imagesReceived: productImages.length,
        });
      }

      // Check if files are actually images
      const nonImageFiles = productImages.filter(
        (file) => !file.mimetype.startsWith("image/")
      );
      if (nonImageFiles.length > 0) {
        return res.status(400).json({
          message: "All files must be images",
          nonImageFiles: nonImageFiles.map((f) => f.originalname),
        });
      }
    }

    // Create product
    const product = new Product({
      name: name.trim(),
      description: description ? description.trim() : "",
      category,
      brand: brand.trim(),
      status: status || "active",
    });

    if (!hasVariants) {
      // Handle product-level images
      const imageUrls = [];
      const tempFiles = [];
      const productImages = req.files?.images || [];

      try {
        for (let i = 0; i < productImages.length; i++) {
          const file = productImages[i];
          console.log(`Processing product image ${i + 1}:`, file.originalname);

          // Validate file type
          if (!file.mimetype.startsWith("image/")) {
            throw new Error(`File ${file.originalname} is not an image`);
          }

          // Resize image with error handling
          let buffer;
          try {
            buffer = await sharp(file.buffer)
              .resize(600, 600, { fit: "cover" })
              .toBuffer();
          } catch (sharpError) {
            console.error("Sharp error:", sharpError);
            throw new Error(
              `Failed to process image ${file.originalname}: ${sharpError.message}`
            );
          }

          // Save temp file for Cloudinary upload
          const tempPath = `uploads/${
            file.fieldname
          }-${Date.now()}-${Math.round(Math.random() * 1e9)}-resized.jpg`;
          fs.writeFileSync(tempPath, buffer);
          tempFiles.push(tempPath);

          // Upload to Cloudinary with error handling
          let result;
          try {
            result = await cloudinary.uploader.upload(tempPath, {
              folder: "products",
            });
            imageUrls.push(result.secure_url);
            console.log(
              `Uploaded product image ${i + 1} to Cloudinary:`,
              result.secure_url
            );
          } catch (cloudinaryError) {
            console.error("Cloudinary upload error:", cloudinaryError);
            throw new Error(
              `Failed to upload image ${file.originalname} to Cloudinary: ${cloudinaryError.message}`
            );
          }
        }

        // Main image is first, others are next
        product.mainImage = imageUrls[0];
        product.otherImages = imageUrls.slice(1);
      } catch (processingError) {
        console.error("Image processing error:", processingError);
        return res.status(500).json({ message: processingError.message });
      } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (err) {
            console.log("Error deleting temp file:", err.message);
          }
        }
      }
    }

    console.log("Saving product:", product);
    await product.save();

    // Handle variants if provided
    if (hasVariants) {
      console.log("Processing variants...");
      const variantList = JSON.parse(variants);
      const variantIds = [];
      let totalStock = 0;

      for (let i = 0; i < variantList.length; i++) {
        console.log(`Processing variant ${i + 1}:`, variantList[i]);
        const v = variantList[i];

        // Handle variant-specific images
        let variantImageUrls = [];
        const tempFiles = [];
        const variantImages = req.files[`variantImages_${i}`] || [];

        try {
          console.log(`Variant ${i + 1} image files:`, variantImages.length);

          for (const file of variantImages) {
            console.log(
              `Processing variant ${i + 1} image:`,
              file.originalname
            );

            // Validate file type
            if (!file.mimetype.startsWith("image/")) {
              throw new Error(`File ${file.originalname} is not an image`);
            }

            // Resize image with error handling
            let buffer;
            try {
              buffer = await sharp(file.buffer)
                .resize(600, 600, { fit: "cover" })
                .toBuffer();
            } catch (sharpError) {
              console.error("Sharp error:", sharpError);
              throw new Error(
                `Failed to process image ${file.originalname}: ${sharpError.message}`
              );
            }

            const tempPath = `uploads/${
              file.fieldname
            }-${Date.now()}-${Math.round(Math.random() * 1e9)}-resized.jpg`;
            fs.writeFileSync(tempPath, buffer);
            tempFiles.push(tempPath);

            // Upload to Cloudinary with error handling
            let result;
            try {
              result = await cloudinary.uploader.upload(tempPath, {
                folder: "product-variants",
              });
              variantImageUrls.push(result.secure_url);
              console.log(
                `Uploaded variant ${i + 1} image to Cloudinary:`,
                result.secure_url
              );
            } catch (cloudinaryError) {
              console.error("Cloudinary upload error:", cloudinaryError);
              throw new Error(
                `Failed to upload image ${file.originalname} to Cloudinary: ${cloudinaryError.message}`
              );
            }
          }
        } catch (processingError) {
          console.error("Variant image processing error:", processingError);
          return res.status(500).json({ message: processingError.message });
        } finally {
          // Clean up temporary files for this variant
          for (const tempFile of tempFiles) {
            try {
              console.log(
                `[CLEANUP] Attempting to delete temp file: ${tempFile}`
              );
              if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
                console.log(`[CLEANUP] Deleted temp file: ${tempFile}`);
              } else {
                console.log(
                  `[CLEANUP] Temp file not found (already deleted?): ${tempFile}`
                );
              }
            } catch (err) {
              console.log(
                `[CLEANUP] Error deleting temp file: ${tempFile} - ${err.message}`
              );
            }
          }
        }

        const variant = new ProductVariant({
          product: product._id,
          colour: v.colour.trim(),
          capacity: v.capacity.trim(),
          price: Number(v.price),
          stock: Number(v.stock),
          status: v.status || "active",
          imageUrls: variantImageUrls,
        });

        console.log("Saving variant:", variant);
        await variant.save();
        variantIds.push(variant._id);

        // Track stock for product status
        totalStock += Number(v.stock);
      }

      // Update product with variant information
      product.variants = variantIds;
      product.totalStock = totalStock;

      // Do not override product.status here; allow admin to set status explicitly

      await product.save();
    }

    console.log("Product created successfully");
    res.status(201).json({ message: "Product created", product });
  } catch (error) {
    console.error("Product creation error:", error);

    // Handle specific MongoDB errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        message: "Validation error",
        errors: validationErrors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid data format" });
    }

    res.status(500).json({
      message: "Internal Server Error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// List products with pagination, search, filter
export const listProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 5,
      search = "",
      status,
      category,
      brand,
      variantColour,
      variantCapacity,
      minPrice,
      maxPrice,
      sort = "newest",
    } = req.query;

    // Validate search input
    let searchTrimmed = typeof search === "string" ? search.trim() : "";
    if (searchTrimmed && !/^[\w\s.,'"!?-]{0,100}$/.test(searchTrimmed)) {
      return res.status(400).json({ message: "Invalid search input." });
    }

    console.log("Filter parameters:", {
      search,
      status,
      category,
      brand,
      variantColour,
      variantCapacity,
      minPrice,
      maxPrice,
      sort,
    });

    const query = { isDeleted: false, status: { $in: ["active", "inactive"] } };

    if (searchTrimmed) {
      query.$or = [
        { name: { $regex: searchTrimmed, $options: "i" } },
        { description: { $regex: searchTrimmed, $options: "i" } },
        { brand: { $regex: searchTrimmed, $options: "i" } },
      ];
    }
    if (status) query.status = status;
    if (category && category !== "") {
      console.log("Processing category filter:", category);
      if (Array.isArray(category)) {
        // Multiple categories selected - use $in operator
        const categoryIds = category.map((cat) => {
          if (mongoose.Types.ObjectId.isValid(cat)) {
            return new mongoose.Types.ObjectId(cat);
          }
          return cat;
        });
        console.log(
          "Multiple categories - converted to ObjectIds:",
          categoryIds
        );
        query.category = { $in: categoryIds };
      } else if (typeof category === "string") {
        // Single category - check if it's comma-separated
        if (category.includes(",")) {
          const categoryIds = category.split(",").map((cat) => {
            if (mongoose.Types.ObjectId.isValid(cat.trim())) {
              return new mongoose.Types.ObjectId(cat.trim());
            }
            return cat.trim();
          });
          console.log(
            "Comma-separated categories - converted to ObjectIds:",
            categoryIds
          );
          query.category = { $in: categoryIds };
        } else {
          // Single category value
          if (mongoose.Types.ObjectId.isValid(category)) {
            console.log("Single category - converted to ObjectId:", category);
            query.category = new mongoose.Types.ObjectId(category);
          } else {
            console.log("Single category - using as string:", category);
            query.category = category;
          }
        }
      }
    }
    // Handle brand filtering - support multiple brands
    if (brand && brand !== "") {
      console.log("Processing brand filter:", brand);
      if (Array.isArray(brand)) {
        // Multiple brands selected - use $in operator
        const brandRegexes = brand.map((b) => new RegExp(b, "i"));
        console.log("Multiple brands - converted to regexes:", brandRegexes);
        query.brand = { $in: brandRegexes };
      } else if (typeof brand === "string") {
        // Single brand - check if it's comma-separated
        if (brand.includes(",")) {
          const brandRegexes = brand
            .split(",")
            .map((b) => new RegExp(b.trim(), "i"));
          console.log(
            "Comma-separated brands - converted to regexes:",
            brandRegexes
          );
          query.brand = { $in: brandRegexes };
        } else {
          // Single brand value
          console.log("Single brand - using regex:", brand);
          query.brand = { $regex: brand, $options: "i" };
        }
      }
    }

    console.log("Base query:", query);

    // Debug: Check if variants exist in database
    const variantCount = await ProductVariant.countDocuments();
    console.log("Total variants in database:", variantCount);

    if (variantCount > 0) {
      const sampleVariant = await ProductVariant.findOne();
      console.log("Sample variant:", JSON.stringify(sampleVariant, null, 2));
    }

    // Build aggregation pipeline
    let pipeline = [
      { $match: query },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variantId",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$variantId" }, "objectId"] },
                  "$$variantId",
                  { $toObjectId: "$$variantId" },
                ],
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "productvariants",
          localField: "variants",
          foreignField: "_id",
          as: "variantDetails",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $addFields: {
          category: { $arrayElemAt: ["$categoryDetails", 0] },
        },
      },
      {
        $project: {
          categoryDetails: 0,
        },
      },
      {
        $addFields: {
          variantDetails: {
            $filter: {
              input: "$variantDetails",
              as: "v",
              cond: { $eq: ["$$v.isDeleted", false] },
            },
          },
        },
      },
    ];

    console.log(
      "Pipeline before filtering:",
      JSON.stringify(pipeline, null, 2)
    );

    // Handle variantColour - Express might send it as a string or array
    let colours = [];
    if (variantColour && variantColour !== "") {
      if (Array.isArray(variantColour)) {
        colours = variantColour;
      } else if (typeof variantColour === "string") {
        // Check if it's a comma-separated string or single value
        colours = variantColour.includes(",")
          ? variantColour.split(",")
          : [variantColour];
      }
    }

    // Handle variantCapacity - Express might send it as a string or array
    let capacities = [];
    if (variantCapacity && variantCapacity !== "") {
      if (Array.isArray(variantCapacity)) {
        capacities = variantCapacity;
      } else if (typeof variantCapacity === "string") {
        // Check if it's a comma-separated string or single value
        capacities = variantCapacity.includes(",")
          ? variantCapacity.split(",")
          : [variantCapacity];
      }
    }

    // Add variant filtering if specified
    if (colours.length > 0 || capacities.length > 0) {
      const variantFilters = [];

      if (colours.length > 0) {
        console.log("Processing colours:", colours);
        variantFilters.push({
          variantDetails: {
            $elemMatch: {
              colour: { $in: colours.map((c) => new RegExp(c.trim(), "i")) },
            },
          },
        });
      }

      if (capacities.length > 0) {
        console.log("Processing capacities:", capacities);
        variantFilters.push({
          variantDetails: {
            $elemMatch: {
              capacity: {
                $in: capacities.map((c) => new RegExp(c.trim(), "i")),
              },
            },
          },
        });
      }

      if (variantFilters.length > 0) {
        console.log("Adding variant filters to pipeline:", variantFilters);
        pipeline.push({ $match: { $and: variantFilters } });
      }
    }

    // Add price range filtering if specified
    if (minPrice || maxPrice) {
      const priceMatch = {};
      if (minPrice) {
        priceMatch["$gte"] = Number(minPrice);
      }
      if (maxPrice) {
        priceMatch["$lte"] = Number(maxPrice);
      }
      if (Object.keys(priceMatch).length > 0) {
        pipeline.push({
          $match: {
            variantDetails: {
              $elemMatch: {
                price: priceMatch,
              },
            },
          },
        });
      }
    }

    // Add sorting
    let sortStage = { createdAt: -1 }; // default sort
    if (sort === "name-asc" || sort === "name-desc") {
      pipeline.unshift({
        $addFields: {
          nameLower: { $toLower: "$name" },
        },
      });
      sortStage = { nameLower: sort === "name-asc" ? 1 : -1 };
    } else {
      switch (sort) {
        case "oldest":
          sortStage = { createdAt: 1 };
          break;
        case "price-asc":
          sortStage = { "variantDetails.price": 1 };
          break;
        case "price-desc":
          sortStage = { "variantDetails.price": -1 };
          break;
        default:
          sortStage = { createdAt: -1 }; // newest first
      }
    }

    // Add sorting and pagination
    pipeline.push(
      { $sort: sortStage },
      { $skip: (page - 1) * limit },
      { $limit: Number(limit) }
    );

    console.log("Final pipeline:", JSON.stringify(pipeline, null, 2));

    // Get total count for pagination
    const countPipeline = [
      { $match: query },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variantId",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$variantId" }, "objectId"] },
                  "$$variantId",
                  { $toObjectId: "$$variantId" },
                ],
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "productvariants",
          localField: "variants",
          foreignField: "_id",
          as: "variantDetails",
        },
      },
    ];

    // Apply the same variant filtering logic to count pipeline
    const countVariantFilters = [];

    if (colours.length > 0) {
      countVariantFilters.push({
        variantDetails: {
          $elemMatch: {
            colour: { $in: colours.map((c) => new RegExp(c.trim(), "i")) },
          },
        },
      });
    }

    if (capacities.length > 0) {
      countVariantFilters.push({
        variantDetails: {
          $elemMatch: {
            capacity: { $in: capacities.map((c) => new RegExp(c.trim(), "i")) },
          },
        },
      });
    }

    if (countVariantFilters.length > 0) {
      console.log(
        "Adding variant filters to count pipeline:",
        countVariantFilters
      );
      countPipeline.push({ $match: { $and: countVariantFilters } });
    }

    countPipeline.push({ $count: "total" });

    const [products, totalResult] = await Promise.all([
      Product.aggregate(pipeline),
      Product.aggregate(countPipeline),
    ]);

    console.log("Found products:", products.length);
    console.log("Total result:", totalResult);

    // Debug: Log first product's variantDetails
    if (products.length > 0) {
      console.log(
        "First product variantDetails:",
        JSON.stringify(products[0].variantDetails, null, 2)
      );
      console.log("First product variants array:", products[0].variants);
      console.log(
        "First product full data:",
        JSON.stringify(products[0], null, 2)
      );
    }

    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({ products, total });
  } catch (error) {
    console.error("List products error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get product by ID
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category")
      .populate({
        path: "variants",
        select: "colour capacity price stock imageUrls",
      });
    if (!product || product.isDeleted)
      return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Edit product (basic fields, images, variants)
export const editProduct = async (req, res) => {
  try {
    console.log("EditProduct request body:", req.body);
    console.log(
      "EditProduct files:",
      req.files ? Object.keys(req.files) : "No files"
    );

    const { name, description, category, brand, status, variants } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted)
      return res.status(404).json({ message: "Product not found" });

    // Store the previous status to check if it changed
    const previousStatus = product.status;

    if (name) product.name = name;
    if (description) product.description = description;
    if (category) product.category = category;
    if (brand) product.brand = brand;
    if (status) product.status = status;

    // Handle bidirectional status updates: product status changes affect all variants
    // If product status is changed to inactive, update all variants to inactive
    if (status === "inactive" && previousStatus !== "inactive") {
      console.log(
        "Product status changed to inactive, updating all variants to inactive"
      );

      // Update all variants of this product to inactive
      const updateResult = await ProductVariant.updateMany(
        { product: product._id },
        { status: "inactive" }
      );

      console.log(
        `Updated ${updateResult.modifiedCount} variants to inactive status`
      );
    }

    // If product status is changed from inactive to active, update all variants to active
    if (status === "active" && previousStatus === "inactive") {
      console.log(
        "Product status changed from inactive to active, updating all variants to active"
      );

      // Update all variants of this product to active
      const updateResult = await ProductVariant.updateMany(
        { product: product._id },
        { status: "active" }
      );

      console.log(
        `Updated ${updateResult.modifiedCount} variants to active status`
      );
    }

    // Handle images if uploaded (for backward compatibility)
    if (req.files && req.files.length > 0) {
      const imageUrls = [];
      const tempFiles = [];

      try {
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const buffer = await sharp(file.buffer)
            .resize(600, 600, { fit: "cover" })
            .toBuffer();
          const tempPath = `uploads/${
            file.fieldname
          }-${Date.now()}-${Math.round(Math.random() * 1e9)}-resized.jpg`;
          fs.writeFileSync(tempPath, buffer);
          tempFiles.push(tempPath);

          const result = await cloudinary.uploader.upload(tempPath, {
            folder: "products",
          });
          imageUrls.push(result.secure_url);
        }

        product.mainImage = imageUrls[0];
        product.otherImages = imageUrls.slice(1);
      } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (err) {
            console.log("Error deleting temp file:", err.message);
          }
        }
      }
    }

    await product.save();

    // Update variants if provided
    if (variants) {
      const variantList = JSON.parse(variants);

      // Remove old variants
      await ProductVariant.deleteMany({ product: product._id });

      // Add new variants
      const variantIds = [];
      let totalStock = 0;

      for (let i = 0; i < variantList.length; i++) {
        const v = variantList[i];

        // Handle variant-specific images
        let variantImageUrls = [];
        const tempFiles = [];
        const variantImages = req.files[`variantImages_${i}`] || [];

        try {
          console.log(`Variant ${i + 1} image files:`, variantImages.length);

          for (const file of variantImages) {
            console.log(
              `Processing variant ${i + 1} image:`,
              file.originalname
            );

            // Validate file type
            if (!file.mimetype.startsWith("image/")) {
              throw new Error(`File ${file.originalname} is not an image`);
            }

            // Resize image with error handling
            let buffer;
            try {
              buffer = await sharp(file.buffer)
                .resize(600, 600, { fit: "cover" })
                .toBuffer();
            } catch (sharpError) {
              console.error("Sharp error:", sharpError);
              throw new Error(
                `Failed to process image ${file.originalname}: ${sharpError.message}`
              );
            }

            const tempPath = `uploads/${
              file.fieldname
            }-${Date.now()}-${Math.round(Math.random() * 1e9)}-resized.jpg`;
            fs.writeFileSync(tempPath, buffer);
            tempFiles.push(tempPath);

            // Upload to Cloudinary with error handling
            let result;
            try {
              result = await cloudinary.uploader.upload(tempPath, {
                folder: "product-variants",
              });
              variantImageUrls.push(result.secure_url);
              console.log(
                `Uploaded variant ${i + 1} image to Cloudinary:`,
                result.secure_url
              );
            } catch (cloudinaryError) {
              console.error("Cloudinary upload error:", cloudinaryError);
              throw new Error(
                `Failed to upload image ${file.originalname} to Cloudinary: ${cloudinaryError.message}`
              );
            }
          }
        } catch (processingError) {
          console.error("Variant image processing error:", processingError);
          return res.status(500).json({ message: processingError.message });
        } finally {
          // Clean up temporary files for this variant
          for (const tempFile of tempFiles) {
            try {
              if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
              }
            } catch (err) {
              console.log("Error deleting temp file:", err.message);
            }
          }
        }

        // Set variant status to inactive if product is inactive
        const variantStatus =
          product.status === "inactive" ? "inactive" : v.status || "active";

        const variant = new ProductVariant({
          product: product._id,
          colour: v.colour,
          capacity: v.capacity,
          price: v.price,
          stock: v.stock,
          status: variantStatus,
          imageUrls: variantImageUrls,
        });
        await variant.save();
        variantIds.push(variant._id);

        // Track stock for product status
        totalStock += v.stock;
      }

      // Update product with variant information
      product.variants = variantIds;
      product.totalStock = totalStock;

      // Do not override product.status here; allow admin to set status explicitly

      await product.save();
    }

    console.log("Product updated successfully");
    res.json({ message: "Product updated", product });
  } catch (error) {
    console.error("Product update error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Soft delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted)
      return res.status(404).json({ message: "Product not found" });
    product.isDeleted = true;
    await product.save();
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get unique variant attributes for filtering dropdowns
export const getVariantOptions = async (req, res) => {
  try {
    const [colours, capacities] = await Promise.all([
      ProductVariant.distinct("colour"),
      ProductVariant.distinct("capacity"),
    ]);

    res.json({
      colours: colours.filter(Boolean).sort(),
      capacities: capacities.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("Get variant options error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get unique brands for filtering dropdown
export const getBrandOptions = async (req, res) => {
  try {
    const brands = await Product.distinct("brand", { isDeleted: false });
    res.json({
      brands: brands.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("Get brand options error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Delete individual variant
export const deleteVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if variant exists and belongs to the product
    const variant = await ProductVariant.findOne({
      _id: variantId,
      product: productId,
      isDeleted: false,
    });
    if (!variant) {
      return res.status(404).json({ message: "Variant not found" });
    }

    // Check if this is the last variant for the product (count only non-deleted)
    const variantCount = await ProductVariant.countDocuments({
      product: productId,
      isDeleted: false,
    });
    if (variantCount <= 1) {
      return res.status(400).json({
        message:
          "A product must have at least one variant. Cannot delete the last variant.",
      });
    }

    // Soft delete the variant
    variant.isDeleted = true;
    await variant.save();

    // Remove variant from product's variants array
    product.variants = product.variants.filter(
      (v) => v.toString() !== variantId
    );

    // Recalculate total stock (only non-deleted variants)
    const remainingVariants = await ProductVariant.find({
      product: productId,
      isDeleted: false,
    });
    const totalStock = remainingVariants.reduce((sum, v) => sum + v.stock, 0);
    product.totalStock = totalStock;

    // Update product status based on remaining stock (only if not manually set to inactive)
    if (product.status !== "inactive") {
      if (totalStock === 0) {
        product.status = "inactive";
      } else if (totalStock < 10) {
        product.status = "active";
      } else {
        product.status = "active";
      }
    }

    await product.save();

    res.json({ message: "Variant deleted successfully (soft delete)" });
  } catch (error) {
    console.error("Delete variant error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update individual variant
export const updateVariant = async (req, res) => {
  try {
    const { productId, variantId } = req.params;
    const { colour, capacity, price, stock, status, removedOldImages } = req.body;
    
    console.log("UpdateVariant - removedOldImages:", removedOldImages);
    console.log("UpdateVariant - files count:", req.files?.images?.length || 0);

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if variant exists and belongs to the product
    const variant = await ProductVariant.findOne({
      _id: variantId,
      product: productId,
    });
    if (!variant) {
      return res.status(404).json({ message: "Variant not found" });
    }

    // Update the variant
    if (colour) variant.colour = colour;
    if (capacity) variant.capacity = capacity;
    if (price !== undefined) variant.price = price;
    if (stock !== undefined) variant.stock = stock;
    // Allow changing variant status regardless of product status
    if (status) {
      variant.status = status;
      console.log("Variant status updated to:", status);
    }

    // Handle removed old images
    let updatedImageUrls = [...variant.imageUrls];
    console.log("Original imageUrls:", variant.imageUrls);
    if (removedOldImages) {
      try {
        const removedIndices = JSON.parse(removedOldImages);
        console.log("Parsed removedIndices:", removedIndices);
        // Remove images at the specified indices (in reverse order to maintain correct indices)
        removedIndices.sort((a, b) => b - a).forEach(index => {
          if (index >= 0 && index < updatedImageUrls.length) {
            console.log(`Removing image at index ${index}:`, updatedImageUrls[index]);
            updatedImageUrls.splice(index, 1);
          }
        });
        console.log("Updated imageUrls after removal:", updatedImageUrls);
      } catch (parseError) {
        console.error("Error parsing removedOldImages:", parseError);
      }
    }

    // Handle image update if new images are provided
    const variantImages = req.files?.images || [];
    if (variantImages.length > 0) {
      const newImageUrls = [];
      const tempFiles = [];
      try {
        for (let i = 0; i < variantImages.length; i++) {
          const file = variantImages[i];
          // Validate file type
          if (!file.mimetype.startsWith("image/")) {
            throw new Error(`File ${file.originalname} is not an image`);
          }
          // Resize image
          let buffer;
          try {
            buffer = await sharp(file.buffer)
              .resize(600, 600, { fit: "cover" })
              .toBuffer();
          } catch (sharpError) {
            console.error("Sharp error:", sharpError);
            throw new Error(
              `Failed to process image ${file.originalname}: ${sharpError.message}`
            );
          }
          const tempPath = `uploads/${
            file.fieldname
          }-${Date.now()}-${Math.round(Math.random() * 1e9)}-resized.jpg`;
          fs.writeFileSync(tempPath, buffer);
          tempFiles.push(tempPath);
          // Upload to Cloudinary
          let result;
          try {
            result = await cloudinary.uploader.upload(tempPath, {
              folder: "product-variants",
            });
            newImageUrls.push(result.secure_url);
          } catch (cloudinaryError) {
            console.error("Cloudinary upload error:", cloudinaryError);
            throw new Error(
              `Failed to upload image ${file.originalname} to Cloudinary: ${cloudinaryError.message}`
            );
          }
        }
      } catch (processingError) {
        console.error("Variant image processing error:", processingError);
        return res.status(500).json({ message: processingError.message });
      } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (err) {
            console.log("Error deleting temp file:", err.message);
          }
        }
      }
      // Combine remaining old images with new images
      variant.imageUrls = [...updatedImageUrls, ...newImageUrls];
    } else {
      // If no new images, just update with removed old images
      variant.imageUrls = updatedImageUrls;
    }

    // Validate minimum images requirement
    if (variant.imageUrls.length < 3) {
      return res.status(400).json({ 
        message: "Minimum 3 images required for a variant" 
      });
    }

    await variant.save();

    res.json({ message: "Variant updated successfully", variant });
  } catch (error) {
    console.error("Update variant error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Add variant to existing product
export const addVariant = async (req, res) => {
  try {
    console.log("AddVariant request body:", req.body);
    console.log("AddVariant files:", req.files ? req.files.length : "No files");
    console.log("AddVariant params:", req.params);

    const { productId } = req.params;
    const { colour, capacity, price, stock, status } = req.body;

    // Validate required fields
    if (!colour || !capacity || !price || !stock) {
      return res.status(400).json({
        message: "Missing required fields",
        required: ["colour", "capacity", "price", "stock"],
        received: { colour, capacity, price, stock },
      });
    }

    // Validate productId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID format" });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.isDeleted) {
      return res.status(404).json({ message: "Product has been deleted" });
    }

    // Validate images
    const variantImages = req.files?.images || [];
    if (variantImages.length < 3) {
      return res.status(400).json({
        message: "At least 3 images required",
        imagesReceived: variantImages.length,
      });
    }

    // Handle variant images
    const variantImageUrls = [];
    const tempFiles = [];

    try {
      for (let i = 0; i < variantImages.length; i++) {
        const file = variantImages[i];
        console.log(`Processing variant image ${i + 1}:`, file.originalname);

        // Validate file type
        if (!file.mimetype.startsWith("image/")) {
          throw new Error(`File ${file.originalname} is not an image`);
        }

        // Resize image with error handling
        let buffer;
        try {
          buffer = await sharp(file.buffer)
            .resize(600, 600, { fit: "cover" })
            .toBuffer();
        } catch (sharpError) {
          console.error("Sharp error:", sharpError);
          throw new Error(
            `Failed to process image ${file.originalname}: ${sharpError.message}`
          );
        }

        const tempPath = `uploads/${file.fieldname}-${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}-resized.jpg`;
        fs.writeFileSync(tempPath, buffer);
        tempFiles.push(tempPath);

        // Upload to Cloudinary with error handling
        let result;
        try {
          result = await cloudinary.uploader.upload(tempPath, {
            folder: "product-variants",
          });
          variantImageUrls.push(result.secure_url);
          console.log(
            `Uploaded variant image ${i + 1} to Cloudinary:`,
            result.secure_url
          );
        } catch (cloudinaryError) {
          console.error("Cloudinary upload error:", cloudinaryError);
          throw new Error(
            `Failed to upload image ${file.originalname} to Cloudinary: ${cloudinaryError.message}`
          );
        }
      }
    } catch (processingError) {
      console.error("Image processing error:", processingError);
      return res.status(500).json({ message: processingError.message });
    } finally {
      // Clean up temporary files
      for (const tempFile of tempFiles) {
        try {
          console.log(`[CLEANUP] Attempting to delete temp file: ${tempFile}`);
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            console.log(`[CLEANUP] Deleted temp file: ${tempFile}`);
          } else {
            console.log(
              `[CLEANUP] Temp file not found (already deleted?): ${tempFile}`
            );
          }
        } catch (err) {
          console.log(
            `[CLEANUP] Error deleting temp file: ${tempFile} - ${err.message}`
          );
        }
      }
    }

    // Validate numeric fields
    const numericPrice = Number(price);
    const numericStock = Number(stock);

    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: "Invalid price value" });
    }

    if (isNaN(numericStock) || numericStock < 0) {
      return res.status(400).json({ message: "Invalid stock value" });
    }

    // Create new variant
    const variant = new ProductVariant({
      product: productId,
      colour: colour.trim(),
      capacity: capacity.trim(),
      price: numericPrice,
      stock: numericStock,
      status: product.status === "inactive" ? "inactive" : status || "active",
      imageUrls: variantImageUrls,
    });

    console.log(
      "Saving variant with status:",
      variant.status,
      "(product status:",
      product.status,
      ")"
    );
    await variant.save();

    // Update product with new variant
    // Always fetch the latest product document before updating
    const updatedProduct = await Product.findById(productId);
    if (updatedProduct) {
      // Only add the variant _id if not already present
      if (
        !updatedProduct.variants.some(
          (id) => id.toString() === variant._id.toString()
        )
      ) {
        updatedProduct.variants.push(variant._id);
      }
      updatedProduct.totalStock += numericStock;
      await updatedProduct.save();
    }

    res.status(201).json({
      message: "Variant added successfully",
      variant,
      product,
    });
  } catch (error) {
    console.error("Add variant error:", error);

    // Handle specific MongoDB errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        message: "Validation error",
        errors: validationErrors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid data format" });
    }

    res.status(500).json({
      message: "Internal Server Error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Get unique variant attributes for user-facing filtering (public)
export const getPublicVariantOptions = async (req, res) => {
  try {
    const [colours, capacities] = await Promise.all([
      ProductVariant.distinct("colour", { status: "active" }),
      ProductVariant.distinct("capacity", { status: "active" }),
    ]);

    res.json({
      colours: colours.filter(Boolean).sort(),
      capacities: capacities.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("Get public variant options error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get unique brands for user-facing filtering (public)
export const getPublicBrandOptions = async (req, res) => {
  try {
    const brands = await Product.distinct("brand", {
      isDeleted: false,
      status: "active",
    });
    res.json({
      brands: brands.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("Get public brand options error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get public products for user-facing product listing  variant.stock
export const getPublicProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 6,
      search = "",
      category,
      brand,
      variantColour,
      variantCapacity,
      minPrice,
      maxPrice,
      sort = "newest",
    } = req.query;

    // Validate search input
    let searchTrimmed = typeof search === "string" ? search.trim() : "";
    if (searchTrimmed && !/^[\w\s.,'"!?-]{0,100}$/.test(searchTrimmed)) {
      return res.status(400).json({ message: "Invalid search input." });
    }

    // console.log('Public products filter parameters:', { search, category, brand, variantColour, variantCapacity, minPrice, maxPrice, sort });

    const query = { isDeleted: false, status: { $in: ["active", "inactive"] } };

    if (searchTrimmed) {
      query.$or = [
        { name: { $regex: searchTrimmed, $options: "i" } },
        { description: { $regex: searchTrimmed, $options: "i" } },
        { brand: { $regex: searchTrimmed, $options: "i" } },
      ];
    }
    // Handle category filtering - support multiple categories
    if (category && category !== "") {
      // console.log('Processing category filter:', category);
      if (Array.isArray(category)) {
        // Multiple categories selected - use $in operator
        const categoryIds = category.map((cat) => {
          if (mongoose.Types.ObjectId.isValid(cat)) {
            return new mongoose.Types.ObjectId(cat);
          }
          return cat;
        });
        // console.log('Multiple categories - converted to ObjectIds:', categoryIds);
        query.category = { $in: categoryIds };
      } else if (typeof category === "string") {
        // Single category - check if it's comma-separated
        if (category.includes(",")) {
          const categoryIds = category.split(",").map((cat) => {
            if (mongoose.Types.ObjectId.isValid(cat.trim())) {
              return new mongoose.Types.ObjectId(cat.trim());
            }
            return cat.trim();
          });
          // console.log('Comma-separated categories - converted to ObjectIds:', categoryIds);
          query.category = { $in: categoryIds };
        } else {
          // Single category value
          if (mongoose.Types.ObjectId.isValid(category)) {
            // console.log('Single category - converted to ObjectId:', category);
            query.category = new mongoose.Types.ObjectId(category);
          } else {
            // console.log('Single category - using as string:', category);
            query.category = category;
          }
        }
      }
    }
    // Handle brand filtering - support multiple brands
    if (brand && brand !== "") {
      // console.log('Processing brand filter:', brand);
      if (Array.isArray(brand)) {
        // Multiple brands selected - use $in operator
        const brandRegexes = brand.map((b) => new RegExp(b, "i"));
        // console.log('Multiple brands - converted to regexes:', brandRegexes);
        query.brand = { $in: brandRegexes };
      } else if (typeof brand === "string") {
        // Single brand - check if it's comma-separated
        if (brand.includes(",")) {
          const brandRegexes = brand
            .split(",")
            .map((b) => new RegExp(b.trim(), "i"));
          // console.log('Comma-separated brands - converted to regexes:', brandRegexes);
          query.brand = { $in: brandRegexes };
        } else {
          // Single brand value
          // console.log('Single brand - using regex:', brand);
          query.brand = { $regex: brand, $options: "i" };
        }
      }
    }

    // Build aggregation pipeline
    let pipeline = [
      { $match: query },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variantId",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$variantId" }, "objectId"] },
                  "$$variantId",
                  { $toObjectId: "$$variantId" },
                ],
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "productvariants",
          localField: "variants",
          foreignField: "_id",
          as: "variantDetails",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $addFields: {
          category: { $arrayElemAt: ["$categoryDetails", 0] },
        },
      },
      {
        $project: {
          categoryDetails: 0,
        },
      },
      {
        $addFields: {
          variantDetails: {
            $filter: {
              input: "$variantDetails",
              as: "v",
              cond: { $eq: ["$$v.isDeleted", false] },
            },
          },
        },
      },
    ];

    // Handle multiple variant filters
    const variantFilters = [];

    // Handle variantColour - Express might send it as a string or array
    let colours = [];
    if (variantColour && variantColour !== "") {
      if (Array.isArray(variantColour)) {
        colours = variantColour;
      } else if (typeof variantColour === "string") {
        // Check if it's a comma-separated string or single value
        colours = variantColour.includes(",")
          ? variantColour.split(",")
          : [variantColour];
      }
    }

    if (colours.length > 0) {
      // console.log('Processing colours:', colours);
      variantFilters.push({
        variantDetails: {
          $elemMatch: {
            colour: { $in: colours.map((c) => new RegExp(c.trim(), "i")) },
          },
        },
      });
    }

    // Handle variantCapacity - Express might send it as a string or array
    let capacities = [];
    if (variantCapacity && variantCapacity !== "") {
      if (Array.isArray(variantCapacity)) {
        capacities = variantCapacity;
      } else if (typeof variantCapacity === "string") {
        // Check if it's a comma-separated string or single value
        capacities = variantCapacity.includes(",")
          ? variantCapacity.split(",")
          : [variantCapacity];
      }
    }

    if (capacities.length > 0) {
      // console.log('Processing capacities:', capacities);
      variantFilters.push({
        variantDetails: {
          $elemMatch: {
            capacity: { $in: capacities.map((c) => new RegExp(c.trim(), "i")) },
          },
        },
      });
    }

    // Add variant filters to pipeline
    if (variantFilters.length > 0) {
      // console.log('Adding variant filters to pipeline:', variantFilters);
      pipeline.push({ $match: { $and: variantFilters } });
    }

    // Add price range filtering if specified
    if (minPrice || maxPrice) {
      const priceMatch = {};
      if (minPrice) {
        priceMatch["$gte"] = Number(minPrice);
      }
      if (maxPrice) {
        priceMatch["$lte"] = Number(maxPrice);
      }
      if (Object.keys(priceMatch).length > 0) {
        pipeline.push({
          $match: {
            variantDetails: {
              $elemMatch: {
                price: priceMatch,
              },
            },
          },
        });
      }
    }

    // Add sorting
    let sortStage = { createdAt: -1 }; // default sort
    if (sort === "name-asc" || sort === "name-desc") {
      pipeline.unshift({
        $addFields: {
          nameLower: { $toLower: "$name" },
        },
      });
      sortStage = { nameLower: sort === "name-asc" ? 1 : -1 };
    } else {
      switch (sort) {
        case "oldest":
          sortStage = { createdAt: 1 };
          break;
        case "price-asc":
          sortStage = { "variantDetails.price": 1 };
          break;
        case "price-desc":
          sortStage = { "variantDetails.price": -1 };
          break;
        default:
          sortStage = { createdAt: -1 }; // newest first
      }
    }

    // Add sorting and pagination
    pipeline.push(
      { $sort: sortStage },
      { $skip: (page - 1) * limit },
      { $limit: Number(limit) }
    );

    // Get total count for pagination
    const countPipeline = [
      { $match: query },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variantId",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$variantId" }, "objectId"] },
                  "$$variantId",
                  { $toObjectId: "$$variantId" },
                ],
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "productvariants",
          localField: "variants",
          foreignField: "_id",
          as: "variantDetails",
        },
      },
    ];

    // Apply the same variant filtering logic to count pipeline
    const countVariantFilters = [];

    if (colours.length > 0) {
      countVariantFilters.push({
        variantDetails: {
          $elemMatch: {
            colour: { $in: colours.map((c) => new RegExp(c.trim(), "i")) },
          },
        },
      });
    }

    if (capacities.length > 0) {
      countVariantFilters.push({
        variantDetails: {
          $elemMatch: {
            capacity: { $in: capacities.map((c) => new RegExp(c.trim(), "i")) },
          },
        },
      });
    }

    if (countVariantFilters.length > 0) {
      // console.log('Adding variant filters to count pipeline:', countVariantFilters);
      countPipeline.push({ $match: { $and: countVariantFilters } });
    }

    countPipeline.push({ $count: "total" });

    const [products, totalResult] = await Promise.all([
      Product.aggregate(pipeline),
      Product.aggregate(countPipeline),
    ]);

    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    res.json({ products, total });
  } catch (error) {
    console.error("Public products error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get public product by ID (for user-facing product details)
export const getPublicProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // console.log('getPublicProductById called with ID:', id);

    // Validate product ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      // console.log('Invalid product ID format:', id);
      return res.status(400).json({ message: "Invalid product ID format" });
    }

    // console.log('Looking for product with ID:', id);

    // Use aggregation pipeline to populate variantDetails like ProductListing
    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variantId",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$variantId" }, "objectId"] },
                  "$$variantId",
                  { $toObjectId: "$$variantId" },
                ],
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "productvariants",
          localField: "variants",
          foreignField: "_id",
          as: "variantDetails",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $addFields: {
          category: { $arrayElemAt: ["$categoryDetails", 0] },
        },
      },
      {
        $project: {
          categoryDetails: 0,
        },
      },
      {
        $addFields: {
          variantDetails: {
            $filter: {
              input: "$variantDetails",
              as: "v",
              cond: { $eq: ["$$v.isDeleted", false] },
            },
          },
        },
      },
    ];

    const products = await Product.aggregate(pipeline);
    const product = products[0];

    if (!product) {
      // console.log('Product not found in database');
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if product is deleted, blocked, or unavailable
    if (product.isDeleted || product.status !== "active") {
      // console.log('Product is not available:', { isDeleted: product.isDeleted, status: product.status });
      return res.status(404).json({ message: "Product not available" });
    }

    // Calculate total stock from active variants
    const totalStock = product.variantDetails.reduce(
      (sum, variant) => sum + (variant.stock || 0),
      0
    );

    // Prepare product data for frontend
    const productData = {
      _id: product._id,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      status: product.status,
      totalStock,
      mainImage: product.mainImage,
      otherImages: product.otherImages || [],
      variantDetails: product.variantDetails, // Use variantDetails instead of variants
      createdAt: product.createdAt,
      // Add mock data for features not yet implemented
      rating: 4.5, // Mock rating
      reviews: 128, // Mock review count
      price:
        product.variantDetails.length > 0
          ? Math.min(...product.variantDetails.map((v) => v.price))
          : 0,
      discount: 0, // Mock discount
      coupons: [], // Mock coupons
      specs: [
        { key: "Brand", value: product.brand },
        { key: "Category", value: product.category?.name || "N/A" },
        { key: "Available Variants", value: product.variantDetails.length },
        { key: "Total Stock", value: totalStock },
      ],
      isNew:
        new Date(product.createdAt) >
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // New if created within 30 days
      blocked: false,
      unavailable: false,
    };

    res.json(productData);
  } catch (error) {
    console.error("Error getting public product by ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
