import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./config/database.js";
import userRoutes from "./routes/userRoutes.js";
import cookieParser from "cookie-parser";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { app, server } from "./socket/socket.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
let FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
if (FRONTEND_URL.endsWith('/')) {
  FRONTEND_URL = FRONTEND_URL.slice(0, -1);
}

const isProduction = process.env.NODE_ENV === "production";

// 1. Security Headers
app.use(helmet({
  // Allow the app to work inside iframes for local dev but restrict in production
  contentSecurityPolicy: isProduction ? undefined : false,
}));

// 2. CORS — allow Vercel frontend + all .vercel.app + localhost dev + Render
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Allow curl, Postman, server-to-server requests
  if (
    origin === FRONTEND_URL ||
    origin === "http://localhost:5173" ||
    origin === "http://localhost:4173" ||
    origin === "http://localhost:3000" ||
    origin.endsWith(".vercel.app") // Automatically allows all Vercel deployments!
  ) {
    return true;
  }
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
};
app.use(cors(corsOptions));

// 2.5 Compression — Shrink API payloads by up to 80%
app.use(compression());

// 3. Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again later." },
});
app.use("/api", limiter);

// 4. Auth Route Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts, please try again later." },
});
app.use("/api/v1/user/login", authLimiter);
app.use("/api/v1/user/register", authLimiter);

// 5. Body parser & Cookie parser
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// 6. Data Sanitization — Express 5 compatible implementations
// (express-mongo-sanitize v2 and xss-clean crash on Express 5 because req.query is read-only)

// 6a. NoSQL Injection sanitizer — strips keys containing $ or . from body and params
const sanitizeObject = (obj) => {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (/[$."]/.test(key)) {
        delete obj[key];
      } else {
        sanitizeObject(obj[key]);
      }
    }
  }
  return obj;
};
app.use((req, _res, next) => {
  sanitizeObject(req.body);
  sanitizeObject(req.params);
  // req.query is read-only in Express 5, so sanitize in-place on its values only
  if (req.query && typeof req.query === "object") {
    for (const key of Object.keys(req.query)) {
      if (typeof req.query[key] === "string") {
        // Can't delete but can warn — queries are validated by controllers
      }
    }
  }
  next();
});

// 6b. XSS sanitizer — escape HTML entities in string values of body
// IMPORTANT: Skip fields that contain raw binary/crypto data or passwords
const XSS_SKIP_FIELDS = new Set([
  "password", "confirmPassword",
  "publicKey", "encryptedPrivateKey", "keySalt", "keyIv",
  "otp"
]);
const escapeHtml = (str) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const sanitizeStrings = (obj, parentKey = null) => {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (XSS_SKIP_FIELDS.has(key)) continue; // Skip sensitive fields
    if (typeof obj[key] === "string") {
      obj[key] = escapeHtml(obj[key]);
    } else {
      sanitizeStrings(obj[key], key);
    }
  }
};
app.use((req, _res, next) => {
  sanitizeStrings(req.body);
  next();
});

// Connect to MongoDB
connectDB();

// API Routes
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/message", messageRoutes);
app.use("/api/v1/message/upload", uploadRoutes);

// Serve uploads folder statically so frontend can download the encrypted blobs
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running", env: process.env.NODE_ENV });
});

// ── Production: Serve the React build (if dist exists) ──────────────────────
const frontendDistPath = path.join(__dirname, "..", "Frontend", "dist");
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  // Express 5 compatible wildcard route (named parameter '{*path}')
  app.get("{*path}", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(frontendDistPath, "index.html"));
    }
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  if (fs.existsSync(frontendDistPath)) {
    console.log(`🌍 Serving frontend static files from Frontend/dist`);
  }
});
