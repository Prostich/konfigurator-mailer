import express from "express";
import cors from "cors";
import multer from "multer";
import sgMail from "@sendgrid/mail";

const {
  SENDGRID_API_KEY,
  EMAIL_TO,                     // Zieladresse (dein Postfach)
  EMAIL_FROM = "no-reply@example.com", // muss in SendGrid verifiziert sein
  CORS_ORIGIN = "*"             // später auf deine Wix-Domain setzen
} = process.env;

if (!SENDGRID_API_KEY || !EMAIL_TO) {
  console.error("Env fehlt: SENDGRID_API_KEY oder EMAIL_TO");
  process.exit(1);
}
sgMail.setApiKey(SENDGRID_API_KEY);

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// bis 10 MB pro Datei
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const filesMw = upload.fields([
  { name: "design_front", maxCount: 1 },
  { name: "design_back", maxCount: 1 },
  { name: "screenshot_front", maxCount: 1 },
  { name: "screenshot_back", maxCount: 1 }
]);

app.get("/", (_, res) => res.send("OK"));
app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/send", filesMw, async (req, res) => {
  try {
    const form = req.body;

    const atts = [];
    const add = (f, fallback) => {
      if (!f) return;
      atts.push({
        content: f.buffer.toString("base64"),
        type: f.mimetype || "application/octet-stream",
        filename: f.originalname || fallback,
        disposition: "attachment"
      });
    };

    add(req.files?.design_front?.[0], "design-front");
    add(req.files?.design_back?.[0], "design-back");
    add(req.files?.screenshot_front?.[0], "preview-front.jpg");
    add(req.files?.screenshot_back?.[0], "preview-back.jpg");

    // einfache Gesamtgrößenbremse (~25 MB)
    const total = atts.reduce((n, a) => n + Buffer.byteLength(a.content, "base64"), 0);
    if (total > 25 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: "Gesamtgröße > 25MB" });
    }

    const subject = `Neue Konfigurator-Anfrage: ${form?.Produktart || ""} ${form?.Farbe || ""}`.trim();
    const html = `
      <h2>Neue Anfrage</h2>
      <p><b>Kunde:</b> ${form?.Vorname || ""} ${form?.Nachname || ""}</p>
      <p><b>Kontakt:</b> ${form?.Email || ""} · ${form?.Telefon || ""}</p>
      <p><b>Adresse:</b> ${form?.Strasse || ""}, ${form?.PLZ_Ort || ""}</p>
      <p><b>Produkt:</b> ${form?.Produktart || ""} · <b>Farbe:</b> ${form?.Farbe || ""}</p>
      <p>Anhänge: Designs & Previews sind beigefügt.</p>
    `;

    await sgMail.send({
      to: EMAIL_TO,
      from: EMAIL_FROM,
      subject,
      html,
      attachments: atts
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server läuft auf ${port}`));
