import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for disk (used in userRoutes.js)
export const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Multer memory storage (used in adminRoutes.js)
export const memoryStorage = multer.memoryStorage();

// File filter for images
export const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// General upload for user profile images (disk storage)
export const upload = multer({ storage: diskStorage });

// General upload for admin (memory storage)
export const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 50,
  },
});

// Custom upload for products with variants (admin)
export const uploadProduct = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 50,
  },
}).fields([
  { name: "images", maxCount: 10 },
  { name: "variantImages_0", maxCount: 10 },
  { name: "variantImages_1", maxCount: 10 },
  { name: "variantImages_2", maxCount: 10 },
  { name: "variantImages_3", maxCount: 10 },
  { name: "variantImages_4", maxCount: 10 },
  { name: "variantImages_5", maxCount: 10 },
  { name: "variantImages_6", maxCount: 10 },
  { name: "variantImages_7", maxCount: 10 },
  { name: "variantImages_8", maxCount: 10 },
  { name: "variantImages_9", maxCount: 10 },
]);

// Error handling middleware for multer
export const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File too large. Maximum size is 5MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: "Too many files. Maximum is 50 files." });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Unexpected file field." });
    }
    return res.status(400).json({ message: `Upload error: ${error.message}` });
  }
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  next();
}; 