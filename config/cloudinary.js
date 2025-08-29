const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const path = require("path");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");

    const imageFormats = ["png", "jpg", "jpeg", "webp", "svg", "avif"];
    const videoFormats = ["mp4", "mov", "avi", "mkv"];
    const documentFormats = ["pdf", "doc", "docx", "xls", "xlsx", "csv"];

    if (![...imageFormats, ...videoFormats, ...documentFormats].includes(ext)) {
      throw new Error(
        "Invalid file type. Allowed formats: PNG, JPG, JPEG, WEBP, MP4, MOV, AVI, MKV, PDF, DOC, DOCX, XLS, XLSX."
      );
    }

    const resource_type = imageFormats.includes(ext)
      ? "image"
      : videoFormats.includes(ext)
      ? "video"
      : "raw";

    // ✅ Use 'upload' instead of 'authenticated' for public access
    const type = "upload";

    return {
      folder: "Pench",
      resource_type,
      type,
      public_id: `${Date.now()}-${file.originalname}`,
    };
  },
});

const upload = multer({ storage });

const getPublicCloudinaryUrl = (public_id, resource_type = "raw") => {
  return cloudinary.url(`Pench/${public_id}`, {
    resource_type,
    type: "upload",
    secure: true,
    flags: "attachment:false", // ✅ Inline display instead of download
  });
};

module.exports = { upload, cloudinary, getPublicCloudinaryUrl };