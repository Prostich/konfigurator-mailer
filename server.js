// server.js
import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();

// ---- Max. Upload-Größe (10 MB pro Datei) ----
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

// ---- CORS: Allowlist aus ENV lesen ----
// Beispiel ENV: CORS_ORIGIN=https://www.prostich.store,https://prostich.store,https://www-prostich-store.filesusr.com,https://editor.wix.com
const rawOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Wichtig: NICHT mehrere Werte in den Header schreiben!
// Wir spiegeln stattdessen nur den jeweils anfragenden Origin zurück.
const corsOptions = {
  origin: (origin, cb) => {
    // Tools wie curl/Postman senden oft keinen Origin -> erlauben
    if (!origin) return cb(null, true);
    if (rawOrigins.includes("*") || rawOrigins.includes(origin)) {
      return cb(null, true); // cors spiegelt den Origin korrekt zurück
    }
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
};

app.use(cors(corsOptions));
// Preflight explizit erlauben
app.options("*", cors(corsOptions));

// Health
app.get("/", (_, res) => res.json({ ok: true }));
app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/healthz", (_, res) => res.json({ ok: true }));

// Upload-Endpunkt
app.post(
  "/send",
  upload.fields([
    { name: "screenshot_front", maxCount: 1 },
    { name: "screenshot_back",  maxCount: 1 },
    { name: "design_front",     maxCount: 1 },
    { name: "design_back",      maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // TODO: hier SendGrid-Logik einfügen (Anhänge aus req.files, Felder aus req.body)
      res.json({ ok: true, received: Object.keys(req.files || {}) });
    } catch (err) {
      console.error("Send error:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  }
);

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server läuft auf", port));
