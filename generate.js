const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const ANON_DAILY_LIMIT = 3;
const ANON_QUOTA_COOKIE = "fw_anon_quota";

function extractJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI returned non-JSON content.");
    }
    return JSON.parse(match[0]);
  }
}

function readLocalEnvValue(key) {
  try {
    const envFileCandidates = [
      process.env.DOTENV_LOCAL_PATH,
      path.resolve(__dirname, "../.env.local"),
      path.resolve(process.cwd(), ".env.local")
    ].filter(Boolean);

    for (const envPath of envFileCandidates) {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, "utf8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;
        const name = trimmed.slice(0, idx).trim();
        if (name !== key) continue;
        const rawValue = trimmed.slice(idx + 1).trim();
        return rawValue.replace(/^['"]|['"]$/g, "");
      }
    }
  } catch (_) {
    return "";
  }
  return "";
}

function normalizeWordKey(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function collectEnglishTokens(text) {
  const matches = String(text || "").match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || [];
  return matches.map((token) => normalizeWordKey(token)).filter(Boolean);
}

function sanitizeDictionaryByAllowedWords(rawDictionary, allowedWords) {
  const safeDictionary = {};
  const entries = rawDictionary && typeof rawDictionary === "object" ? Object.entries(rawDictionary) : [];
  for (const [key, value] of entries) {
    const normalized = normalizeWordKey(key);
    if (!normalized || !allowedWords.has(normalized)) continue;
    if (safeDictionary[normalized]) continue;
    safeDictionary[normalized] = String(value || "").trim();
  }
  return safeDictionary;
}

function sanitizeArticleText(text, allowedWords, normalizedWords) {
  const source = String(text || "");
  let sanitized = source.replace(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g, (token) => {
    const normalized = normalizeWordKey(token);
    return allowedWords.has(normalized) ? token : "";
  });
  sanitized = sanitized.replace(/[ \t]{2,}/g, " ").replace(/\s+([，。！？；：、,.!?;:])/g, "$1").trim();

  const usedSet = new Set(collectEnglishTokens(sanitized));
  const missingWords = normalizedWords.filter((word) => !usedSet.has(word));
  if (missingWords.length > 0) {
    sanitized += " 最后，我会记住 " + missingWords.join("、") + "。";
  }
  return sanitized;
}

function getTodayDateBucket() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function getCookieValue(req, name) {
  const raw = String(req?.headers?.cookie || "");
  if (!raw) return "";
  const pairs = raw.split(";").map((item) => item.trim()).filter(Boolean);
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(pair.slice(idx + 1));
  }
  return "";
}

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
}

function parseAnonQuotaCookie(rawCookie, secret) {
  if (!rawCookie) return null;
  const parts = String(rawCookie).split(".");
  if (parts.length !== 3) return null;
  const [bucket, rawCount, signature] = parts;
  const payload = bucket + "." + rawCount;
  if (signPayload(payload, secret) !== signature) return null;
  const count = Number(rawCount);
  if (!Number.isFinite(count) || count < 0) return null;
  return {
    bucket: String(bucket),
    count: Math.floor(count)
  };
}

function formatAnonQuotaCookie(state, secret) {
  const safeCount = Math.max(0, Math.floor(Number(state?.count) || 0));
  const bucket = String(state?.bucket || getTodayDateBucket());
  const payload = bucket + "." + safeCount;
  const signature = signPayload(payload, secret);
  return encodeURIComponent(payload + "." + signature);
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const list = Array.isArray(existing) ? existing : [String(existing)];
  list.push(cookieValue);
  res.setHeader("Set-Cookie", list);
}

function writeAnonQuotaCookie(res, state, secret) {
  const encoded = formatAnonQuotaCookie(state, secret);
  const cookie =
    ANON_QUOTA_COOKIE +
    "=" +
    encoded +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    String(60 * 60 * 24 * 30);
  appendSetCookie(res, cookie);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || readLocalEnvValue("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing DEEPSEEK_API_KEY",
      detail: "请在环境变量或项目根目录 .env.local 中配置 DEEPSEEK_API_KEY"
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const isLoggedIn = Boolean(body.is_logged_in);
    const words = Array.isArray(body.words)
      ? body.words.map((w) => String(w).trim()).filter(Boolean).slice(0, 8)
      : [];

    if (words.length !== 8) {
      return res.status(400).json({ error: "words must contain exactly 8 items" });
    }
    const normalizedWords = [...new Set(words.map((word) => normalizeWordKey(word)).filter(Boolean))];
    if (normalizedWords.length !== 8) {
      return res.status(400).json({ error: "words must contain 8 unique items" });
    }

    let anonQuotaState = null;
    const quotaSecret =
      process.env.ANON_QUOTA_SIGNING_KEY ||
      readLocalEnvValue("ANON_QUOTA_SIGNING_KEY") ||
      apiKey;
    if (!isLoggedIn) {
      const parsedCookie = parseAnonQuotaCookie(getCookieValue(req, ANON_QUOTA_COOKIE), quotaSecret);
      const todayBucket = getTodayDateBucket();
      anonQuotaState = parsedCookie && parsedCookie.bucket === todayBucket
        ? parsedCookie
        : { bucket: todayBucket, count: 0 };
      if (anonQuotaState.count >= ANON_DAILY_LIMIT) {
        return res.status(429).json({
          error: "FREE_QUOTA_EXHAUSTED",
          detail: "今日免费额度已耗尽"
        });
      }
    }

    const allowedWordSet = new Set(normalizedWords);

    const prompt = [
      "你是英语学习助手。",
      "写一段中文为主、夹杂英文词的短文，要求叙事连贯。",
      "长度 80-130 字，最多 160 字。",
      "text 只允许出现我给的 8 个英文词，且每个至少出现 1 次，英文单词要出现在短文语境中对应的地方。",
      "禁止中文释义前置或括注在英文词旁，禁止在文章末尾输出所有英文单词。",
      "输出严格 JSON，仅含 text 和 dictionary。",
      "dictionary 必须给出这 8 个词的中文释义。",
      "单词列表：" + words.join(", ")
    ].join("\n");

    const deepseekRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是严格输出 JSON 的英语学习助手。保持简洁，中文为主，不要解释。text 只允许目标 8 词。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 260
      })
    });

    if (!deepseekRes.ok) {
      const text = await deepseekRes.text();
      return res.status(deepseekRes.status).json({
        error: "DeepSeek API request failed",
        detail: text
      });
    }

    const deepseekData = await deepseekRes.json();
    const raw = deepseekData?.choices?.[0]?.message?.content;
    if (!raw) {
      return res.status(502).json({ error: "Empty response from DeepSeek" });
    }

    const parsed = extractJSON(raw);
    if (!parsed?.text || typeof parsed.text !== "string" || typeof parsed.dictionary !== "object") {
      return res.status(502).json({ error: "Invalid AI response structure" });
    }

    const safeText = sanitizeArticleText(parsed.text, allowedWordSet, normalizedWords);
    const safeDictionary = sanitizeDictionaryByAllowedWords(parsed.dictionary, allowedWordSet);
    normalizedWords.forEach((word) => {
      if (!safeDictionary[word]) {
        safeDictionary[word] = "（释义待补充）";
      }
    });

    if (!isLoggedIn && anonQuotaState) {
      const nextCount = Math.min(ANON_DAILY_LIMIT, anonQuotaState.count + 1);
      writeAnonQuotaCookie(
        res,
        {
          bucket: anonQuotaState.bucket,
          count: nextCount
        },
        quotaSecret
      );
    }

    return res.status(200).json({
      text: safeText,
      dictionary: safeDictionary
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/generate", handler);
  app.all("/api/generate", handler);

  return app;
}

function startServer(port = 3000) {
  const app = createApp();
  return app.listen(port, () => {
    console.log("FlashWord generate server listening on port " + String(port));
  });
}

if (require.main === module) {
  startServer(3000);
}

module.exports = {
  handler,
  createApp,
  startServer
};
