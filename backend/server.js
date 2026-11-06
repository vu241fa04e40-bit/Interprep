import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import mysql from "mysql2/promise";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenAI } from "@google/genai";
import * as Diff from "diff";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Add this line to trust Render's proxy
const PORT = process.env.PORT || 5050;
const JWT_SECRET =
  process.env.JWT_SECRET || "interprep_super_secret_jwt_key_2026";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

// ==========================================
// 1. SECURITY HEADERS, CORS & PARSERS
// ==========================================
app.use(helmet());
app.use(
  cors({
    origin:['http://localhost:3000', 'https://interprep-mauve.vercel.app','https://interprep-ft56exya5-vu241fa04e40-bit.vercel.app',],
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

// Abuse Protection: General Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150,
  message: {
    error: "Too many requests from this IP. Please try again after 15 minutes.",
  },
});
app.use("/api/", globalLimiter);

// Strict Rate Limiter for Core LLM Generation
const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: {
    error:
      "Generation rate limit exceeded (40 requests / 15 mins). Please pause before retrying.",
  },
});

// Google Gen AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Database Pools
let mysqlPool;
let mongoDb;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function initDatabases() {
  try {
    const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 12512, // Forces it to use your Aiven port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
    console.log("✓ Successfully connected to MySQL");

    const mongoClient = new MongoClient(
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017",
    );
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGO_DB_NAME || "interprep_logs");
    console.log("✓ Successfully connected to MongoDB");
  } catch (err) {
    console.error("Database connection error:", err.message);
  }
}
initDatabases();

// ==========================================
// 2. AUTHENTICATION MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ error: "Access denied. No session token provided." });

  if (token === "guest_session") {
    req.user = { id: "guest", username: "Guest" };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ error: "Session expired or invalid." });
    req.user = user;
    next();
  });
};

// ==========================================
// 3. VALIDATION SCHEMAS (ZOD)
// ==========================================
const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const humanizeSchema = z.object({
  text: z
    .string()
    .trim()
    .min(15, "Input text must be at least 15 characters long.")
    .max(12000, "Text cannot exceed 12,000 characters."),
  mode: z.enum(["interview", "code_explainer", "general", "anti_plagiarism"]),
  tone: z.string().trim().max(100),
  customTone: z.string().trim().max(120).optional().nullable(),
  threadId: z.union([z.number(), z.string()]).optional().nullable(),
});

const detectSchema = z.object({
  text: z.string().trim().min(10),
});

// ==========================================
// 4. HEURISTIC & EVALUATION PURE FUNCTIONS
// ==========================================
const TECHNICAL_VOCABULARY = new Set([
  "python",
  "javascript",
  "react",
  "node",
  "node.js",
  "sql",
  "mysql",
  "mongodb",
  "aws",
  "docker",
  "kubernetes",
  "java",
  "c++",
  "git",
  "github",
  "api",
  "rest",
  "graphql",
  "html",
  "css",
  "star method",
  "agile",
  "scrum",
  "system design",
  "microservices",
  "polymorphism",
  "inheritance",
  "recursion",
  "concurrency",
  "ci/cd",
  "linux",
  "data structures",
  "algorithms",
  "sharding",
  "indexing",
]);

function extractEntities(text) {
  const tokens = text.toLowerCase().match(/\b[a-z0-9.%₹$#-]+\b/g) || [];
  const found = new Set();

  const metricRegex = /\b(\d+(\.\d+)?%?|\₹\d+|\$\d+)\b/g;
  const metrics = text.match(metricRegex) || [];
  metrics.forEach((m) => found.add(m.trim()));

  tokens.forEach((token) => {
    if (TECHNICAL_VOCABULARY.has(token)) found.add(token);
  });

  if (text.toLowerCase().includes("star method")) found.add("STAR method");
  if (text.toLowerCase().includes("system design")) found.add("System Design");

  return Array.from(found);
}

function verifyPreservedEntities(originalEntities, refinedText) {
  const refinedLower = refinedText.toLowerCase();
  return originalEntities.filter((entity) =>
    refinedLower.includes(entity.toLowerCase()),
  );
}

function calculateSemanticScore(
  original,
  refined,
  preservedCount,
  totalEntities,
) {
  const origWords = new Set(original.toLowerCase().match(/\b\w+\b/g) || []);
  const refWords = new Set(refined.toLowerCase().match(/\b\w+\b/g) || []);

  let intersection = 0;
  origWords.forEach((w) => {
    if (refWords.has(w)) intersection++;
  });
  const overlap = origWords.size === 0 ? 1 : intersection / origWords.size;

  if (totalEntities === 0) {
    return parseFloat(Math.min(99.0, 50.0 + overlap * 49.0).toFixed(1));
  } else {
    const entityScore = preservedCount / totalEntities;
    let finalScore;
    if (entityScore >= 0.8) {
      finalScore = 75.0 + entityScore * 5.0 + overlap * 19.0;
    } else {
      finalScore = 50.0 + entityScore * 30.0 + overlap * 19.0;
    }
    return parseFloat(Math.min(99.0, Math.max(50.0, finalScore)).toFixed(1));
  }
}

// Decimal-Safe Sentence Splitting Logic
function splitIntoSentences(text) {
  const protectedText = text
    .replace(/(\d+)\.(\d+)/g, "$1__DECIMAL__$2")
    .replace(/([A-Z])\.([A-Z])\./gi, "$1__ABBR__$2");

  const raw = protectedText.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [
    protectedText,
  ];

  return raw
    .map((s) =>
      s
        .replace(/__DECIMAL__/g, ".")
        .replace(/__ABBR__/g, ".")
        .trim(),
    )
    .filter(Boolean);
}

// Burstiness & Transition Marker Pattern Heuristic
function analyzeSentenceMapping(text) {
  const sentences = splitIntoSentences(text);
  const aiMarkers = [
    "furthermore",
    "moreover",
    "in conclusion",
    "additionally",
    "it is important to note",
    "delve",
    "testament",
    "vital",
    "pivotal",
    "seamlessly",
    "beacon",
    "underpins",
  ];

  let totalScore = 0;
  const sentenceList = sentences.map((s) => {
    const wordCount = s.split(/\s+/).length;
    const lower = s.toLowerCase();

    let markerHits = 0;
    aiMarkers.forEach((m) => {
      if (lower.includes(m)) markerHits++;
    });

    let score = 25;
    // Penalize uniform, monotonous sentence lengths
    if (wordCount >= 12 && wordCount <= 22) score += 35;
    // Reward bursty variety (short punchy clauses or long compound structures)
    else if (wordCount < 8 || wordCount > 25) score -= 15;

    score += markerHits * 25;

    const finalSentenceScore = Math.min(98, Math.max(5, score));
    totalScore += finalSentenceScore;

    let category = "low"; // Low AI probability / Human-like variance
    if (finalSentenceScore >= 65) category = "high";
    else if (finalSentenceScore >= 40) category = "medium";

    return { text: s, score: finalSentenceScore, category };
  });

  const ensembleScore =
    sentenceList.length > 0
      ? parseFloat((totalScore / sentenceList.length).toFixed(1))
      : 10.0;

  return { ensembleScore, sentenceList };
}

app.get('/api/test', (req, res) => {
    console.log("✅ HEALTH CHECK: The server is alive and logs are working!");
    res.status(200).json({ message: "Backend is connected!" });
});

// ==========================================
// 5. AUTHENTICATION & RECOVERY ROUTES
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    console.log("🚨 [DEBUG] Registration route was successfully triggered!");
    console.log("🚨 [DEBUG] Data received from frontend:", req.body);
  try {
    const { username, email, password } = registerSchema.parse(req.body);
    const [existing] = await mysqlPool.query(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email],
    );
    if (existing.length > 0)
      return res
        .status(409)
        .json({ error: "Username or email already registered." });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    await mysqlPool.query(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, passwordHash],
    );

    res.status(201).json({ message: "Registration complete. Please log in." });
  } catch (err) {
    console.error("🚨 DATABASE ERROR:", err);
    res.status(500).json({ message: "Database error occurred during registration" });
}
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const [users] = await mysqlPool.query(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [username, username],
    );
    if (users.length === 0)
      return res.status(401).json({ error: "Invalid credentials." });

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials." });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: "Login authentication failed." });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  // Fixed typo in math here (15 * 60000 = 15 minutes)
  const expires = new Date(Date.now() + 15 * 60000); 

  try {
    const [users] = await mysqlPool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    
    // Explicitly reject unregistered emails
    if (users.length === 0) {
      return res.status(404).json({
        error: "This email is not registered in our system."
      });
    }

    await mysqlPool.query(
      "UPDATE users SET reset_code = ?, reset_expires = ? WHERE email = ?",
      [code, expires, email]
    );
    
    await transporter.sendMail({
      from: `"Interprep Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Interprep Password Reset Code",
      html: `<h2>Verification Code: ${code}</h2><p>This code expires in 15 minutes.</p>`,
    });
    
    // Return success only if the email actually sent
    res.status(200).json({
      message: "Success"
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to process email dispatch." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const [users] = await mysqlPool.query(
      "SELECT * FROM users WHERE email = ? AND reset_code = ? AND reset_expires > NOW()",
      [email, code],
    );
    if (users.length === 0)
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code." });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    await mysqlPool.query(
      "UPDATE users SET password_hash = ?, reset_code = NULL, reset_expires = NULL WHERE email = ?",
      [passwordHash, email],
    );
    res.json({
      success: true,
      message: "Password updated successfully. Please log in.",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset password." });
  }
});

// ==========================================
// 6. REAL-TIME INPUT HEURISTIC ROUTE
// ==========================================
app.post("/api/detect-ai", authenticateToken, async (req, res) => {
  try {
    const { text } = detectSchema.parse(req.body);
    const analysis = analyzeSentenceMapping(text);
    res.json({
      aiScore: analysis.ensembleScore,
      sentences: analysis.sentenceList,
    });
  } catch (err) {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: "Input text too short for evaluation." });
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. CORE REFINEMENT & PERSONALIZATION ENGINE
// ==========================================
app.post(
  "/api/humanize",
  authenticateToken,
  generationLimiter,
  async (req, res) => {
    try {
      const validated = humanizeSchema.parse(req.body);
      const { text, tone, customTone, mode, threadId } = validated;

      // Check environment configurations
      if (!process.env.GEMINI_API_KEY)
        throw new Error(
          "GEMINI_API_KEY is missing from environment configurations.",
        );

      // Contextual Personalization Loop (Few-Shot Injection)
      let fewShotContext = "";
      if (mongoDb && req.user.id !== "guest") {
        const pastEdits = await mongoDb
          .collection("contextual_memory")
          .find({ userId: req.user.id })
          .sort({ timestamp: -1 })
          .limit(2)
          .toArray();
        if (pastEdits.length > 0) {
          fewShotContext =
            "\nUSER HISTORICAL STYLE PREFERENCES (MIMIC THIS NATURAL CONSTRUCT):\n" +
            pastEdits
              .map(
                (e) =>
                  `Original Input: ${e.original}\nPreferred Natural Style: ${e.edited}`,
              )
              .join("\n\n");
        }
      }

      const appliedTone = customTone || tone;
      let systemInstruction = "";

      if (mode === "interview") {
        systemInstruction = `You are "Interprep", an expert technical interview and communication coach. Translate the dense concept into a spoken, high-impact interview explanation using this tone: "${appliedTone}". Focus on natural delivery.${fewShotContext}`;
      } else if (mode === "code_explainer") {
        systemInstruction = `You are a Senior Principal Engineer and Technical Interviewer. Analyze the provided code. Provide a line-by-line workflow trace, state variable mutations, and evaluate Big-O time and space complexity. Tone: "${appliedTone}".${fewShotContext}`;
      } else if (mode === "general") {
        systemInstruction = `You are an expert executive editor and readability specialist. Refine the text to maximize clarity and precision. Target tone: "${appliedTone}". Maintain original semantic intent.${fewShotContext}`;
      } else {
        // Stylistic Variance & Natural Flow (Pattern Dissolution)
        systemInstruction = `You are a Stylistic Variance and Natural Flow Specialist. Rewrite the text to eliminate robotic patterns and monotonous rhythm:
      1. Maximize burstiness: dynamically vary sentence lengths, pairing short statements (3-6 words) with compound clauses.
      2. Dissolve repetitive transition markers (e.g., 'furthermore', 'moreover', 'in conclusion', 'pivotal').
      3. Use expressive, human vernacular tailored to this tone: "${appliedTone}".${fewShotContext}`;
      }

      // Exponential Backoff Retry Loop for 503 / 429 Demand Spikes
      // Model Waterfall: Dynamically jump to less congested servers if one is full
    const backupModels = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro'];
    let response;
    let successfulModel = null;

    for (const currentModel of backupModels) {
      try {
        console.log(`🚀 Attempting to connect to queue: ${currentModel}...`);
        
        response = await ai.models.generateContent({
          model: currentModel,
          contents: `${systemInstruction}\n\nInput Content:\n${text}`
        });
        
        successfulModel = currentModel;
        break; // Request succeeded, exit the waterfall loop immediately
        
      } catch (apiErr) {
        const isOverloaded = apiErr.status === 503 || apiErr.status === 429 || (apiErr.message && apiErr.message.includes('503'));
        
        if (isOverloaded) {
          console.warn(`⚠️ Queue ${currentModel} is full. Jumping to backup model...`);
          
          // If this was the last model in the list and it still failed, send error to frontend
          if (currentModel === backupModels[backupModels.length - 1]) {
            console.error("❌ All Google server queues are at maximum capacity.");
            return res.status(503).json({ error: 'Google AI servers are completely overloaded. Please try again in a few minutes.' });
          }
          
          // Pause for just 2 seconds before hitting the next cluster
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // If the error is a strict crash (like a 400 Bad Request), stop immediately
          console.error("Fatal API Error:", apiErr);
          return res.status(500).json({ error: `API Error: ${apiErr.message}` });
        }
      }
    }

    if (!response || !response.text) {
      return res.status(500).json({ error: 'Blocked by API safety filters.' });
    }
    
    console.log(`✓ Successfully processed using ${successfulModel}`);
    const refinedText = response.text.trim();

      // Fast Non-Blocking Thread Provisioning
      let activeThreadId = threadId;
      let threadTitle = "New Conversation";

      if (!activeThreadId && req.user.id !== "guest") {
        // Extractive immediate title avoids synchronous second API call latency
        const words = text.trim().split(/\s+/).slice(0, 5).join(" ");
        const prefix =
          mode === "code_explainer"
            ? "[Code]"
            : mode === "interview"
              ? "[Interview]"
              : "[General]";
        threadTitle = `${prefix} ${words}...`;

        const [threadResult] = await mysqlPool.query(
          "INSERT INTO threads (user_id, title) VALUES (?, ?)",
          [req.user.id, threadTitle],
        );
        activeThreadId = threadResult.insertId;

        // Asynchronous Background Refinement of Title (Zero User Latency)
        /*(async () => {
          try {
            const bgTitle = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: `Generate a 3-5 word categorized summary title (e.g. [Technical] Hash Map Lookups) for this text. No quotes.\n\n${text.substring(0, 500)}`,
            });
            if (bgTitle && bgTitle.text) {
              await mysqlPool.query(
                "UPDATE threads SET title = ? WHERE id = ?",
                [bgTitle.text.trim(), activeThreadId],
              );
            }
          } catch {
            // Silent fallback preserves initial extractive title
          }
        })();/*/
      }

      // Custom Analytical Evaluation Heuristics
      const extractedEntities = extractEntities(text);
      const preserved = verifyPreservedEntities(extractedEntities, refinedText);
      let similarityScore = 0;

      if (mode === "code_explainer") {
        const entityScore =
          extractedEntities.length > 0
            ? preserved.length / extractedEntities.length
            : 1.0;
        similarityScore = parseFloat(
          Math.min(99.0, Math.max(50.0, 75.0 + entityScore * 24.0)).toFixed(1),
        );
      } else {
        similarityScore = calculateSemanticScore(
          text,
          refinedText,
          preserved.length,
          extractedEntities.length,
        );
      }

      // Persist Conversion History
      if (req.user.id !== "guest") {
        await mysqlPool.query(
          `INSERT INTO conversions 
        (user_id, thread_id, original_text, refined_text, mode, tone, custom_tone, similarity_score, passed_threshold) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            activeThreadId,
            text,
            refinedText,
            mode,
            tone,
            customTone,
            similarityScore,
            similarityScore >= 80,
          ],
        );
      }

      const diffAnalysis = Diff.diffWords(text, refinedText);
      const detectionAnalysis = analyzeSentenceMapping(refinedText);

      res.json({
        refinedText,
        similarityScore,
        threadId: activeThreadId,
        threadTitle,
        diff: diffAnalysis,
        aiScore: detectionAnalysis.ensembleScore,
        sentences: detectionAnalysis.sentenceList,
      });
    } catch (err) {
      console.error("Core Pipeline Error:", err);
      if (err instanceof z.ZodError)
        return res.status(400).json({ error: err.errors[0].message });
      res
        .status(502)
        .json({ error: `Backend Processing Error: ${err.message}` });
    }
  },
);

// ==========================================
// 8. CONVERSATION THREAD & FEEDBACK MANAGEMENT
// ==========================================
app.get("/api/history", authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT c.*, t.title as threadTitle 
      FROM conversions c
      LEFT JOIN threads t ON c.thread_id = t.id
      WHERE c.user_id = ? 
      ORDER BY c.created_at DESC LIMIT 50
    `;
    const [rows] = await mysqlPool.query(query, [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve conversation history." });
  }
});

app.delete("/api/threads/:id", authenticateToken, async (req, res) => {
  try {
    await mysqlPool.query(
      "DELETE FROM conversions WHERE thread_id = ? AND user_id = ?",
      [req.params.id, req.user.id],
    );
    await mysqlPool.query("DELETE FROM threads WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete active thread." });
  }
});

app.put("/api/threads/:id/rename", authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim())
      return res.status(400).json({ error: "Title cannot be empty." });
    await mysqlPool.query(
      "UPDATE threads SET title = ? WHERE id = ? AND user_id = ?",
      [title.trim(), req.params.id, req.user.id],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update thread title." });
  }
});

app.delete("/api/history/:id", authenticateToken, async (req, res) => {
  try {
    await mysqlPool.query(
      "DELETE FROM conversions WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove conversion item." });
  }
});

app.post("/api/feedback/edit", authenticateToken, async (req, res) => {
  const { originalText, editedText } = req.body;
  if (req.user.id === "guest")
    return res
      .status(403)
      .json({ error: "Guests cannot save training context." });

  try {
    if (!mongoDb) throw new Error("Contextual memory database offline.");
    await mongoDb.collection("contextual_memory").insertOne({
      userId: req.user.id,
      original: originalText,
      edited: editedText,
      timestamp: new Date(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`✓ Interprep Production Gateway running on port ${PORT}`),
);
