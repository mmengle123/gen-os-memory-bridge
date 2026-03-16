import express from "express";
import { google } from "googleapis";

const app = express();
app.use(express.json({ limit: "5mb" }));

/* ---------------------------
CONFIG
--------------------------- */

const PORT = process.env.PORT || 3000;

const MEMORY_FILES = {
  core_continuity: "1uVuKRShtfPggZY6kUsBdbHQFV-LGcMn3YNIVqP9Xr-Q",
  interaction_learning: "1X5OCYdGv6_SesSi2TV-9jkuiR8k2dnkwHvhStJ2Ysug",
  emotional_snapshot: "16sqeAH6wtCFbxCuVyBSbml--wiM0JLDwx4VSUSSh8Y8",
  session_reflections: "19tO7KNlE6okqaVFSdS2bNpcbiSO82LKQSZs-_L34bUA"
  cognitive_tuning: "1kQOUwunjXBN4nCy1fJWCm-O6a8Zpzjjg1mzWCrs71vQ"
};

/* ---------------------------
GOOGLE AUTH
--------------------------- */

const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  : undefined;

// Railway/env vars often store literal \n, so normalize them
if (serviceAccount?.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  keyFile: serviceAccount ? undefined : "service-account.json",
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents"
  ]
});

const drive = google.drive({
  version: "v3",
  auth
});

/* ---------------------------
DEBUG / HEALTH
--------------------------- */

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Gen Memory Bridge running",
    version: "clean-full-build-1",
    debugRouteExpected: true
  });
});

app.get("/debug_drive", (req, res) => {
  res.json({
    driveDefined: typeof drive !== "undefined",
    hasServiceAccount: !!serviceAccount,
    hasPrivateKey: !!serviceAccount?.private_key,
    hasClientEmail: !!serviceAccount?.client_email
  });
});

/* ---------------------------
HELPERS
--------------------------- */

function getFileId(fileKey) {
  const fileId = MEMORY_FILES[fileKey];
  if (!fileId) {
    throw new Error(`Invalid file_key: ${fileKey}`);
  }
  return fileId;
}

async function exportDocText(fileKey) {
  const fileId = getFileId(fileKey);

  const response = await drive.files.export(
    {
      fileId,
      mimeType: "text/plain"
    },
    { responseType: "text" }
  );

  return typeof response.data === "string"
    ? response.data
    : String(response.data || "");
}

async function replaceDocText(fileKey, content) {
  const fileId = getFileId(fileKey);

  await drive.files.update({
    fileId,
    media: {
      mimeType: "text/plain",
      body: content
    }
  });
}

async function appendDocText(fileKey, content) {
  const existing = await exportDocText(fileKey);

  const updated = existing.trim()
    ? `${existing}\n\n${content}`
    : content;

  await replaceDocText(fileKey, updated);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

/* ---------------------------
READ MEMORY
--------------------------- */

app.post("/read_memory", async (req, res) => {
  try {
    const { file_key } = req.body;

    if (!file_key) {
      return res.status(400).json({
        status: "error",
        error: "file_key is required"
      });
    }

    const content = await exportDocText(file_key);

    res.json({
      status: "ok",
      file_key,
      content
    });
  } catch (err) {
    console.error("read_memory error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
APPEND MEMORY
--------------------------- */

app.post("/append_memory", async (req, res) => {
  try {
    const { file_key, content } = req.body;

    if (!file_key || typeof content !== "string") {
      return res.status(400).json({
        status: "error",
        error: "file_key and string content are required"
      });
    }

    await appendDocText(file_key, content);

    res.json({
      status: "memory appended",
      file_key
    });
  } catch (err) {
    console.error("append_memory error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
REPLACE MEMORY
--------------------------- */

app.post("/replace_memory", async (req, res) => {
  try {
    const { file_key, content } = req.body;

    if (!file_key || typeof content !== "string") {
      return res.status(400).json({
        status: "error",
        error: "file_key and string content are required"
      });
    }

    await replaceDocText(file_key, content);

    res.json({
      status: "memory replaced",
      file_key
    });
  } catch (err) {
    console.error("replace_memory error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
LOAD GEN MEMORY
--------------------------- */

app.post("/load_gen_memory", async (req, res) => {
  try {
    console.log("load_gen_memory hit", {
      driveDefined: typeof drive !== "undefined"
    });

    const memory = {};

for (const key of [
  "core_continuity",
  "interaction_learning",
  "emotional_snapshot",
  "cognitive_tuning"
]) {
  memory[key] = await exportDocText(key);
}

    res.json({
      status: "memory_loaded",
      memory
    });
  } catch (err) {
    console.error("load_gen_memory error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
QUERY MEMORY
--------------------------- */

app.post("/query_memory", async (req, res) => {
  try {
    const { file_key, query } = req.body;

    if (!file_key || !query || typeof query !== "string") {
      return res.status(400).json({
        status: "error",
        error: "file_key and string query are required"
      });
    }

    const text = await exportDocText(file_key);

    const matches = text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => line.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20);

    res.json({
      status: "query_complete",
      file_key,
      query,
      matches
    });
  } catch (err) {
    console.error("query_memory error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
LOG REFLECTION
--------------------------- */

app.post("/log_reflection", async (req, res) => {
  try {
    const {
      title,
      type,
      summary,
      emotional_context = "",
      hooks = [],
      tags = [],
      source = "Gen Reflection Engine"
    } = req.body;

    if (!title || !type || !summary) {
      return res.status(400).json({
        status: "error",
        error: "title, type, and summary are required"
      });
    }

    const hookLines = cleanArray(hooks).map(h => `- ${h}`).join("\n");
    const tagLine = cleanArray(tags).join(", ");

    const entry = `---
[${today()}] Entry Title: ${title}
Type: ${type}

Summary:
${summary}

Emotional Context:
${emotional_context || "None provided"}

Continuity Hooks:
${hookLines || "- None provided"}

Tags:
${tagLine || "none"}

Source:
${source}
---`;

    await appendDocText("session_reflections", entry);

    res.json({
      status: "reflection_logged",
      entry
    });
  } catch (err) {
    console.error("log_reflection error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
LOG LEARNING
--------------------------- */

app.post("/log_learning", async (req, res) => {
  try {
    const {
      title,
      observation,
      adjustment,
      confidence = "medium",
      tags = [],
      source = "Gen Interaction Learning Engine"
    } = req.body;

    if (!title || !observation || !adjustment) {
      return res.status(400).json({
        status: "error",
        error: "title, observation, and adjustment are required"
      });
    }

    const tagLine = cleanArray(tags).join(", ");

    const entry = `---
[${today()}] Entry Title: ${title}
Type: Interaction Learning

Observation:
${observation}

Adjustment:
${adjustment}

Confidence:
${confidence}

Tags:
${tagLine || "none"}

Source:
${source}
---`;

    await appendDocText("interaction_learning", entry);

    res.json({
      status: "learning_logged",
      entry
    });
  } catch (err) {
    console.error("log_learning error:", err);
    res.status(500).json({
      status: "error",
      error: err.message
    });
  }
});

/* ---------------------------
START SERVER
--------------------------- */

app.listen(PORT, () => {
  console.log(`Gen Memory Bridge running on port ${PORT}`);
});// rebuild trigger
