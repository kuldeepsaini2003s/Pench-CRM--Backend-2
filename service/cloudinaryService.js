const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

function uploadBufferToCloudinary(buffer, fileName) {
  return new Promise((resolve, reject) => {
    let stream = cloudinary.uploader.upload_stream(
      {
        folder: "invoices",
        resource_type: "raw",
        public_id: fileName,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = { uploadBufferToCloudinary };
