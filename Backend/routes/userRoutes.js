import express from "express";
import { register, login, logout, getConversationUsers, searchUsers, verifyOTP, resendOTP, updateProfilePic } from "../controllers/userController.js";
import isauthenticated from "../middleware/isAuthenticated.js";
import multer from "multer";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for profile pics
});

router.route("/register").post(register);
router.route("/verify-otp").post(verifyOTP);
router.route("/resend-otp").post(resendOTP);
router.route("/login").post(login);
router.route("/logout").get(logout);
router.route("/search").get(isauthenticated, searchUsers);
router.route("/profile-pic").put(isauthenticated, upload.single("profilePic"), updateProfilePic);
router.route("/").get(isauthenticated, getConversationUsers);

export default router;