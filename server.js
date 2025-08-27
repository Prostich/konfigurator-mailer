// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";

// ---------- App & Upload-Limits ----------
const app = express();

// Speicher im RAM, damit wir an die Buffer kommen (für SendGrid Base64)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// ---------- CORS Allowlist ----------
const rawOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // origin kann bei Tools (curl/Postman) undefined sein -> erlauben
    if (!origin) return cb(null, true);
    if (rawOrigins.includes("*") || rawOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Preflight explizit erlauben
app.options("/send", cors(corsOptions));

// ---------- Health ----------
app.get("/", (_, res) => res.json({ ok: true }));
app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/healthz", (_, res) => res.json({ ok: true }));

// ---------- Helper: SendGrid Mail ----------
async function sendEmailWithSendGrid({ fields, files }) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const EMAIL_FROM       = process.env.EMAIL_FROM;
  const EMAIL_TO         = process.env.EMAIL_TO;

  if (!SENDGRID_API_KEY || !EMAIL_FROM || !EMAIL_TO) {
    throw new Error("Missing SENDGRID_API_KEY or EMAIL_FROM or EMAIL_TO env vars.");
  }

  // Anhänge aus Multer-Dateien vorbereiten
  const attachments = [];
  const addFile = (file, fallbackName) => {
    if (!file) return;
    attachments.push({
      content: file.buffer.toString("base64"),
      filename: file.originalname || fallbackName,
      type: file.mimetype || "application/octet-stream",
      disposition: "attachment"
    });
  };

  addFile(files.screenshot_front?.[0], "preview-front.jpg");
  addFile(files.screenshot_back?.[0],  "preview-back.jpg");
  addFile(files.design_front?.[0],     "design-front");
  addFile(files.design_back?.[0],      "design-back");

  // E-Mail-Body aus Formularfeldern
  const safe = s => (s ?? "").toString();
  const html = `
    <h1>Neue Konfiguration</h1>
    <h3>Kundendaten</h3>
    <p><strong>Name:</strong> ${safe(fields.Vorname)} ${safe(fields.Nachname)}</p>
    <p><strong>Email:</strong> ${safe(fields.Email)}</p>
    <p><strong>Telefon:</strong> ${safe(fields.Telefon)}</p>
    <p><strong>Adresse:</strong> ${safe(fields.Strasse)}, ${safe(fields.PLZ_Ort)}</p>
    <hr/>
    <h3>Details</h3>
    <p><strong>Textilqualität:</strong> ${safe(fields["Textilqualität"])}</p>
    <p><strong>Verwendung:</strong> ${safe(fields.Verwendung)}</p>
    <p><strong>Drucktechnik:</strong> ${safe(fields.Drucktechnik)}</p>
    <p><strong>Wunschlieferdatum:</strong> ${safe(fields.Wunschlieferdatum)}</p>
    <p><strong>Nachricht:</strong><br/>${(safe(fields.Nachricht) || "—").replace(/\n/g,"<br/>")}</p>
    <p>Siehe Anhänge für Vorschau/Designs.</p>
  `;

  const emailData = {
    personalizations: [{ to: [{ email: EMAIL_TO }] }],
    from: { email: EMAIL_FROM, name: "Prostich Konfigurator" },
    subject: `Neue Konfiguration von ${safe(fields.Vorname)} ${safe(fields.Nachname)}`.trim(),
    content: [{ type: "text/html", value: html }],
    attachments
  };

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(emailData)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`SendGrid error: ${txt}`);
  }
}

// ---------- /send: FormData entgegennehmen ----------
app.post(
  "/send",
  upload.fields([
    { name: "screenshot_front", maxCount: 1 },
    { name: "screenshot_back",  maxCount: 1 },
    { name: "design_front",     maxCount: 1 },
    { name: "design_back",      maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      // Textfelder: req.body, Dateien: req.files
      await sendEmailWithSendGrid({ fields: req.body || {}, files: req.files || {} });
      return res.json({ ok: true });
    } catch (err) {
      console.error("Send error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  }
);

// ---------- Start ----------
const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server läuft auf", port));
