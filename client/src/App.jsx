import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Camera,
  ChevronRight,
  Dumbbell,
  Flame,
  Image as ImageIcon,
  LineChart,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  User,
  Weight,
  Zap
} from "lucide-react";

const defaultApiBase = (() => {
  if (import.meta.env?.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  if (window.location.port === "5173") return "http://localhost:3001/api";
  return `${window.location.origin}/api`;
})();
const API = defaultApiBase;
const ASSET_BASE = API.replace(/\/api\/?$/, "");
const SYNC_KEY_STORAGE = "fitness_ai_sync_key";
const getStoredSyncKey = () => localStorage.getItem(SYNC_KEY_STORAGE) || "";
const nativeFetch = window.fetch.bind(window);
async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const syncKey = getStoredSyncKey();
  if (syncKey) headers.set("x-sync-key", syncKey);
  return nativeFetch(url, { ...options, headers });
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = d => new Date(d).toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "numeric" });
const n = v => Math.round(Number(v || 0));
const oneDecimal = v => Number(v || 0).toFixed(1);

const QUICK_FOODS = [
  { name: "Piletina", amount_text: "100g", grams: 100, kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: "Juneće meso", amount_text: "100g", grams: 100, kcal: 250, protein: 26, carbs: 0, fat: 15 },
  { name: "Tunjevina", amount_text: "100g", grams: 100, kcal: 116, protein: 26, carbs: 0, fat: 1 },
  { name: "Tost hleb", amount_text: "1 kriška", grams: 30, kcal: 70, protein: 2.5, carbs: 13, fat: 1 },
  { name: "Whey", amount_text: "1 porcija", grams: 30, kcal: 120, protein: 25, carbs: 2, fat: 1.5 },
  { name: "Jogurt 3.2%", amount_text: "200ml", grams: 200, kcal: 120, protein: 7, carbs: 9, fat: 6 },
  { name: "Mleko", amount_text: "300ml", grams: 300, kcal: 150, protein: 10, carbs: 15, fat: 5 },
  { name: "Banana", amount_text: "1 kom", grams: 120, kcal: 90, protein: 1, carbs: 23, fat: 0.3 },
  { name: "Pirinač kuvan", amount_text: "150g", grams: 150, kcal: 170, protein: 4, carbs: 38, fat: 0.5 },
  { name: "Pasulj kuvani", amount_text: "300g", grams: 300, kcal: 360, protein: 24, carbs: 60, fat: 1.5 }
];

const STARTER_PROMPTS = [
  "96.4kg jutros, jeo sam 300g piletine, 4 tosta i jogurt",
  "bench 80 4x8 incline 60 3x10 lateral 12 4x15",
  "Šta da jedem večeras ako mi fali protein?"
];


function normalizeForCoach(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function looksLikeLogInput(text = "") {
  const t = normalizeForCoach(text);
  if (!t) return false;

  const isReset = /\b(reset|resetuj|restartuj|ocisti|obrisi|izbrisi|ponisti)\b/.test(t);
  if (isReset) return true;

  const hasQuestionMark = text.includes("?");
  const startsLikeQuestion = /^(sta|kako|koliko|zasto|da li|jel|je l|moze li|treba li|sme li|koji|koja|koje)\b/.test(t);
  const asksForAdvice = /\b(preporuci|predlozi|objasni|pomozi|savet|savjet|mislis|treba|bolje|najbolje|zasto|kako)\b/.test(t);

  const hasFoodAmount = /\b\d+(?:[.,]\d+)?\s?(g|gr|gram|grama|kg|kcal|cal|kalorij|ml|l)\b/.test(t);
  const hasMealVerb = /\b(jeo|jela|pojeo|pojela|popio|popila|uzeo|uzela|dorucak|rucak|vecera|uzina)\b/.test(t);
  const hasKnownFood = /\b(piletin|curetin|junetin|tuna|tunjevin|whey|protein|tost|hleb|jogurt|mleko|banana|pirinac|pirinac|pasta|ovs|jaje|jaja|krompir|pasulj|salat|pljeskavic|prasetin)\b/.test(t);

  const hasWorkoutTerms = /\b(bench|benc|cucanj|squat|rdl|deadlift|mrtvo|lat|row|veslanje|curl|potisak|trcanje|trcao|set|serij|ponavlj|reps|kg)\b/.test(t);
  const hasWorkoutNumbers = /\b\d+\s?(x|kg|km|min|h)\b|\b\d+\s+\d+\s?x\s?\d+\b/.test(t);
  const hasWeightLog = /\b\d{2,3}(?:[.,]\d)?\s?kg\b/.test(t) && /\b(jutros|tezina|tezak|vaga|vagao|vagala)\b/.test(t);

  const looksLikeMealLog = (hasFoodAmount && hasKnownFood) || (hasMealVerb && hasKnownFood);
  const looksLikeWorkoutLog = hasWorkoutTerms && hasWorkoutNumbers;
  const looksLikeDataLog = hasWeightLog || looksLikeMealLog || looksLikeWorkoutLog;

  if (!looksLikeDataLog) return false;
  return !(hasQuestionMark || startsLikeQuestion || asksForAdvice);
}

export default function App() {
  const [tab, setTab] = useState("coach");
  const [date, setDate] = useState(todayISO());
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState([]);
  const [profileDraft, setProfileDraft] = useState(null);
  const [weightInput, setWeightInput] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoNote, setPhotoNote] = useState("");
  const [progressReply, setProgressReply] = useState("");
  const [progressBusy, setProgressBusy] = useState(false);
  const [foodDraft, setFoodDraft] = useState({ name: "", aliases: "", kcal_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fat_per_100g: "", default_amount: 100, default_unit: "g" });
  const [syncKeyInput, setSyncKeyInput] = useState(getStoredSyncKey());
  const [installHint, setInstallHint] = useState("");
  const importRef = useRef(null);
  const fileRef = useRef(null);
  const chatEnd = useRef(null);

  async function load(selected = date) {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`${API}/state?date=${selected}`);
      if (!res.ok) throw new Error(`Backend error ${res.status}`);
      const json = await res.json();
      setState(json);
      setProfileDraft(json.profile);
    } catch (error) {
      console.error(error);
      const authText = error?.message?.includes("401") ? " Sync key nije ispravan ili nije upisan." : "";
      setLoadError(`Ne mogu da učitam bazu.${authText} Proveri backend/API URL i server.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(date).catch(console.error); }, [date]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, aiBusy]);

  const p = state?.profile;
  const totals = state?.totals || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const latestWeight = state?.latestWeight?.weight_kg || p?.start_weight || 0;
  const weightDiff = latestWeight && p?.start_weight ? (latestWeight - p.start_weight).toFixed(1) : "0.0";
  const toGoal = latestWeight && p?.goal_weight ? (latestWeight - p.goal_weight).toFixed(1) : "—";
  const kcalLeft = Math.max(0, Number(p?.calorie_goal || 0) - Number(totals.kcal || 0));
  const proteinLeft = Math.max(0, Number(p?.protein_goal || 0) - Number(totals.protein || 0));
  const chartPoints = useMemo(() => makeChart(state?.weights || []), [state]);
  const seven = state?.analytics?.seven;
  const thirty = state?.analytics?.thirty;
  const exerciseProgress = state?.exerciseProgress || [];
  const foodCatalog = state?.foodCatalog || [];

  async function analyzeProgress(days = 7) {
    setProgressBusy(true);
    setProgressReply("");
    try {
      const res = await apiFetch(`${API}/ai/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, days })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.details || json.error || "Progress analysis failed");
      setProgressReply(json.reply);
      setChat(c => [...c, { role: "user", text: `Analiziraj mi poslednjih ${days} dana` }, { role: "assistant", text: json.reply }]);
    } catch (error) {
      setProgressReply(`Greška: ${error.message}`);
    } finally {
      setProgressBusy(false);
    }
  }

  async function editMealPrompt(meal) {
    const itemsText = meal.items?.map(i => `${i.name};${i.amount_text};${i.grams ?? ""};${i.kcal};${i.protein};${i.carbs};${i.fat}`).join("\n") || "";
    const edited = window.prompt(
      "Izmeni obrok. Format po liniji: naziv;kolicina;grami;kcal;protein;UH;masti",
      itemsText
    );
    if (edited == null) return;
    const items = edited.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const [name, amount_text, grams, kcal, protein, carbs, fat] = line.split(";").map(x => x?.trim());
      return { name, amount_text, grams: grams ? Number(grams) : null, kcal: Number(kcal || 0), protein: Number(protein || 0), carbs: Number(carbs || 0), fat: Number(fat || 0), confidence: 1 };
    });
    await apiFetch(`${API}/meal/${meal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: meal.raw_text, summary: "Ručna izmena", items })
    });
    await load(date);
  }

  async function editWorkoutPrompt(workout) {
    const itemsText = workout.exercises?.map(e => `${e.name};${e.sets ?? ""};${e.reps ?? ""};${e.weight_kg ?? ""};${e.duration_min ?? ""};${e.notes || ""}`).join("\n") || "";
    const edited = window.prompt(
      "Izmeni trening. Format po liniji: vežba;serije;ponavljanja;kg;min;napomena",
      itemsText
    );
    if (edited == null) return;
    const exercises = edited.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const [name, sets, reps, weight_kg, duration_min, notes] = line.split(";").map(x => x?.trim());
      return { name, sets: sets ? Number(sets) : null, reps: reps ? Number(reps) : null, weight_kg: weight_kg ? Number(weight_kg) : null, duration_min: duration_min ? Number(duration_min) : null, notes: notes || "" };
    });
    await apiFetch(`${API}/workout/${workout.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: workout.raw_text, type: workout.type, summary: "Ručna izmena", exercises })
    });
    await load(date);
  }

  async function saveCustomFood(e) {
    e?.preventDefault();
    if (!foodDraft.name.trim()) return;
    await apiFetch(`${API}/foods`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...foodDraft,
        aliases: foodDraft.aliases || foodDraft.name,
        kcal_per_100g: foodDraft.kcal_per_100g ? Number(foodDraft.kcal_per_100g) : null,
        protein_per_100g: foodDraft.protein_per_100g ? Number(foodDraft.protein_per_100g) : null,
        carbs_per_100g: foodDraft.carbs_per_100g ? Number(foodDraft.carbs_per_100g) : 0,
        fat_per_100g: foodDraft.fat_per_100g ? Number(foodDraft.fat_per_100g) : 0,
        default_amount: Number(foodDraft.default_amount || 100)
      })
    });
    setFoodDraft({ name: "", aliases: "", kcal_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fat_per_100g: "", default_amount: 100, default_unit: "g" });
    await load(date);
  }

  async function deleteCustomFood(id) {
    if (!window.confirm("Obrisati ovu namirnicu iz lokalne baze?")) return;
    await apiFetch(`${API}/foods/${id}`, { method: "DELETE" });
    await load(date);
  }

  async function setAiProvider(provider) {
    await apiFetch(`${API}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_provider: provider, ai_fallback_provider: "mock" })
    });
    await load(date);
    alert(`AI provider je podešen na ${provider}. Ako si menjao API key u .env, restartuj server.`);
  }

  function saveSyncKey() {
    const clean = syncKeyInput.trim();
    if (clean) localStorage.setItem(SYNC_KEY_STORAGE, clean);
    else localStorage.removeItem(SYNC_KEY_STORAGE);
    alert(clean ? "Sync key je sačuvan na ovom uređaju." : "Sync key je obrisan sa ovog uređaja.");
    load(date).catch(console.error);
  }

  async function copySyncSetup() {
    const clean = syncKeyInput.trim() || getStoredSyncKey();
    const url = `${window.location.origin}${window.location.pathname}${clean ? `?syncKey=${encodeURIComponent(clean)}` : ""}`;
    await navigator.clipboard?.writeText(url);
    alert("Link za povezivanje uređaja je kopiran. Otvori ga na telefonu/računaru koji želiš da povežeš.");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keyFromUrl = params.get("syncKey");
    if (keyFromUrl) {
      localStorage.setItem(SYNC_KEY_STORAGE, keyFromUrl);
      setSyncKeyInput(keyFromUrl);
      params.delete("syncKey");
      const cleanQuery = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`);
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      window.deferredPwaPrompt = event;
      setInstallHint("Aplikacija može da se instalira na ovaj uređaj.");
    });
  }, []);

  async function installPwa() {
    if (window.deferredPwaPrompt) {
      window.deferredPwaPrompt.prompt();
      await window.deferredPwaPrompt.userChoice;
      window.deferredPwaPrompt = null;
      setInstallHint("");
      return;
    }
    alert("Na iPhone-u otvori Share dugme u Safari-ju i izaberi Add to Home Screen. Na desktopu koristi Install opciju u address bar-u browsera.");
  }

  async function downloadBackup() {
    const res = await apiFetch(`${API}/export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitness-ai-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Import će zameniti trenutne podatke u bazi. Nastaviti?")) return;
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await apiFetch(`${API}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`Import nije uspeo: ${json.details || json.error || res.status}`);
      return;
    }
    await load(date);
    alert("Backup je uspešno importovan.");
  }

  async function submitCoachText(text, options = {}) {
    const clean = text?.trim();
    if (!clean || aiBusy) return;

    const isLogInput = looksLikeLogInput(clean);
    const statusText = options.status || (isLogInput
      ? "Prepoznajem unos i ažuriram dnevnik..."
      : "Razmišljam kao coach i gledam tvoj kontekst...");

    options.clear?.();
    setAiBusy(true);
    setChat(c => [
      ...c,
      { role: "user", text: clean },
      { role: "assistant", text: statusText }
    ]);

    try {
      const recentHistory = chat
        .filter(m => m.text && !m.text.startsWith("Greška:"))
        .slice(-10)
        .map(m => ({ role: m.role, text: m.text }));

      const res = await apiFetch(`${API}${isLogInput ? "/ai/log" : "/ai/chat"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogInput
          ? { text: clean, date }
          : { message: clean, date, history: recentHistory })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.details || json.error || "AI error");

      const fallbackReply = isLogInput ? "Ažurirao sam dnevnik." : "Evo mog odgovora.";
      setChat(c => [...c.slice(0, -1), { role: "assistant", text: json.reply || fallbackReply }]);
      if (isLogInput || json.state) await load(date);
    } catch (err) {
      setChat(c => [...c.slice(0, -1), { role: "assistant", text: `Greška: ${err.message}. Proveri AI provider/API key na backendu. Ako je limit potrošen, aplikacija može da koristi mock fallback.` }]);
    } finally {
      setAiBusy(false);
    }
  }

  async function coachSubmit(e) {
    e?.preventDefault();
    await submitCoachText(chatInput, { clear: () => setChatInput("") });
  }

  async function saveProfile() {
    if (!profileDraft) return;
    const body = {
      ...profileDraft,
      age: Number(profileDraft.age),
      height_cm: Number(profileDraft.height_cm),
      start_weight: Number(profileDraft.start_weight),
      goal_weight: Number(profileDraft.goal_weight),
      calorie_goal: Number(profileDraft.calorie_goal),
      protein_goal: Number(profileDraft.protein_goal)
    };
    const res = await apiFetch(`${API}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    setState(s => ({ ...s, profile: json }));
    setProfileDraft(json);
  }

  async function addWeight(e) {
    e.preventDefault();
    if (!weightInput) return;
    await apiFetch(`${API}/weight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, weight_kg: Number(weightInput) })
    });
    setWeightInput("");
    await load(date);
  }

  async function quickFood(food) {
    await apiFetch(`${API}/meal/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, raw_text: `${food.amount_text} ${food.name}`, items: [{ ...food, confidence: 1 }] })
    });
    await load(date);
  }

  async function deleteMeal(id) {
    await apiFetch(`${API}/meal/${id}`, { method: "DELETE" });
    await load(date);
  }

  async function deleteWorkout(id) {
    await apiFetch(`${API}/workout/${id}`, { method: "DELETE" });
    await load(date);
  }

  async function uploadPhoto(e) {
    e?.preventDefault();
    if (!photoFile) return;
    const fd = new FormData();
    fd.append("photo", photoFile);
    fd.append("date", date);
    fd.append("note", photoNote);
    await apiFetch(`${API}/photos`, { method: "POST", body: fd });
    setPhotoFile(null);
    setPhotoNote("");
    if (fileRef.current) fileRef.current.value = "";
    await load(date);
  }

  async function analyzePhoto(id) {
    setAiBusy(true);
    try {
      await apiFetch(`${API}/photos/${id}/analyze`, { method: "POST" });
      await load(date);
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) return <div className="shell"><div className="loader">Učitavam lokalnu bazu...</div></div>;
  if (loadError || !state) {
    return (
      <div className="shell">
        <div className="panel errorPanel">
          <h2>Greška pri učitavanju</h2>
          <p className="muted">{loadError || "Nema odgovora iz backend-a."}</p>
          <button onClick={() => load(date)}><RefreshCw size={18} /> Pokušaj ponovo</button>
        </div>
      </div>
    );
  }

  const tabs = [
    ["coach", "Coach", MessageCircle],
    ["food", "Ishrana", Flame],
    ["training", "Trening", Dumbbell],
    ["profile", "Profil", User]
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Fitness AI</div>
          <h1>{tabs.find(t => t[0] === tab)?.[1]}</h1>
        </div>
        <div className="datebox">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <b>{latestWeight ? `${latestWeight} kg` : "—"}</b>
          {state?.ai?.provider && <small className="providerBadge">{state.ai.provider}{state.ai.fallbackProvider ? ` → ${state.ai.fallbackProvider}` : ""}</small>}
        </div>
      </header>

      <main>
        {tab === "coach" && (
          <section className="coachPage fade">
            <DailyStrip totals={totals} profile={p} latestWeight={latestWeight} workouts={state.workouts} />

            <div className="chatBox panelFlush">
              {chat.length === 0 && (
                <div className="emptyChat">
                  <div className="orb"><Bot size={34} /></div>
                  <h2>Piši kao ChatGPT-u</h2>
                  <p>Hrana, trening, kilaža ili pitanje — AI pokušava da razume unos, upiše podatke u bazu i odmah osveži ostale tabove.</p>
                  <div className="promptGrid">
                    {STARTER_PROMPTS.map(prompt => (
                      <button key={prompt} onClick={() => setChatInput(prompt)}>{prompt}<ChevronRight size={15} /></button>
                    ))}
                  </div>
                </div>
              )}
              {chat.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
              <div ref={chatEnd} />
            </div>

            <form className="composer" onSubmit={coachSubmit}>
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Unesi bilo šta: hranu, trening, kg ili pitanje..."
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    coachSubmit(e);
                  }
                }}
              />
              <button disabled={aiBusy || !chatInput.trim()}><Send size={18} /></button>
            </form>
          </section>
        )}

        {tab === "food" && (
          <section className="fade">
            <div className="macroHero">
              <Ring label="Kalorije" value={n(totals.kcal)} goal={p.calorie_goal} unit="kcal" />
              <Ring label="Proteini" value={n(totals.protein)} goal={p.protein_goal} unit="g" accent="green" />
            </div>

            <div className="cards2">
              <MacroCard label="Ugljeni hidrati" value={`${n(totals.carbs)}g`} sub="ukupno danas" />
              <MacroCard label="Masti" value={`${n(totals.fat)}g`} sub="ukupno danas" />
              <MacroCard label="Preostalo kcal" value={n(kcalLeft)} sub={`${p.calorie_goal} kcal cilj`} />
              <MacroCard label="Preostalo protein" value={`${n(proteinLeft)}g`} sub={`${p.protein_goal}g cilj`} />
            </div>

            <div className="panel callout">
              <Sparkles size={20} />
              <div>
                <h2>Dodavanje hrane ide kroz Coach</h2>
                <p className="muted">Idi na prvi tab i napiši npr. “450g piletine, 4 tosta i jogurt”. Ovaj tab je pregled i korekcija dnevnika.</p>
              </div>
              <button onClick={() => setTab("coach")}>Otvori Coach</button>
            </div>

            <div className="panel">
              <h2>Brzi unos</h2>
              <div className="chips">
                {QUICK_FOODS.map(f => <button key={f.name} onClick={() => quickFood(f)}>{f.name}<small>{f.kcal} kcal · {f.protein}g P</small></button>)}
              </div>
            </div>

            <div className="panel">
              <h2>Obroci za {fmt(date)}</h2>
              {state.meals.length === 0 && <p className="muted">Nema unosa hrane za ovaj dan.</p>}
              {state.meals.map(meal => <MealCard key={meal.id} meal={meal} onEdit={() => editMealPrompt(meal)} onDelete={() => deleteMeal(meal.id)} />)}
            </div>
          </section>
        )}

        {tab === "training" && (
          <section className="fade">
            <div className="trainingHero">
              <div>
                <div className="eyebrow">Današnji trening</div>
                <h2>{state.workouts.length ? `${state.workouts.length} unos${state.workouts.length > 1 ? "a" : ""}` : "Nema treninga"}</h2>
                <p>Dodavanje treninga ide kroz Coach tab, a ovde pratiš dnevnik i brišeš greške.</p>
              </div>
              <button onClick={() => setTab("coach")}><Bot size={18} /> Dodaj kroz AI</button>
            </div>

            <div className="panel">
              <h2>Treninzi {fmt(date)}</h2>
              {state.workouts.length === 0 && <p className="muted">Nema treninga za ovaj dan. Primer za Coach: “bench 80 4x8 incline 60 3x10”.</p>}
              {state.workouts.map(w => <WorkoutCard key={w.id} workout={w} onEdit={() => editWorkoutPrompt(w)} onDelete={() => deleteWorkout(w.id)} />)}
            </div>

            <div className="panel">
              <h2>Progres po vežbama</h2>
              {exerciseProgress.length === 0 && <p className="muted">Još nema dovoljno treninga za progres po vežbama.</p>}
              <div className="exerciseProgressList">
                {exerciseProgress.slice(0, 10).map(ex => (
                  <div key={ex.name} className="exerciseProgressItem">
                    <b>{ex.name}</b>
                    <span>Poslednje: {ex.last?.weight_kg ? `${ex.last.weight_kg}kg ${ex.last.sets || ""}x${ex.last.reps || ""}` : ex.last?.duration_min ? `${ex.last.duration_min} min` : "—"}</span>
                    <small>Najbolji volumen: {ex.bestVolume?.volume ? `${n(ex.bestVolume.volume)}kg` : "—"} · Najveća kilaža: {ex.bestWeight?.weight_kg ? `${ex.bestWeight.weight_kg}kg` : "—"}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Napredak težine</h2>
              <div className="miniStats">
                <MacroCard label="Trenutno" value={`${latestWeight || "—"}kg`} sub="poslednje merenje" />
                <MacroCard label="Od starta" value={`${weightDiff}kg`} sub={`${p.start_weight}kg start`} />
                <MacroCard label="Do cilja" value={`${toGoal}kg`} sub={`${p.goal_weight}kg cilj`} />
              </div>
            </div>
          </section>
        )}

        {tab === "profile" && profileDraft && (
          <section className="fade profileStack">
            <form className="panel rowForm" onSubmit={addWeight}>
              <div>
                <h2>Dnevna težina</h2>
                <p className="muted">Unesi kilažu za izabrani datum. Najbolje ujutru posle WC-a.</p>
              </div>
              <input type="number" step="0.1" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="96.4" />
              <button><Save size={18} /> Sačuvaj</button>
            </form>

            <div className="panel">
              <h2>Graf težine</h2>
              <div className="chart">
                <svg viewBox="0 0 440 160">
                  <path d={chartPoints.path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  {chartPoints.points.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="currentColor" />)}
                </svg>
              </div>
              <div className="list compact">
                {[...(state.weights || [])].reverse().slice(0, 8).map(w => <div key={w.id}><span>{fmt(w.date)}</span><b>{w.weight_kg} kg</b></div>)}
              </div>
            </div>

            <div className="panel profileForm">
              <h2>Moj profil</h2>
              <div className="formGrid">
                <Field label="Ime" value={profileDraft.name} onChange={v => setProfileDraft({ ...profileDraft, name: v })} />
                <Field label="Godine" type="number" value={profileDraft.age} onChange={v => setProfileDraft({ ...profileDraft, age: v })} />
                <Field label="Visina cm" type="number" value={profileDraft.height_cm} onChange={v => setProfileDraft({ ...profileDraft, height_cm: v })} />
                <Field label="Start kg" type="number" value={profileDraft.start_weight} onChange={v => setProfileDraft({ ...profileDraft, start_weight: v })} />
                <Field label="Cilj kg" type="number" value={profileDraft.goal_weight} onChange={v => setProfileDraft({ ...profileDraft, goal_weight: v })} />
                <Field label="Kalorije cilj" type="number" value={profileDraft.calorie_goal} onChange={v => setProfileDraft({ ...profileDraft, calorie_goal: v })} />
                <Field label="Proteini cilj" type="number" value={profileDraft.protein_goal} onChange={v => setProfileDraft({ ...profileDraft, protein_goal: v })} />
              </div>
              <label>Plan treninga<textarea value={profileDraft.training_plan} onChange={e => setProfileDraft({ ...profileDraft, training_plan: e.target.value })} /></label>
              <label>Preferencije / napomene<textarea value={profileDraft.preferences} onChange={e => setProfileDraft({ ...profileDraft, preferences: e.target.value })} /></label>
              <button onClick={saveProfile}><Settings size={18} /> Sačuvaj profil</button>
            </div>

            <div className="panel">
              <h2>Proces kroz dane</h2>
              <div className="analyticsGrid">
                <MacroCard label="7d kcal prosek" value={seven ? n(seven.avg.kcal) : "—"} sub="dnevno" />
                <MacroCard label="7d protein" value={seven ? `${n(seven.avg.protein)}g` : "—"} sub={`${seven?.totals.proteinGoalDays || 0}/7 dana cilj`} />
                <MacroCard label="30d težina" value={thirty?.weight.change != null ? `${thirty.weight.change}kg` : "—"} sub="promena" />
                <MacroCard label="30d treninzi" value={thirty?.totals.workouts || 0} sub="ukupno" />
              </div>
              <button onClick={() => analyzeProgress(14)} disabled={progressBusy}><LineChart size={18} /> AI analiza 14 dana</button>
            </div>

            <form className="panel profileForm" onSubmit={saveCustomFood}>
              <h2>Moje namirnice</h2>
              <p className="muted">Dodaj proizvod koji često jedeš. Mock/local parser i AI kontekst će ga koristiti sledeći put.</p>
              <div className="formGrid">
                <Field label="Naziv" value={foodDraft.name} onChange={v => setFoodDraft({ ...foodDraft, name: v })} />
                <Field label="Alias-i" value={foodDraft.aliases} onChange={v => setFoodDraft({ ...foodDraft, aliases: v })} />
                <Field label="Kcal / 100g" type="number" value={foodDraft.kcal_per_100g} onChange={v => setFoodDraft({ ...foodDraft, kcal_per_100g: v })} />
                <Field label="Protein / 100g" type="number" value={foodDraft.protein_per_100g} onChange={v => setFoodDraft({ ...foodDraft, protein_per_100g: v })} />
                <Field label="UH / 100g" type="number" value={foodDraft.carbs_per_100g} onChange={v => setFoodDraft({ ...foodDraft, carbs_per_100g: v })} />
                <Field label="Masti / 100g" type="number" value={foodDraft.fat_per_100g} onChange={v => setFoodDraft({ ...foodDraft, fat_per_100g: v })} />
              </div>
              <button><Plus size={18} /> Sačuvaj namirnicu</button>
              <div className="foodCatalogList">
                {foodCatalog.slice(0, 24).map(f => <div key={f.id}><span>{f.name}</span><b>{n(f.kcal_per_100g || f.kcal_per_unit)} kcal · {n(f.protein_per_100g || f.protein_per_unit)}g P</b><button type="button" onClick={() => deleteCustomFood(f.id)}><Trash2 size={14}/></button></div>)}
              </div>
            </form>

            <div className="panel">
              <h2>Backup i AI podešavanja</h2>
              <p className="muted">Backup čuva profil, hranu, treninge, kilaže, katalog namirnica i beleške. API key i dalje ostaje u server/.env.</p>
              <div className="syncPanel">
                <h3>PWA / Sync bez naloga</h3>
                <p className="muted">Ako koristiš isti online backend na telefonu i računaru, isti sync key povezuje oba uređaja sa istom bazom.</p>
                <input value={syncKeyInput} onChange={e => setSyncKeyInput(e.target.value)} placeholder="Privatni sync key" />
                <div className="backupActions">
                  <button type="button" onClick={saveSyncKey}><Save size={18} /> Sačuvaj sync key</button>
                  <button type="button" onClick={copySyncSetup}><Upload size={18} /> Kopiraj link za uređaj</button>
                  <button type="button" onClick={installPwa}><Sparkles size={18} /> Instaliraj PWA</button>
                </div>
                {installHint && <p className="muted">{installHint}</p>}
              </div>

              <div className="backupActions">
                <button onClick={downloadBackup}><Upload size={18} /> Export backup</button>
                <button onClick={() => importRef.current?.click()}><Save size={18} /> Import backup</button>
                <input ref={importRef} type="file" accept="application/json" onChange={importBackup} style={{display:"none"}} />
              </div>
              <div className="providerButtons">
                {['groq','gemini','mock','openai'].map(pr => <button key={pr} onClick={() => setAiProvider(pr)}>{pr}</button>)}
              </div>
              <div className="settingsReadout">
                <span>AI provider: <b>{state.ai?.provider}</b></span>
                <span>Fallback: <b>{state.ai?.fallbackProvider}</b></span>
                <span>Groq model: <b>{state.ai?.groqTextModel}</b></span>
                <span>Gemini model: <b>{state.ai?.geminiTextModel}</b></span>
              </div>
            </div>

            <form className="panel" onSubmit={uploadPhoto}>
              <h2>Slike napretka</h2>
              <p className="muted">Isto svetlo, ista poza i isti ugao. AI komentar može pomoći, ali nije merenje procenta masti.</p>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
              <input value={photoNote} onChange={e => setPhotoNote(e.target.value)} placeholder="Napomena: front, side, jutro..." />
              <button disabled={!photoFile}><Upload size={18} /> Upload slike</button>
            </form>

            <div className="photoGrid">
              {(state.allPhotos || []).map(photo => (
                <div className="photoCard" key={photo.id}>
                  <img src={`${ASSET_BASE}/uploads/${photo.filename}`} alt="progress" />
                  <div className="photoMeta"><b>{fmt(photo.date)}</b><span>{photo.note}</span></div>
                  {photo.ai_comment && <p>{photo.ai_comment}</p>}
                  <button onClick={() => analyzePhoto(photo.id)} disabled={aiBusy}><ImageIcon size={16} /> {photo.ai_comment ? "Analiziraj opet" : "AI komentar"}</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <nav>
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function DailyStrip({ totals, profile, latestWeight, workouts }) {
  return (
    <div className="dailyStrip">
      <div><Flame size={18} /><b>{n(totals.kcal)}</b><span>/ {profile.calorie_goal} kcal</span></div>
      <div><Zap size={18} /><b>{n(totals.protein)}g</b><span>/ {profile.protein_goal}g P</span></div>
      <div><Weight size={18} /><b>{latestWeight || "—"}</b><span>kg</span></div>
      <div><Dumbbell size={18} /><b>{workouts.length}</b><span>trening</span></div>
    </div>
  );
}

function Ring({ label, value, goal, unit, accent = "purple" }) {
  const pct = Math.min(value / goal, 1);
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className={`ringCard ${accent}`}>
      <svg viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} className="bg" />
        <circle cx="55" cy="55" r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="ringText"><b>{value}</b><span>{unit}</span></div>
      <h3>{label}</h3><p>{goal} {unit} cilj</p>
    </div>
  );
}

function MacroCard({ label, value, sub }) {
  return <div className="macroCard"><span>{label}</span><b>{value}</b><small>{sub}</small></div>;
}

function Field({ label, value, onChange, type = "text" }) {
  return <label>{label}<input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} /></label>;
}

function MealCard({ meal, onEdit, onDelete }) {
  return (
    <div className="entry">
      <div className="entryHead">
        <div><b>{meal.summary || meal.raw_text}</b><span>{n(meal.total_kcal)} kcal · {n(meal.total_protein)}g P · {n(meal.total_carbs)}g UH · {n(meal.total_fat)}g M</span></div>
        <div className="entryActions"><button onClick={onEdit}>Izmeni</button><button onClick={onDelete}><Trash2 size={16} /></button></div>
      </div>
      {meal.items?.map(i => <div className="subrow" key={i.id}><span>{i.name} {i.amount_text}</span><b>{n(i.kcal)} kcal · {n(i.protein)}g</b></div>)}
    </div>
  );
}

function WorkoutCard({ workout, onEdit, onDelete }) {
  return (
    <div className="entry">
      <div className="entryHead">
        <div><b>{workout.type || "Trening"}</b><span>{workout.summary || workout.raw_text}</span></div>
        <div className="entryActions"><button onClick={onEdit}>Izmeni</button><button onClick={onDelete}><Trash2 size={16} /></button></div>
      </div>
      {workout.exercises?.map(e => <div className="subrow" key={e.id}><span>{e.name}</span><b>{e.duration_min ? `${e.duration_min} min` : `${e.weight_kg || ""}kg ${e.sets || ""}x${e.reps || ""}`}</b></div>)}
    </div>
  );
}

function makeChart(weights) {
  if (!weights?.length) return { path: "", points: [] };
  if (weights.length === 1) return { path: "M 220 80", points: [{ x: 220, y: 80 }] };
  const vals = weights.map(w => Number(w.weight_kg));
  const min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
  const W = 440, H = 160, pad = 20;
  const points = weights.map((w, i) => ({
    x: pad + (i / (weights.length - 1)) * (W - pad * 2),
    y: H - pad - ((Number(w.weight_kg) - min) / (max - min)) * (H - pad * 2)
  }));
  return { points, path: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ") };
}
