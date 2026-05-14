import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const CORS_ALLOW_ALL = String(process.env.CORS_ALLOW_ALL || "true").toLowerCase() === "true";
const SYNC_KEY = process.env.SYNC_KEY || "";
const allowedOrigins = CLIENT_URL.split(",").map(x => x.trim()).filter(Boolean);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "progress-photos";
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Cloud database will not work until configured.");
}
const supabase = createClient(SUPABASE_URL || "http://localhost", SUPABASE_SERVICE_ROLE_KEY || "missing", {
  auth: { persistSession: false, autoRefreshToken: false }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const groq = process.env.GROQ_API_KEY ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1" }) : null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

const ENV_AI_PROVIDER = (process.env.AI_PROVIDER || "mock").toLowerCase();
const ENV_AI_FALLBACK_PROVIDER = (process.env.AI_FALLBACK_PROVIDER || "mock").toLowerCase();
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1";
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_TEXT_MODEL;
const GROQ_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "llama-3.1-8b-instant";
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_TEXT_MODEL;

const nowIso = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0, 10);
const round1 = v => Math.round(Number(v || 0) * 10) / 10;
const sha = value => crypto.createHash("sha256").update(String(value || "")).digest("hex");

app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ALLOW_ALL || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "x-sync-key"]
}));
app.use(express.json({ limit: "20mb" }));

function getProvidedSyncKey(req) {
  return req.get("x-sync-key") || req.query.syncKey || "";
}
function getOwnerKey(req) {
  const provided = getProvidedSyncKey(req);
  return provided || SYNC_KEY || "single-user-local";
}
function ownerHash(req) {
  return sha(getOwnerKey(req));
}

app.use((req, res, next) => {
  if (req.path === "/api/health") return next();
  if (!req.path.startsWith("/api")) return next();
  if (!SYNC_KEY) return next();
  const provided = getProvidedSyncKey(req);
  if (provided !== SYNC_KEY) return res.status(401).json({ error: "Invalid or missing sync key" });
  return next();
});

async function sbSingle(query, fallback = null) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? fallback;
}
async function sbAll(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
async function sbRun(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const DEFAULT_PROFILE = {
  name: "Ognjen",
  age: 19,
  sex: "male",
  height_cm: 188,
  start_weight: 97,
  goal_weight: 86,
  calorie_goal: 2200,
  protein_goal: 190,
  training_plan: "PPL 5x nedeljno",
  preferences: "Ne jede jaja, sir, ribu osim tunjevine. Koristi whey sa mlekom posle treninga."
};

const FOOD_SEED = [
  { name: "Piletina", aliases: ["piletina", "piletine", "pileca", "pilece", "pilećih prsa", "belo meso"], kcal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 },
  { name: "Juneće meso", aliases: ["junetina", "junece", "juneće", "junece meso", "govedina"], kcal_per_100g: 250, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 15 },
  { name: "Ćuretina", aliases: ["curetina", "ćuretina", "cureca", "ćureća"], kcal_per_100g: 135, protein_per_100g: 29, carbs_per_100g: 0, fat_per_100g: 2 },
  { name: "Tunjevina", aliases: ["tuna", "tune", "tunjevina", "konzerva tune", "konzerva tunjevine"], kcal_per_100g: 116, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 1, default_amount: 150 },
  { name: "Jaje", aliases: ["jaje", "jaja"], kcal_per_unit: 70, protein_per_unit: 6, carbs_per_unit: 0.5, fat_per_unit: 5, default_amount: 1, default_unit: "kom" },
  { name: "Tost hleb", aliases: ["tost", "tosta", "tost hleb", "kriška tosta", "kriska tosta"], kcal_per_unit: 70, protein_per_unit: 2.5, carbs_per_unit: 13, fat_per_unit: 1, default_amount: 1, default_unit: "kriška" },
  { name: "Hleb", aliases: ["hleb", "hleba", "kriška hleba", "parče hleba", "parce hleba"], kcal_per_unit: 85, protein_per_unit: 3, carbs_per_unit: 16, fat_per_unit: 1, kcal_per_100g: 265, protein_per_100g: 9, carbs_per_100g: 49, fat_per_100g: 3.2, default_amount: 1, default_unit: "kriška" },
  { name: "Whey", aliases: ["whey", "protein", "proteinski sejk", "proteinski šejk", "sejk", "šejk"], kcal_per_unit: 120, protein_per_unit: 25, carbs_per_unit: 2, fat_per_unit: 1.5, default_amount: 1, default_unit: "porcija" },
  { name: "Jogurt", aliases: ["jogurt", "jogurta"], kcal_per_100g: 60, protein_per_100g: 3.5, carbs_per_100g: 4.5, fat_per_100g: 3, default_amount: 200 },
  { name: "Mleko", aliases: ["mleko", "mleka"], kcal_per_100g: 50, protein_per_100g: 3.3, carbs_per_100g: 5, fat_per_100g: 1.5, default_amount: 300 },
  { name: "Banana", aliases: ["banana", "bananu", "banane"], kcal_per_unit: 90, protein_per_unit: 1, carbs_per_unit: 23, fat_per_unit: 0.3, default_amount: 1, default_unit: "kom" },
  { name: "Pirinač kuvani", aliases: ["pirinac", "pirinač", "kuvani pirinac", "kuvani pirinač", "riza", "riža"], kcal_per_100g: 113, protein_per_100g: 2.7, carbs_per_100g: 25, fat_per_100g: 0.3, default_amount: 150 },
  { name: "Krompir kuvani", aliases: ["krompir", "krompira", "kuvani krompir"], kcal_per_100g: 87, protein_per_100g: 2, carbs_per_100g: 20, fat_per_100g: 0.1, default_amount: 200 },
  { name: "Ovsene", aliases: ["ovsene", "ovsene pahuljice", "ovas"], kcal_per_100g: 370, protein_per_100g: 13, carbs_per_100g: 60, fat_per_100g: 7, default_amount: 60 },
  { name: "Pasulj kuvani", aliases: ["pasulj", "pasulja", "grah", "graha"], kcal_per_100g: 120, protein_per_100g: 8, carbs_per_100g: 21, fat_per_100g: 0.5, default_amount: 300 },
  { name: "Ulje", aliases: ["ulje", "ulja", "maslinovo ulje", "suncokretovo ulje"], kcal_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, default_amount: 10 },
  { name: "Majonez", aliases: ["majonez", "majoneza"], kcal_per_100g: 680, protein_per_100g: 1, carbs_per_100g: 1, fat_per_100g: 75, default_amount: 15 },
  { name: "Burek", aliases: ["burek", "bureka"], kcal_per_100g: 280, protein_per_100g: 9, carbs_per_100g: 30, fat_per_100g: 14, default_amount: 250 },
  { name: "Pljeskavica", aliases: ["pljeskavica", "pljeskavicu"], kcal_per_unit: 650, protein_per_unit: 35, carbs_per_unit: 45, fat_per_unit: 35, default_amount: 1, default_unit: "kom" }
];

async function seedFoodCatalog(owner_hash) {
  const existing = await sbAll(supabase.from("food_catalog").select("id").eq("owner_hash", owner_hash).limit(1));
  if (existing.length) return;
  const rows = FOOD_SEED.map(f => ({
    owner_hash,
    name: f.name,
    aliases: f.aliases,
    kcal_per_100g: f.kcal_per_100g ?? null,
    protein_per_100g: f.protein_per_100g ?? null,
    carbs_per_100g: f.carbs_per_100g ?? 0,
    fat_per_100g: f.fat_per_100g ?? 0,
    kcal_per_unit: f.kcal_per_unit ?? null,
    protein_per_unit: f.protein_per_unit ?? null,
    carbs_per_unit: f.carbs_per_unit ?? 0,
    fat_per_unit: f.fat_per_unit ?? 0,
    default_amount: f.default_amount ?? 100,
    default_unit: f.default_unit ?? "g"
  }));
  await sbRun(supabase.from("food_catalog").insert(rows));
}

async function getProfile(owner_hash) {
  let p = await sbSingle(supabase.from("profile").select("*").eq("owner_hash", owner_hash), null);
  if (!p) {
    const inserted = await sbRun(supabase.from("profile").insert({ owner_hash, ...DEFAULT_PROFILE }).select("*").single());
    p = inserted;
  }
  return p;
}

function hasNutrition(food) {
  return Number(food.kcal_per_100g || 0) > 0 || Number(food.kcal_per_unit || 0) > 0;
}

function normalizeFoodRow(food, owner_hash = null) {
  return {
    owner_hash: food.owner_hash || owner_hash,
    name: food.name,
    aliases: Array.isArray(food.aliases) ? food.aliases : String(food.aliases || food.name || "").split(",").map(x => x.trim()).filter(Boolean),
    kcal_per_100g: food.kcal_per_100g ?? null,
    protein_per_100g: food.protein_per_100g ?? null,
    carbs_per_100g: food.carbs_per_100g ?? 0,
    fat_per_100g: food.fat_per_100g ?? 0,
    kcal_per_unit: food.kcal_per_unit ?? null,
    protein_per_unit: food.protein_per_unit ?? null,
    carbs_per_unit: food.carbs_per_unit ?? 0,
    fat_per_unit: food.fat_per_unit ?? 0,
    default_amount: food.default_amount ?? 100,
    default_unit: food.default_unit ?? "g"
  };
}

async function catalogFoods(owner_hash) {
  await seedFoodCatalog(owner_hash);
  const rows = await sbAll(supabase.from("food_catalog").select("*").eq("owner_hash", owner_hash).order("name"));

  // Important: older deployments may already have an incomplete/empty food_catalog row,
  // so seedFoodCatalog() will not re-seed. Always keep the built-in catalog available
  // and prefer DB rows only when they contain usable nutrition values.
  const byName = new Map();
  for (const f of FOOD_SEED) byName.set(normalizeText(f.name), normalizeFoodRow(f, owner_hash));
  for (const r of rows) {
    const normalized = normalizeFoodRow(r, owner_hash);
    const key = normalizeText(normalized.name);
    const existing = byName.get(key);
    byName.set(key, hasNutrition(normalized) || !existing ? normalized : { ...existing, ...normalized, ...existing });
  }
  return [...byName.values()];
}

function normalizeText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "dj").replace(/[^a-z0-9čćšžđ\s.,x@]/gi, " ").replace(/\s+/g, " ").trim();
}
function getNumberNear(text, index, len, food) {
  const before = text.slice(Math.max(0, index - 24), index);
  const after = text.slice(index + len, index + len + 24);
  const gramMatch = `${before} ${after}`.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grama|kg|ml|l|litara)/i);
  if (gramMatch) {
    let amount = Number(gramMatch[1].replace(",", "."));
    const unit = gramMatch[2].toLowerCase();
    if (["kg", "l", "litara"].includes(unit)) amount *= 1000;
    return { type: "grams", amount, amount_text: `${round1(amount)}g` };
  }
  const raw = before.match(/(\d+(?:[.,]\d+)?)\s*$/)?.[1] || after.match(/^\s*(\d+(?:[.,]\d+)?)/)?.[1];
  if (raw) {
    const amount = Number(raw.replace(",", "."));
    if (food.kcal_per_unit != null) return { type: "units", amount, amount_text: `${round1(amount)} ${food.default_unit || "kom"}` };
    return { type: "grams", amount, amount_text: `${round1(amount)}g` };
  }
  if (/konzerva/.test(`${before} ${after}`) && /tuna|tunjev/.test((food.aliases || []).join(" "))) return { type: "grams", amount: 150, amount_text: "1 konzerva (~150g)" };
  if (food.kcal_per_unit != null) return { type: "units", amount: Number(food.default_amount || 1), amount_text: `${food.default_amount || 1} ${food.default_unit || "kom"}` };
  return { type: "grams", amount: Number(food.default_amount || 100), amount_text: `${food.default_amount || 100}g` };
}
async function parseFoodMock(text, owner_hash) {
  const normalized = normalizeText(text);
  const foods = await catalogFoods(owner_hash);
  const usedRanges = [];
  const items = [];
  for (const food of foods) {
    const aliases = (food.aliases || []).map(normalizeText).sort((a, b) => b.length - a.length);
    let hit = null;
    for (const alias of aliases) {
      const re = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
      const match = normalized.match(re);
      if (match) {
        const index = match.index + (match[1] ? match[1].length : 0);
        if (!usedRanges.some(r => Math.abs(r - index) < 8)) { hit = { alias, index }; break; }
      }
    }
    if (!hit) continue;
    usedRanges.push(hit.index);
    const q = getNumberNear(normalized, hit.index, hit.alias.length, food);
    let kcal = 0, protein = 0, carbs = 0, fat = 0, grams = null;
    if (q.type === "units" && food.kcal_per_unit != null) {
      kcal = Number(food.kcal_per_unit || 0) * q.amount;
      protein = Number(food.protein_per_unit || 0) * q.amount;
      carbs = Number(food.carbs_per_unit || 0) * q.amount;
      fat = Number(food.fat_per_unit || 0) * q.amount;
    } else {
      grams = q.amount;
      kcal = Number(food.kcal_per_100g || 0) * grams / 100;
      protein = Number(food.protein_per_100g || 0) * grams / 100;
      carbs = Number(food.carbs_per_100g || 0) * grams / 100;
      fat = Number(food.fat_per_100g || 0) * grams / 100;
    }
    items.push({ name: food.name, amount_text: q.amount_text, grams, kcal: round1(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat), confidence: 0.78 });
  }
  const total = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { items, total: { kcal: round1(total.kcal), protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat) }, summary: items.map(i => `${i.name} ${i.amount_text}`).join(", ") };
}

const EXERCISES = [
  { name: "Bench press", aliases: ["bench", "benc", "bench press"] }, { name: "Incline bench press", aliases: ["incline", "kosi bench", "kosi benc"] }, { name: "Lateral raises", aliases: ["lateral", "letenje"] }, { name: "Triceps pushdown", aliases: ["triceps", "pushdown"] }, { name: "Lat pulldown", aliases: ["lat", "pulldown"] }, { name: "Cable row", aliases: ["row", "veslanje"] }, { name: "Biceps curl", aliases: ["biceps", "curl"] }, { name: "Romanian deadlift", aliases: ["rdl", "romanian"] }, { name: "Deadlift", aliases: ["deadlift", "mrtvo"] }, { name: "Leg press", aliases: ["leg press", "presa"] }, { name: "Trčanje", aliases: ["trcanje", "trčanje", "run"] }
];
function parseWorkoutMock(text) {
  const normalized = normalizeText(text);
  const exercises = [];
  for (const ex of EXERCISES) {
    for (const alias of ex.aliases.map(normalizeText).sort((a, b) => b.length - a.length)) {
      const idx = normalized.indexOf(alias);
      if (idx === -1) continue;
      const after = normalized.slice(idx + alias.length, idx + alias.length + 45);
      let sets = null, reps = null, weight_kg = null, duration_min = null;
      const p1 = after.match(/\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?\s+(\d+)\s*x\s*(\d+)/i);
      const p2 = after.match(/\s*(\d+)\s*x\s*(\d+)\s*(?:@|sa)?\s*(\d+(?:[.,]\d+)?)?/i);
      const cardio = after.match(/(\d+(?:[.,]\d+)?)\s*(min| minuta)/i);
      if (p1) { weight_kg = Number(p1[1].replace(",", ".")); sets = Number(p1[2]); reps = Number(p1[3]); }
      else if (p2) { sets = Number(p2[1]); reps = Number(p2[2]); if (p2[3]) weight_kg = Number(p2[3].replace(",", ".")); }
      else if (cardio) duration_min = Number(cardio[1].replace(",", "."));
      exercises.push({ name: ex.name, sets, reps, weight_kg, duration_min, notes: "parser" });
      break;
    }
  }
  let type = "Trening";
  if (/push|bench|incline|triceps|lateral/.test(normalized)) type = "Push";
  else if (/pull|lat|row|biceps/.test(normalized)) type = "Pull";
  else if (/legs|noge|leg|rdl|deadlift|presa/.test(normalized)) type = "Legs";
  else if (/trcanje|trčanje|cardio/.test(normalized)) type = "Cardio";
  return { type, exercises, summary: exercises.length ? `Prepoznato ${exercises.length} vežbi.` : "" };
}
function parseWeightMock(text) {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(/(\d{2,3}(?:[.,]\d+)?)\s*kg/g)];
  for (const m of matches) {
    const value = Number(m[1].replace(",", "."));
    const around = normalized.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
    if (value >= 40 && value <= 200 && (/tezina|tezak|jutros|danas|vaga|merenje|mjerenje/.test(around) || m.index < 5)) return { weight_kg: value, notes: "parser" };
  }
  return { weight_kg: null, notes: "" };
}
async function mockLog(text, date, owner_hash) {
  const meal = await parseFoodMock(text, owner_hash);
  const workout = parseWorkoutMock(text);
  const weight = parseWeightMock(text);
  const normalized = normalizeText(text);
  const intents = [];
  if (meal.items.length) intents.push("food");
  if (workout.exercises.length) intents.push("workout");
  if (weight.weight_kg) intents.push("weight");
  if (/ne jedem|ne volim|zapamti|od sada|ubuduce|ubuduće|cilj mi je/.test(normalized)) intents.push("memory");
  if (!intents.length || /sta|što|kako|koliko|da li|jel|treba/.test(normalized)) intents.push("question");
  const parts = [];
  if (weight.weight_kg) parts.push(`težinu ${weight.weight_kg}kg`);
  if (meal.items.length) parts.push(`hranu oko ${Math.round(meal.total.kcal)} kcal i ${Math.round(meal.total.protein)}g proteina`);
  if (workout.exercises.length) parts.push(`trening ${workout.exercises.length} vežbi`);
  return { intents, weight, meal, workout, memory: [], coach_reply: parts.length ? `Upisao sam ${parts.join(", ")}.` : "Nisam prepoznao konkretan unos. Napiši npr. '300g piletine 4 tosta bench 80 4x8'." };
}

async function settingsForClient(owner_hash) {
  const rows = await sbAll(supabase.from("app_settings").select("key,value").eq("owner_hash", owner_hash));
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    ai_provider: (map.ai_provider || ENV_AI_PROVIDER).toLowerCase(),
    ai_fallback_provider: (map.ai_fallback_provider || ENV_AI_FALLBACK_PROVIDER).toLowerCase(),
    groq_text_model: map.groq_text_model || GROQ_TEXT_MODEL,
    groq_vision_model: map.groq_vision_model || GROQ_VISION_MODEL,
    gemini_text_model: map.gemini_text_model || GEMINI_TEXT_MODEL,
    gemini_vision_model: map.gemini_vision_model || GEMINI_VISION_MODEL,
    openai_text_model: map.openai_text_model || OPENAI_TEXT_MODEL,
    openai_vision_model: map.openai_vision_model || OPENAI_VISION_MODEL
  };
}
async function upsertSetting(owner_hash, key, value) {
  await sbRun(supabase.from("app_settings").upsert({ owner_hash, key, value: String(value), updated_at: nowIso() }, { onConflict: "owner_hash,key" }));
}

async function openAiText(messages, model = OPENAI_TEXT_MODEL) { if (!openai) throw new Error("Missing OPENAI_API_KEY"); const c = await openai.chat.completions.create({ model, messages, temperature: 0.4 }); return c.choices?.[0]?.message?.content || ""; }
async function openAiJson(system, user, model = OPENAI_TEXT_MODEL) { if (!openai) throw new Error("Missing OPENAI_API_KEY"); const c = await openai.chat.completions.create({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2 }); return JSON.parse(c.choices?.[0]?.message?.content || "{}"); }
async function groqText(messages, model = GROQ_TEXT_MODEL) { if (!groq) throw new Error("Missing GROQ_API_KEY"); const c = await groq.chat.completions.create({ model, messages, temperature: 0.4 }); return c.choices?.[0]?.message?.content || ""; }
async function groqJson(system, user, model = GROQ_TEXT_MODEL) { if (!groq) throw new Error("Missing GROQ_API_KEY"); const c = await groq.chat.completions.create({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2 }); return JSON.parse(c.choices?.[0]?.message?.content || "{}"); }
async function geminiGenerate({ model, contents, systemInstruction, generationConfig }) {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  const url = `${process.env.GEMINI_BASE_URL || GEMINI_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const body = { contents, generationConfig: generationConfig || { temperature: 0.4 } };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Gemini error ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = await response.json();
  return json.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || "";
}
async function geminiJson(system, user, model = GEMINI_TEXT_MODEL) { const text = await geminiGenerate({ model, systemInstruction: `${system}\nVrati samo validan JSON.`, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }); return JSON.parse(text || "{}"); }
async function geminiText(messages, model = GEMINI_TEXT_MODEL) { const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n"); const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }] })); return await geminiGenerate({ model, systemInstruction: system, contents, generationConfig: { temperature: 0.4 } }); }

async function providerJson(system, user, owner_hash, fallbackFactory) {
  const settings = await settingsForClient(owner_hash);
  const providers = [settings.ai_provider, settings.ai_fallback_provider, "mock"].filter((v, i, a) => v && a.indexOf(v) === i);
  let lastError = null;
  for (const p of providers) {
    try {
      if (p === "groq") return { provider: p, data: await groqJson(system, user, settings.groq_text_model) };
      if (p === "gemini") return { provider: p, data: await geminiJson(system, user, settings.gemini_text_model) };
      if (p === "openai") return { provider: p, data: await openAiJson(system, user, settings.openai_text_model) };
      if (p === "mock") return { provider: p, data: await fallbackFactory() };
    } catch (e) { lastError = e; }
  }
  return { provider: "mock", warning: lastError?.message, data: await fallbackFactory() };
}
async function providerText(messages, owner_hash, fallbackFactory) {
  const settings = await settingsForClient(owner_hash);
  const providers = [settings.ai_provider, settings.ai_fallback_provider, "mock"].filter((v, i, a) => v && a.indexOf(v) === i);
  let lastError = null;
  for (const p of providers) {
    try {
      if (p === "groq") return { provider: p, text: await groqText(messages, settings.groq_text_model) };
      if (p === "gemini") return { provider: p, text: await geminiText(messages, settings.gemini_text_model) };
      if (p === "openai") return { provider: p, text: await openAiText(messages, settings.openai_text_model) };
      if (p === "mock") return { provider: p, text: await fallbackFactory() };
    } catch (e) { lastError = e; }
  }
  return { provider: "mock", warning: lastError?.message, text: await fallbackFactory() };
}

async function saveWeight(owner_hash, date, weight_kg, notes = "") {
  await sbRun(supabase.from("weights").upsert({ owner_hash, date, weight_kg, notes }, { onConflict: "owner_hash,date" }));
}
async function saveMeal(owner_hash, date, raw_text, meal) {
  const total = meal.total || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const inserted = await sbRun(supabase.from("meals").insert({ owner_hash, date, raw_text, summary: meal.summary || "", total_kcal: total.kcal || 0, total_protein: total.protein || 0, total_carbs: total.carbs || 0, total_fat: total.fat || 0 }).select("*").single());
  if (meal.items?.length) await sbRun(supabase.from("meal_items").insert(meal.items.map(i => ({ owner_hash, meal_id: inserted.id, name: i.name, amount_text: i.amount_text || "", grams: i.grams ?? null, kcal: i.kcal || 0, protein: i.protein || 0, carbs: i.carbs || 0, fat: i.fat || 0, confidence: i.confidence ?? 0.6 }))));
  return inserted;
}
async function saveWorkout(owner_hash, date, raw_text, workout) {
  const inserted = await sbRun(supabase.from("workouts").insert({ owner_hash, date, raw_text, type: workout.type || "", summary: workout.summary || "" }).select("*").single());
  if (workout.exercises?.length) await sbRun(supabase.from("workout_exercises").insert(workout.exercises.map(e => ({ owner_hash, workout_id: inserted.id, name: e.name, sets: e.sets ?? null, reps: e.reps ?? null, weight_kg: e.weight_kg ?? null, duration_min: e.duration_min ?? null, notes: e.notes || "" }))));
  return inserted;
}
async function upsertMemory(owner_hash, memory = []) {
  if (!memory.length) return;
  await sbRun(supabase.from("ai_memory").upsert(memory.map(m => ({ owner_hash, key: m.key, value: m.value, updated_at: nowIso() })), { onConflict: "owner_hash,key" }));
}

async function getMeals(owner_hash, date) {
  const meals = await sbAll(supabase.from("meals").select("*").eq("owner_hash", owner_hash).eq("date", date).order("created_at", { ascending: true }));
  if (!meals.length) return [];
  const ids = meals.map(m => m.id);
  const items = await sbAll(supabase.from("meal_items").select("*").eq("owner_hash", owner_hash).in("meal_id", ids).order("id", { ascending: true }));
  return meals.map(m => ({ ...m, items: items.filter(i => i.meal_id === m.id) }));
}
async function getWorkouts(owner_hash, date) {
  const workouts = await sbAll(supabase.from("workouts").select("*").eq("owner_hash", owner_hash).eq("date", date).order("created_at", { ascending: true }));
  if (!workouts.length) return [];
  const ids = workouts.map(w => w.id);
  const exercises = await sbAll(supabase.from("workout_exercises").select("*").eq("owner_hash", owner_hash).in("workout_id", ids).order("id", { ascending: true }));
  return workouts.map(w => ({ ...w, exercises: exercises.filter(e => e.workout_id === w.id) }));
}
async function daySummary(owner_hash, date) {
  const p = await getProfile(owner_hash);
  const [meals, workouts, weights, latestWeight, photos, memories] = await Promise.all([
    getMeals(owner_hash, date),
    getWorkouts(owner_hash, date),
    sbAll(supabase.from("weights").select("*").eq("owner_hash", owner_hash).order("date", { ascending: true })),
    sbSingle(supabase.from("weights").select("*").eq("owner_hash", owner_hash).lte("date", date).order("date", { ascending: false }).limit(1), null),
    sbAll(supabase.from("progress_photos").select("*").eq("owner_hash", owner_hash).eq("date", date).order("created_at", { ascending: false })),
    sbAll(supabase.from("ai_memory").select("*").eq("owner_hash", owner_hash).order("updated_at", { ascending: false }).limit(20))
  ]);
  const totals = meals.reduce((a, m) => ({ kcal: a.kcal + Number(m.total_kcal || 0), protein: a.protein + Number(m.total_protein || 0), carbs: a.carbs + Number(m.total_carbs || 0), fat: a.fat + Number(m.total_fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { date, profile: p, meals, workouts, weights, latestWeight, photos, memories, totals: { kcal: round1(totals.kcal), protein: round1(totals.protein), carbs: round1(totals.carbs), fat: round1(totals.fat) } };
}
function dateAdd(date, days) { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
async function analyticsForRange(owner_hash, days, endDate = todayISO()) {
  const start = dateAdd(endDate, -days + 1);
  const [meals, workouts, weights] = await Promise.all([
    sbAll(supabase.from("meals").select("date,total_kcal,total_protein,total_carbs,total_fat").eq("owner_hash", owner_hash).gte("date", start).lte("date", endDate)),
    sbAll(supabase.from("workouts").select("date,id").eq("owner_hash", owner_hash).gte("date", start).lte("date", endDate)),
    sbAll(supabase.from("weights").select("date,weight_kg").eq("owner_hash", owner_hash).gte("date", start).lte("date", endDate).order("date"))
  ]);
  const totals = meals.reduce((a, m) => ({ kcal: a.kcal + Number(m.total_kcal || 0), protein: a.protein + Number(m.total_protein || 0), carbs: a.carbs + Number(m.total_carbs || 0), fat: a.fat + Number(m.total_fat || 0), meals: a.meals + 1 }), { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 });
  return { days, start, end: endDate, totals: { ...totals, workouts: workouts.length }, avg: { kcal: round1(totals.kcal / days), protein: round1(totals.protein / days), carbs: round1(totals.carbs / days), fat: round1(totals.fat / days) }, weight: { first: weights[0]?.weight_kg ?? null, last: weights.at(-1)?.weight_kg ?? null, change: weights.length > 1 ? round1(Number(weights.at(-1).weight_kg) - Number(weights[0].weight_kg)) : null, entries: weights.length } };
}
async function exerciseProgress(owner_hash, limit = 120) {
  const rows = await sbAll(supabase.from("workout_exercises").select("*, workouts!inner(date)").eq("owner_hash", owner_hash).order("id", { ascending: false }).limit(limit));
  const map = new Map();
  for (const r of rows) {
    const key = r.name;
    if (!map.has(key)) map.set(key, { name: key, entries: 0, best_weight: 0, best_volume: 0, last: null });
    const g = map.get(key);
    g.entries++;
    const volume = Number(r.weight_kg || 0) * Number(r.sets || 0) * Number(r.reps || 0);
    if (Number(r.weight_kg || 0) > g.best_weight) g.best_weight = Number(r.weight_kg || 0);
    if (volume > g.best_volume) g.best_volume = round1(volume);
    if (!g.last) g.last = { date: r.workouts?.date, sets: r.sets, reps: r.reps, weight_kg: r.weight_kg, duration_min: r.duration_min };
  }
  return [...map.values()].sort((a, b) => b.entries - a.entries);
}
async function getCoachContext(owner_hash, date) {
  const [s, seven, thirty] = await Promise.all([daySummary(owner_hash, date), analyticsForRange(owner_hash, 7, date), analyticsForRange(owner_hash, 30, date)]);
  return JSON.stringify({ profile: s.profile, date, today: { totals: s.totals, workouts: s.workouts.map(w => ({ type: w.type, exercises: w.exercises })) }, latestWeight: s.latestWeight, memories: s.memories, seven, thirty }, null, 2);
}

function buildCoachSystemPrompt(context) {
  return `Ti si privatni AI fitness coach unutar aplikacije za praćenje treninga, hrane, težine i napretka.

Odgovaraj ISKLJUČIVO na srpskom jeziku, prirodno, direktno i konkretno. Tvoj cilj je da korisnik dobije koristan sledeći korak, ne generičnu motivaciju.

KONTEKST IZ APLIKACIJE:
${context}

Kako da koristiš kontekst:
- Ako korisnik pita za ishranu, gledaj današnje kalorije/protein, cilj kalorija/proteina i preferencije. Predloži konkretne opcije.
- Ako korisnik pita za trening, daj konkretne vežbe, serije, ponavljanja, pauze i tehničke cue-ove kada je korisno.
- Ako korisnik pita za težinu/napredak, gledaj trend 7 i 30 dana. Ne paniči zbog jednog dana; objasni vodu, glikogen, so, varenje i upalu mišića.
- Ako korisnik traži šta da radi danas, spoji trening, kalorije, protein i oporavak u kratak plan.
- Ako nema dovoljno podataka, postavi najviše jedno kratko pitanje, ali prvo daj najbolji mogući savet iz dostupnog konteksta.

Pravila kvaliteta:
- Ne izmišljaj podatke koje nemaš.
- Ne govori "kao AI" i ne piši dugačke eseje.
- Ne vraćaj JSON u chat endpointu; vrati normalan tekst spreman za prikaz korisniku.
- Struktura odgovora: 1 kratak zaključak + konkretni koraci. Koristi bullet-e samo ako stvarno pomažu.
- Ako korisnik traži unos u dnevnik, objasni mu da može da napiše npr. "300g piletine i 4 tosta" i aplikacija će to sačuvati.

Bezbednost:
- Ne dijagnostikuj bolesti i ne prepisuj lekove.
- Ne preporučuj ekstremno gladovanje, opasne detokse ili drastično skidanje kila.
- Za bol u grudima, nesvesticu, jaku vrtoglavicu, ozbiljnu povredu, jak ili rastući bol, poremećaj ishrane ili opasne simptome reci da se obrati lekaru/stručnjaku.
- Za bol tokom vežbe: predloži smanjenje opterećenja, prekid bolne vežbe i proveru tehnike; ne forsirati kroz bol.`;
}

async function mockCoachReply(owner_hash, date, message = "") {
  const s = await daySummary(owner_hash, date);
  const seven = await analyticsForRange(owner_hash, 7, date);
  const p = s.profile || {};
  const t = String(message || "").toLowerCase();
  const kcalLeft = Math.max(0, Number(p.calorie_goal || 0) - Number(s.totals.kcal || 0));
  const proteinLeft = Math.max(0, Number(p.protein_goal || 0) - Number(s.totals.protein || 0));

  if (/rdl|romanian|hamstring|zadnja loza/.test(t)) {
    return `Za RDL: smanji kilažu dok ne osetiš zadnju ložu, kukove guraj nazad kao da zatvaraš vrata, kolena neka ostanu blago savijena, šipka ide uz noge, a spuštaš samo dok leđa ostaju neutralna. Radi 3-4 serije po 6-10 ponavljanja, pauza 2 min. Ako osećaš donja leđa više nego zadnju ložu, skrati opseg i uspori spuštanje na 2-3 sekunde.`;
  }

  if (/vecer|večer|jedem|hrana|protein|obrok|gladan|glad/.test(t)) {
    return `Danas ti je ostalo približno ${Math.round(kcalLeft)} kcal i ${Math.round(proteinLeft)}g proteina do cilja. Dobra večera bi bila: 200-300g piletine/ćuretine + velika salata + malo pirinča/krompira ako imaš kalorija. Ako ti fali samo protein, uzmi whey sa mlekom ili 150-200g tunjevine. Ne moraš savršeno, ciljaj da protein bude blizu plana.`;
  }

  if (/tezina|težina|vaga|kilo|kg|smrs|mrš|dobio|goj/.test(t)) {
    const change = seven?.weight?.change;
    const trendText = change == null ? "nema još dovoljno unosa za jasan 7-dnevni trend" : `7-dnevna promena je oko ${change > 0 ? "+" : ""}${change}kg`;
    return `Ne gledaj jedan skok na vagi kao mast. ${trendText}. Težina često skoči zbog soli, vode, glikogena, kasne večere, stresa ili upale posle treninga. Gledaj prosek 7-14 dana; ako prosek ne pada 2 nedelje, tek onda smanji 100-200 kcal ili dodaj malo kretanja.`;
  }

  if (/trening|vezb|vežb|radim|danas|plan/.test(t)) {
    return `Za danas izaberi trening koji se uklapa u oporavak: 4-6 glavnih vežbi, 2-4 radne serije, većina serija 1-3 ponavljanja od otkaza. Ako si umoran, uradi lakši upper ili šetnju. Ako si odmoran, drži progresivno opterećenje i zapiši kilaže u aplikaciju.`;
  }

  return `Trenutno si na oko ${Math.round(s.totals.kcal)} kcal i ${Math.round(s.totals.protein)}g proteina za ${date}. Najkorisniji sledeći korak: pogodi protein cilj, ne paniči zbog dnevnih oscilacija i zapiši sledeći obrok/trening što konkretnije. Ako želiš precizniji savet, napiši da li pitaš za hranu, trening, težinu ili oporavak.`;
}


app.get("/api/health", (_, res) => res.json({ ok: true, database: "supabase", aiProvider: ENV_AI_PROVIDER, fallbackProvider: ENV_AI_FALLBACK_PROVIDER }));

app.get("/uploads/:filename", async (req, res) => {
  try {
    const owner_hash = ownerHash(req);
    const path = `${owner_hash}/${req.params.filename}`;
    const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(path, 60 * 10);
    if (error) throw error;
    res.redirect(data.signedUrl);
  } catch (e) { res.status(404).send("File not found"); }
});

app.get("/api/state", async (req, res) => {
  try {
    const oh = ownerHash(req);
    const date = req.query.date || todayISO();
    const [summary, allPhotos, seven, fourteen, thirty, progress, foods, settings] = await Promise.all([
      daySummary(oh, date),
      sbAll(supabase.from("progress_photos").select("*").eq("owner_hash", oh).order("date", { ascending: false }).order("created_at", { ascending: false })),
      analyticsForRange(oh, 7, date), analyticsForRange(oh, 14, date), analyticsForRange(oh, 30, date),
      exerciseProgress(oh, 120), catalogFoods(oh), settingsForClient(oh)
    ]);
    res.json({ ...summary, allPhotos, analytics: { seven, fourteen, thirty }, exerciseProgress: progress, foodCatalog: foods, ai: { provider: settings.ai_provider, fallbackProvider: settings.ai_fallback_provider, settings, groqTextModel: GROQ_TEXT_MODEL, groqVisionModel: GROQ_VISION_MODEL, geminiTextModel: GEMINI_TEXT_MODEL, geminiVisionModel: GEMINI_VISION_MODEL } });
  } catch (error) { console.error(error); res.status(500).json({ error: "State failed", details: error.message }); }
});

app.put("/api/profile", async (req, res) => {
  try {
    const oh = ownerHash(req);
    const b = req.body;
    const data = await sbRun(supabase.from("profile").upsert({ owner_hash: oh, name: b.name, age: b.age, sex: b.sex, height_cm: b.height_cm, start_weight: b.start_weight, goal_weight: b.goal_weight, calorie_goal: b.calorie_goal, protein_goal: b.protein_goal, training_plan: b.training_plan, preferences: b.preferences, updated_at: nowIso() }, { onConflict: "owner_hash" }).select("*").single());
    res.json(data);
  } catch (error) { res.status(500).json({ error: "Profile failed", details: error.message }); }
});

app.post("/api/weight", async (req, res) => { try { const oh = ownerHash(req); const { date = todayISO(), weight_kg, notes = "" } = req.body; await saveWeight(oh, date, Number(weight_kg), notes); res.json({ ok: true, state: await daySummary(oh, date) }); } catch (e) { res.status(500).json({ error: "Weight failed", details: e.message }); } });
app.post("/api/meal/manual", async (req, res) => { try { const oh = ownerHash(req); const { date = todayISO(), raw_text, items = [] } = req.body; const total = items.reduce((a, x) => ({ kcal: a.kcal + Number(x.kcal || 0), protein: a.protein + Number(x.protein || 0), carbs: a.carbs + Number(x.carbs || 0), fat: a.fat + Number(x.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }); await saveMeal(oh, date, raw_text || "Ručni unos", { items, total, summary: "Ručni unos" }); res.json({ ok: true, state: await daySummary(oh, date) }); } catch (e) { res.status(500).json({ error: "Meal failed", details: e.message }); } });
app.delete("/api/meal/:id", async (req, res) => { try { const oh = ownerHash(req); await sbRun(supabase.from("meal_items").delete().eq("owner_hash", oh).eq("meal_id", req.params.id)); await sbRun(supabase.from("meals").delete().eq("owner_hash", oh).eq("id", req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: "Delete meal failed", details: e.message }); } });
app.delete("/api/workout/:id", async (req, res) => { try { const oh = ownerHash(req); await sbRun(supabase.from("workout_exercises").delete().eq("owner_hash", oh).eq("workout_id", req.params.id)); await sbRun(supabase.from("workouts").delete().eq("owner_hash", oh).eq("id", req.params.id)); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: "Delete workout failed", details: e.message }); } });

app.post("/api/ai/log", async (req, res) => {
  try {
    const oh = ownerHash(req);
    const { text, date = todayISO() } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });
    const resetCommand = /^\s*(reset|resetuj|restartuj|ocisti|očisti|obrisi|obriši|izbrisi|izbriši|ponisti|poništi)(\s+(sve|dnevnik|dan|danas|unos|unose|kalorije|hranu|ishranu|trening|tezinu|težinu))?\s*([.!?]*)?$/i.test(text);
    const resetSentence = /\b(reset|resetuj|restartuj|ocisti|očisti|obrisi|obriši|izbrisi|izbriši|ponisti|poništi)\b.*\b(dnevnik|dan|danas|unos|unose|kalorije|hranu|ishranu|trening|tezinu|težinu)\b/i.test(text);
    if (resetCommand || resetSentence) {
      const meals = await sbAll(supabase.from("meals").select("id").eq("owner_hash", oh).eq("date", date));
      const workouts = await sbAll(supabase.from("workouts").select("id").eq("owner_hash", oh).eq("date", date));
      if (meals.length) await sbRun(supabase.from("meal_items").delete().eq("owner_hash", oh).in("meal_id", meals.map(m => m.id)));
      await sbRun(supabase.from("meals").delete().eq("owner_hash", oh).eq("date", date));
      if (workouts.length) await sbRun(supabase.from("workout_exercises").delete().eq("owner_hash", oh).in("workout_id", workouts.map(w => w.id)));
      await sbRun(supabase.from("workouts").delete().eq("owner_hash", oh).eq("date", date));
      await sbRun(supabase.from("weights").delete().eq("owner_hash", oh).eq("date", date));
      await sbRun(supabase.from("ai_notes").delete().eq("owner_hash", oh).eq("date", date));
      return res.json({ ok: true, reply: `Resetovao sam dnevnik za ${date}. Kalorije, obroci, trening i težina za taj dan su obrisani.`, state: await daySummary(oh, date) });
    }
    const context = await getCoachContext(oh, date);
    const deterministic = await mockLog(text, date, oh);
    const system = `Ti si AI parser i fitness coach. Vrati samo JSON oblika {"intents":[],"weight":{"weight_kg":number|null,"notes":""},"meal":{"summary":"","items":[],"total":{"kcal":0,"protein":0,"carbs":0,"fat":0}},"workout":{"type":"","summary":"","exercises":[]},"memory":[],"coach_reply":""}. Ako korisnik unosi hranu/trening/težinu, popuni odgovarajuća polja. Odgovori na srpskom. Kontekst:\n${context}`;
    const result = await providerJson(system, text, oh, () => deterministic);
    const parsed = result.data || {};

    // Deterministic fallback: even when Groq/Gemini answers like a coach but forgets
    // to return structured food/workout/weight JSON, still log simple inputs such as
    // "100g piletina", "4 tosta", "bench 80 4x8", or "96.4kg jutros".
    const intentSet = new Set(Array.isArray(parsed.intents) ? parsed.intents : []);
    if (parsed.weight?.weight_kg) intentSet.add("weight");
    if (parsed.meal?.items?.length) intentSet.add("food");
    if (parsed.workout?.exercises?.length) intentSet.add("workout");

    if (deterministic.weight?.weight_kg && !parsed.weight?.weight_kg) {
      parsed.weight = deterministic.weight;
      intentSet.add("weight");
    }
    const parsedMealTotal = Number(parsed.meal?.total?.kcal || 0) + Number(parsed.meal?.total?.protein || 0);
    const deterministicMealTotal = Number(deterministic.meal?.total?.kcal || 0) + Number(deterministic.meal?.total?.protein || 0);
    if (deterministic.meal?.items?.length && (!parsed.meal?.items?.length || parsedMealTotal <= 0 || deterministicMealTotal > parsedMealTotal * 1.5)) {
      // Deterministic catalog wins for simple known foods like "300g piletine".
      // This prevents AI/mock replies from saving 0 kcal / 0g protein.
      parsed.meal = deterministic.meal;
      intentSet.add("food");
    }
    if (deterministic.workout?.exercises?.length && !parsed.workout?.exercises?.length) {
      parsed.workout = deterministic.workout;
      intentSet.add("workout");
    }

    parsed.intents = [...intentSet];
    const intents = parsed.intents;
    if (intents.includes("weight") && parsed.weight?.weight_kg) await saveWeight(oh, date, Number(parsed.weight.weight_kg), parsed.weight.notes || text);
    if (intents.includes("food") && parsed.meal?.items?.length) await saveMeal(oh, date, text, parsed.meal);
    if (intents.includes("workout") && parsed.workout?.exercises?.length) await saveWorkout(oh, date, text, parsed.workout);
    if (parsed.memory?.length) await upsertMemory(oh, parsed.memory);

    const loggedParts = [];
    if (intents.includes("weight") && parsed.weight?.weight_kg) loggedParts.push(`težinu ${parsed.weight.weight_kg}kg`);
    if (intents.includes("food") && parsed.meal?.items?.length) loggedParts.push(`hranu oko ${Math.round(Number(parsed.meal.total?.kcal || 0))} kcal i ${Math.round(Number(parsed.meal.total?.protein || 0))}g proteina`);
    if (intents.includes("workout") && parsed.workout?.exercises?.length) loggedParts.push(`trening ${parsed.workout.exercises.length} vežbi`);
    const reply = loggedParts.length
      ? `${parsed.coach_reply || "Upisao sam u dnevnik."}\n\nSačuvano: ${loggedParts.join(", ")}.`
      : (parsed.coach_reply || deterministic.coach_reply || "Nisam prepoznao konkretan unos za čuvanje.");
    await sbRun(supabase.from("ai_notes").insert({ owner_hash: oh, date, user_text: text, ai_reply: reply }));
    res.json({ ok: true, parsed, reply, provider: result.provider, warning: result.warning, state: await daySummary(oh, date) });
  } catch (e) { console.error(e); res.status(500).json({ error: "AI log failed", details: e.message }); }
});

app.post("/api/ai/chat", async (req, res) => {
  try {
    const oh = ownerHash(req);
    const { message, date = todayISO(), history = [] } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ error: "message required" });

    const cleanMessage = String(message).trim();
    const context = await getCoachContext(oh, date);
    const systemPrompt = buildCoachSystemPrompt(context);
    const safeHistory = Array.isArray(history)
      ? history
          .filter(m => m && typeof m.text === "string" && m.text.trim())
          .slice(-10)
          .map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.text).slice(0, 1500)
          }))
      : [];

    const messages = [
      { role: "system", content: systemPrompt },
      ...safeHistory,
      { role: "user", content: cleanMessage }
    ];

    const result = await providerText(messages, oh, async () => mockCoachReply(oh, date, cleanMessage));
    const reply = String(result.text || "").trim() || await mockCoachReply(oh, date, cleanMessage);

    await sbRun(supabase.from("ai_notes").insert({ owner_hash: oh, date, user_text: cleanMessage, ai_reply: reply }));
    res.json({ ok: true, reply, provider: result.provider, warning: result.warning, state: await daySummary(oh, date) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI chat failed", details: e.message });
  }
});

app.post("/api/photos/:id/analyze", async (req, res) => {
  try {
    const oh = ownerHash(req);
    const photo = await sbSingle(supabase.from("progress_photos").select("*").eq("owner_hash", oh).eq("id", req.params.id), null);
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    const fallback = "Slika je sačuvana, ali u free/cloud verziji vision analiza zavisi od podešenog Gemini/Groq/OpenAI vision modela. Za poređenje koristi isto svetlo, ugao i pozu.";
    await sbRun(supabase.from("progress_photos").update({ ai_comment: fallback }).eq("owner_hash", oh).eq("id", photo.id));
    res.json({ ok: true, comment: fallback, provider: "mock", state: await daySummary(oh, photo.date) });
  } catch (e) { res.status(500).json({ error: "Photo analysis failed", details: e.message }); }
});

app.get("/api/analytics", async (req, res) => { try { const oh = ownerHash(req); const days = Math.max(1, Math.min(90, Number(req.query.days || 7))); const date = req.query.date || todayISO(); res.json({ analytics: await analyticsForRange(oh, days, date), exerciseProgress: await exerciseProgress(oh, 200) }); } catch (e) { res.status(500).json({ error: "Analytics failed", details: e.message }); } });
app.post("/api/ai/progress", async (req, res) => { try { const oh = ownerHash(req); const { date = todayISO(), days = 7 } = req.body; const analytics = await analyticsForRange(oh, Number(days), date); const progress = await exerciseProgress(oh, 100); const messages = [{ role: "system", content: "Ti si fitness coach. Analiziraj proces kroz dane na srpskom: 3-5 zaključaka i 3 naredna koraka." }, { role: "user", content: JSON.stringify({ profile: await getProfile(oh), analytics, progress: progress.slice(0, 12) }, null, 2) }]; const result = await providerText(messages, oh, async () => `Mock analiza: ${analytics.days} dana, prosek ${Math.round(analytics.avg.kcal)} kcal i ${Math.round(analytics.avg.protein)}g proteina. Treninga: ${analytics.totals.workouts}.`); res.json({ ok: true, reply: result.text, provider: result.provider, analytics }); } catch (e) { res.status(500).json({ error: "Progress failed", details: e.message }); } });

app.put("/api/meal/:id", async (req, res) => { try { const oh = ownerHash(req); const b = req.body; const total = b.items?.reduce((a, x) => ({ kcal: a.kcal + Number(x.kcal || 0), protein: a.protein + Number(x.protein || 0), carbs: a.carbs + Number(x.carbs || 0), fat: a.fat + Number(x.fat || 0) }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }) || { kcal: b.total_kcal || 0, protein: b.total_protein || 0, carbs: b.total_carbs || 0, fat: b.total_fat || 0 }; const meal = await sbRun(supabase.from("meals").update({ raw_text: b.raw_text || "Izmenjen unos", summary: b.summary || "Izmenjen unos", total_kcal: total.kcal, total_protein: total.protein, total_carbs: total.carbs, total_fat: total.fat }).eq("owner_hash", oh).eq("id", req.params.id).select("*").single()); await sbRun(supabase.from("meal_items").delete().eq("owner_hash", oh).eq("meal_id", req.params.id)); if (b.items?.length) await sbRun(supabase.from("meal_items").insert(b.items.map(i => ({ owner_hash: oh, meal_id: req.params.id, name: i.name, amount_text: i.amount_text || "", grams: i.grams ?? null, kcal: i.kcal || 0, protein: i.protein || 0, carbs: i.carbs || 0, fat: i.fat || 0, confidence: i.confidence ?? 0.6 })))); res.json({ ok: true, state: await daySummary(oh, meal.date) }); } catch (e) { res.status(500).json({ error: "Edit meal failed", details: e.message }); } });
app.put("/api/workout/:id", async (req, res) => { try { const oh = ownerHash(req); const b = req.body; const workout = await sbRun(supabase.from("workouts").update({ raw_text: b.raw_text || "Izmenjen trening", type: b.type || "Trening", summary: b.summary || "Izmenjen trening" }).eq("owner_hash", oh).eq("id", req.params.id).select("*").single()); await sbRun(supabase.from("workout_exercises").delete().eq("owner_hash", oh).eq("workout_id", req.params.id)); if (b.exercises?.length) await sbRun(supabase.from("workout_exercises").insert(b.exercises.map(e => ({ owner_hash: oh, workout_id: req.params.id, name: e.name, sets: e.sets ?? null, reps: e.reps ?? null, weight_kg: e.weight_kg ?? null, duration_min: e.duration_min ?? null, notes: e.notes || "" })))); res.json({ ok: true, state: await daySummary(oh, workout.date) }); } catch (e) { res.status(500).json({ error: "Edit workout failed", details: e.message }); } });

app.get("/api/foods", async (req, res) => { try { res.json({ foods: await catalogFoods(ownerHash(req)) }); } catch (e) { res.status(500).json({ error: "Foods failed", details: e.message }); } });
app.post("/api/foods", async (req, res) => { try { const oh = ownerHash(req); const b = req.body; if (!b.name) return res.status(400).json({ error: "name required" }); const aliases = Array.isArray(b.aliases) ? b.aliases : String(b.aliases || b.name).split(",").map(x => x.trim()).filter(Boolean); await sbRun(supabase.from("food_catalog").upsert({ owner_hash: oh, name: b.name, aliases, kcal_per_100g: b.kcal_per_100g || null, protein_per_100g: b.protein_per_100g || null, carbs_per_100g: b.carbs_per_100g || 0, fat_per_100g: b.fat_per_100g || 0, kcal_per_unit: b.kcal_per_unit || null, protein_per_unit: b.protein_per_unit || null, carbs_per_unit: b.carbs_per_unit || 0, fat_per_unit: b.fat_per_unit || 0, default_amount: b.default_amount || 100, default_unit: b.default_unit || "g", updated_at: nowIso() }, { onConflict: "owner_hash,name" })); res.json({ ok: true, foods: await catalogFoods(oh) }); } catch (e) { res.status(500).json({ error: "Add food failed", details: e.message }); } });
app.delete("/api/foods/:id", async (req, res) => { try { const oh = ownerHash(req); await sbRun(supabase.from("food_catalog").delete().eq("owner_hash", oh).eq("id", req.params.id)); res.json({ ok: true, foods: await catalogFoods(oh) }); } catch (e) { res.status(500).json({ error: "Delete food failed", details: e.message }); } });
app.get("/api/settings", async (req, res) => { try { res.json(await settingsForClient(ownerHash(req))); } catch (e) { res.status(500).json({ error: "Settings failed", details: e.message }); } });
app.put("/api/settings", async (req, res) => { try { const oh = ownerHash(req); const allowed = ["ai_provider", "ai_fallback_provider", "groq_text_model", "groq_vision_model", "gemini_text_model", "gemini_vision_model", "openai_text_model", "openai_vision_model"]; for (const key of allowed) if (req.body[key] != null) await upsertSetting(oh, key, req.body[key]); res.json(await settingsForClient(oh)); } catch (e) { res.status(500).json({ error: "Settings update failed", details: e.message }); } });

app.get("/api/export", async (req, res) => { try { const oh = ownerHash(req); const tables = ["profile", "weights", "meals", "meal_items", "workouts", "workout_exercises", "progress_photos", "ai_notes", "ai_memory", "food_catalog", "app_settings"]; const out = { exported_at: nowIso(), version: "2.7-cloud" }; for (const t of tables) out[t] = await sbAll(supabase.from(t).select("*").eq("owner_hash", oh)); res.json(out); } catch (e) { res.status(500).json({ error: "Export failed", details: e.message }); } });
app.post("/api/import", async (req, res) => { res.status(501).json({ error: "Cloud import is intentionally disabled in this free version. Use Supabase backup/export or contact the developer to migrate manually." }); });

app.listen(PORT, "0.0.0.0", () => console.log(`Fitness AI cloud server running on http://0.0.0.0:${PORT}`));
