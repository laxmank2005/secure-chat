import { User } from "../models/userModel.js";
import { Conversation } from "../models/conversationModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOTPEmail } from "../config/emailService.js";
import { v2 as cloudinary } from "cloudinary";
import stream from "stream";
// register testing done
export const register = async (req, res) => {
  try {
    const { fullName, email, mobile, password, confirmPassword, gender, publicKey, encryptedPrivateKey, keySalt, keyIv } = req.body;

    if (!fullName || !email || !mobile || !password || !confirmPassword || !gender) {
      return res.status(400).json({ message: "All base fields are required" });
    }

    const nameRegex = /^[A-Za-z\s]{3,50}$/;
    if (!nameRegex.test(fullName.trim())) {
      return res.status(400).json({ message: "Full name must be 3-50 characters and contain only letters." });
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits and contain only numbers." });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Password and confirm password should be same" });
    }

    // ⚡ Run bcrypt hash and DB duplicate check IN PARALLEL (saves ~300ms)
    const [hashedPassword, existingUser] = await Promise.all([
      bcrypt.hash(password, 10),
      User.findOne({ $or: [{ email }, { mobile }] })
    ]);

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Email or mobile number already exists, try different" });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins expiry

    // Profile photo
    const profilePhoto = `https://api.dicebear.com/7.x/adventurer/svg?seed=${email}`;

    // Create user FIRST (fast), then send email in background
    await User.create({
      fullName,
      email,
      mobile,
      password: hashedPassword,
      profilePhoto,
      gender,
      isEmailVerified: false,
      otp,
      otpExpiry,
      publicKey,
      encryptedPrivateKey,
      keySalt,
      keyIv
    });

    // ⚡ FIRE-AND-FORGET: Send email in background, respond immediately
    sendOTPEmail(email, otp, fullName).catch((emailErr) => {
      console.warn("⚠️ Background OTP email failed:", emailErr.message);
    });

    return res.status(201).json({
      success: true,
      autoVerified: false,
      message: "OTP sent to your email. Please verify to complete registration.",
      email,
    });
  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({
      message: error.message || "Internal Server Error",
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

// Verify OTP controller
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified. You can log in directly." });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({ message: "No active OTP found. Please request a new one." });
    }

    if (new Date() > new Date(user.otpExpiry)) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (user.otp.trim() !== otp.toString().trim()) {
      return res.status(400).json({ message: "Invalid OTP. Please check and try again." });
    }

    user.isEmailVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully! You can now log in.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Resend OTP controller
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    try {
      await sendOTPEmail(email, otp, user.fullName);
    } catch (emailErr) {
      console.error("Failed to resend OTP email:", emailErr.message);
      return res.status(500).json({
        message: "Failed to send verification email. Please try again later."
      });
    }

    return res.status(200).json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Login controller
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const trimmedEmail = email.trim();
    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      return res.status(400).json({
        message: "Invalid email or password",
        success: false,
      });
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        message: "Invalid email or password",
        success: false,
      });
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({
        message: "Please verify your email before logging in.",
        success: false,
        notVerified: true,
        email: user.email,
      });
    }

    const tokenData = {
      userId: user._id,
    };

    const token = await jwt.sign(tokenData, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    return res
      .status(200)
      .cookie("token", token, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "none",
        secure: process.env.NODE_ENV === "production",
      })
      .json({
        success: true,
        message: "Login successful",
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        profilePhoto: user.profilePhoto,
        publicKey: user.publicKey,
        encryptedPrivateKey: user.encryptedPrivateKey,
        keySalt: user.keySalt,
        keyIv: user.keyIv,
        token: token,
      });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Logout controller

export const logout = (req, res) => {
  try {
    res.clearCookie("token");
    return res
      .status(200)
      .cookie("token", "", { maxAge: 0, httpOnly: true, sameSite: "none", secure: process.env.NODE_ENV === "production" })
      .json({ message: "Logout successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getConversationUsers = async (req, res) => {
  try {
    const loggedInUserId = req.id;

    // Find all conversations where the logged-in user is a participant
    const conversations = await Conversation.find({
      participants: loggedInUserId
    })
      .select("participants updatedAt isGroup groupName groupProfilePhoto encryptedGroupKeys groupAdmins")
      .sort({ updatedAt: -1 })
      .lean();

    const otherUserIds = [];
    const seen = new Set();
    const groupConversations = [];

    for (const conv of conversations) {
      for (const pid of conv.participants) {
        const pidStr = pid.toString();
        if (!seen.has(pidStr)) {
          seen.add(pidStr);
          otherUserIds.push(pid);
        }
      }
      if (conv.isGroup) {
        groupConversations.push(conv);
      }
    }

    // Fetch the actual user documents for 1-on-1 chats
    let users = [];
    if (otherUserIds.length > 0) {
      users = await User.find({ _id: { $in: otherUserIds } })
        .select("fullName mobile profilePhoto gender publicKey isEmailVerified")
        .lean();
    }

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const orderedItems = [];

    // Import Messages model if not already imported at top
    const { Messages } = await import("../models/messageModel.js");

    for (const conv of conversations) {
      if (conv.isGroup) {
        // Format group to look like a "User" for the frontend OtherUser component
        const unreadCount = await Messages.countDocuments({
          receiverId: conv._id, // For groups, receiverId is the groupId
          senderId: { $ne: loggedInUserId },
          readBy: { $ne: loggedInUserId } // The current user has not read this message
        });

        const lastMessageDoc = await Messages.findOne({
          receiverId: conv._id
        }).sort({ createdAt: -1 });

        const groupItem = {
          _id: conv._id,
          isGroup: true,
          fullName: conv.groupName,
          profilePhoto: conv.groupProfilePhoto || "",
          participants: conv.participants.map(pid => userMap.get(pid.toString()) || { _id: pid }),
          encryptedGroupKeys: conv.encryptedGroupKeys,
          unreadCount: unreadCount,
          hasUnread: unreadCount > 0,
          creatorId: conv.groupAdmins[0],
          encryptorPublicKey: null
        };

        const myKeyObj = conv.encryptedGroupKeys.find(k => k.userId.toString() === loggedInUserId);
        const encryptorId = myKeyObj?.encryptedBy || conv.groupAdmins[0];

        // Fetch the encryptor's public key so the member can decrypt their group key
        if (encryptorId) {
          const encryptorIdStr = encryptorId.toString();
          let encryptorUser = userMap.get(encryptorIdStr);
          if (!encryptorUser) {
            encryptorUser = await User.findById(encryptorIdStr).select("publicKey").lean();
            if (encryptorUser) {
              userMap.set(encryptorIdStr, encryptorUser);
            }
          }
          if (encryptorUser && encryptorUser.publicKey) {
            groupItem.encryptorPublicKey = encryptorUser.publicKey;
          }
        }

        if (lastMessageDoc) {
          if (lastMessageDoc.messageType === "call") {
            groupItem.lastMessage = "Video call";
          } else if (lastMessageDoc.isEncrypted) {
            groupItem.lastMessage = "Encrypted message";
          } else {
            groupItem.lastMessage = lastMessageDoc.message;
          }
          groupItem.lastMessageTime = lastMessageDoc.createdAt;
        }

        orderedItems.push(groupItem);
      } else {
        // 1-on-1 Chat logic
        const otherParticipantId = conv.participants.find(id => id.toString() !== loggedInUserId);
        if (!otherParticipantId) continue;

        const user = userMap.get(otherParticipantId.toString());
        if (user && !seen.has(`added_${user._id}`)) {
          seen.add(`added_${user._id}`); // Prevent duplicates

          const unreadCount = await Messages.countDocuments({
            senderId: user._id,
            receiverId: loggedInUserId,
            status: { $in: ["sent", "delivered"] }
          });

          user.unreadCount = unreadCount;
          user.hasUnread = unreadCount > 0;

          const lastMessageDoc = await Messages.findOne({
            $or: [
              { senderId: user._id, receiverId: loggedInUserId },
              { senderId: loggedInUserId, receiverId: user._id }
            ]
          }).sort({ createdAt: -1 });

          if (lastMessageDoc) {
            if (lastMessageDoc.messageType === "call") {
              user.lastMessage = "Video call";
            } else if (lastMessageDoc.isEncrypted) {
              user.lastMessage = "Encrypted message";
            } else {
              user.lastMessage = lastMessageDoc.message;
            }
            user.lastMessageTime = lastMessageDoc.createdAt;
          }

          orderedItems.push(user);
        }
      }
    }

    return res.status(200).json({
      success: true,
      users: orderedItems, // Frontend expects 'users' array, but it now contains groups too!
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const loggedInUserId = req.id;
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters.",
        users: [],
      });
    }

    const trimmedQuery = query.trim();
    
    // SECURITY: Escape regex characters to prevent ReDoS attacks
    const escapedQuery = trimmedQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    // Search by mobile (suffix match so country code isn't strictly required) OR partial email match
    const users = await User.find({
      _id: { $ne: loggedInUserId },
      isEmailVerified: true,
      $or: [
        { mobile: { $regex: escapedQuery + "$", $options: "i" } },
        { fullName: { $regex: escapedQuery, $options: "i" } },
      ],
    })
      .select("fullName mobile profilePhoto gender publicKey")
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const updateProfilePic = async (req, res) => {
  try {
    const userId = req.id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image provided" });
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "chat_profile_pics",
        transformation: [{ width: 250, height: 250, crop: "fill" }]
      },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json({ success: false, message: "Image upload failed" });
        }

        const user = await User.findByIdAndUpdate(userId, { profilePhoto: result.secure_url }, { new: true }).select("-password");

        return res.status(200).json({
          success: true,
          message: "Profile picture updated successfully",
          user
        });
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);
    bufferStream.pipe(uploadStream);

  } catch (error) {
    console.error("Profile pic update error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
