// index.js
const { google } = require("googleapis");
const express = require("express");
const app = express();

app.use(express.json());

// --- Debug route to test server ---
app.get("/ping", (req, res) => {
  console.log("PING HIT");
  res.json({ ok: true });
});

// --- Load credentials from environment ---
const client_email = process.env.GOOGLE_CLIENT_EMAIL;
let private_key = process.env.GOOGLE_PRIVATE_KEY;

// Fix newline formatting for Render
if (private_key) {
  private_key = private_key.replace(/\\n/g, "\n");
}

if (!client_email || !private_key) {
  console.error("❌ Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.");
}

// --- Create JWT auth client ---
const auth = new google.auth.JWT({
  email: client_email,
  key: private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Helper: get Sheets client
function getSheets() {
  return google.sheets({ version: "v4", auth });
}

// ─────────────────────────────────────────────────────────────
//  Regular HTTP route you already use from Postman
// ─────────────────────────────────────────────────────────────
app.post("/append", async (req, res) => {
  console.log("⬅️ /append HIT");

  try {
    const { spreadsheetId, values } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({ error: "Missing spreadsheetId" });
    }
    if (!values || !Array.isArray(values)) {
      return res.status(400).json({ error: "Missing or invalid values" });
    }

    console.log("📝 Spreadsheet ID:", spreadsheetId);
    console.log("📦 Values:", values);

    const sheets = getSheets();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    console.log("✅ /append success");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ ERROR in /append:", err);
    res.status(500).json({
      error: err.message,
      details: err.errors || null,
    });
  }
});

// ─────────────────────────────────────────────────────────────
//  NEW: Minimal MCP server over HTTP on /mcp
//      - supports initialize
//      - tools/list
//      - tools/call for one tool: append_to_sheet
// ─────────────────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  console.log("⬅️ /mcp HIT:", method, "id:", id);

  if (jsonrpc !== "2.0") {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid request (jsonrpc must be '2.0')" },
    });
  }

  try {
    // 1) Handshake
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "spreadsheet-writer-mcp",
            version: "1.0.0",
          },
        },
      });
    }

    // 2) List tools
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "append_to_sheet",
              description: "Append one or more rows to a Google Sheet.",
              inputSchema: {
                type: "object",
                properties: {
                  spreadsheetId: {
                    type: "string",
                    description: "The Google Sheets ID (from the URL).",
                  },
                  values: {
                    type: "array",
                    description:
                      "Array of rows – each row is an array of cell strings.",
                    items: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                required: ["spreadsheetId", "values"],
              },
            },
          ],
        },
      });
    }

    // 3) Call tool
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName !== "append_to_sheet") {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
          },
        });
      }

      const { spreadsheetId, values } = args;

      if (!spreadsheetId || !Array.isArray(values)) {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "append_to_sheet requires spreadsheetId and values[]",
          },
        });
      }

      console.log("🛠 append_to_sheet via MCP", { spreadsheetId, values });

      const sheets = getSheets();
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A1",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Appended ${values.length} row(s) to sheet ${spreadsheetId}`,
            },
          ],
          isError: false,
        },
      });
    }

    // 4) Unknown method
    return res.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Unknown method: ${method}`,
      },
    });
  } catch (err) {
    console.error("❌ MCP error:", err);
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Error calling tool: ${err.message}`,
          },
        ],
        isError: true,
      },
    });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 API & MCP server ready on port", PORT));
