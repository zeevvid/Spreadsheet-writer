const { google } = require("googleapis");
const express = require("express");
const app = express();

// Parse JSON body
app.use(express.json());

// 🔐 Load credentials from ENV instead of service-account.json
const serviceAccount = {
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  // Render stores env vars as a single line string – convert \n to real newlines
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

app.post("/append", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    const { spreadsheetId, values } = req.body;

    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ⚠️ MUST use process.env.PORT on Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("API ready on port", PORT));
