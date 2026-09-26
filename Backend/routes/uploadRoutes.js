import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import isauthenticated from "../middleware/isAuthenticated.js";
import stream from "stream";

const router = express.Router();

// Cloudinary will pick up process.env automatically if configured correctly, 
// but since dotenv is loaded AFTER imports in index.js, we configure it inside the route.

// Use memory storage so we don't save to the ephemeral disk in production
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// We only accept one file at a time under the field name "file"
router.post("/", isauthenticated, upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        // Configure here so process.env is loaded
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        // We MUST upload as resource_type: "raw" because the file is an encrypted binary blob, 
        // not a valid image format (Cloudinary would fail to process it otherwise).
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: "raw",
                folder: "chat_encrypted_attachments"
            },
            (error, result) => {
                if (error) {
                    console.error("Cloudinary upload error:", error);
                    return res.status(500).json({ success: false, message: "Cloudinary upload failed" });
                }

                // Return the Cloudinary secure URL
                return res.status(200).json({
                    success: true,
                    fileUrl: result.secure_url,
                    fileName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    size: req.file.size
                });
            }
        );

        // Pipe the buffer to Cloudinary
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);
        bufferStream.pipe(uploadStream);

    } catch (error) {
        console.error("Upload error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

export default router;
