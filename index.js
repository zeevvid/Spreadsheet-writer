const { google } = require("googleapis");
const express = require("express");
const app = express();

// 👈 MUST come before the route
app.use(express.json());

const auth = new google.auth.GoogleAuth({
  credentials: require("./service-account.json"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

app.post("/append", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body); // 👈 debug

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

app.listen(3000, () => console.log("API ready on port 3000"));
