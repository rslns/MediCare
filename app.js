/* app.js */

const GROQ_API_KEY = ""; // ← Paste your key (api)
const GROQ_MODEL   = "llama-3.3-70b-versatile";

/* ── DOM refs ── */
const fileInput   = document.getElementById("fileInput");
const uploadBox   = document.getElementById("uploadBox");
const fileOk      = document.getElementById("fileOk");
const analyzeBtn  = document.getElementById("analyzeBtn");
const heroSection = document.getElementById("heroSection");
const loader      = document.getElementById("loader");
const results     = document.getElementById("results");
const langSelect  = document.getElementById("langSelect");
const typeSelect  = document.getElementById("typeSelect");

/* ── State ── */
let extractedText = "";

/* 1. FILE HANDLING */
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  fileOk.classList.remove("hidden");
  fileOk.textContent = "⏳ Extracting text…";
  analyzeBtn.disabled = true;

  try {
    if (file.type === "application/pdf") {
      extractedText = await extractPDF(file);
    } else if (file.type.startsWith("image/")) {
      // For images we pass a note; Groq text API can't see images
      extractedText = await readImageAsBase64Note(file);
    } else {
      extractedText = await file.text();
    }

    if (!extractedText || extractedText.trim().length < 30) {
      throw new Error("Could not extract enough text from the file.");
    }

    fileOk.textContent = "✓ File ready — " + file.name;
    analyzeBtn.disabled = false;
  } catch (err) {
    fileOk.textContent = "⚠ " + err.message + " Try pasting text below.";
    fileOk.style.background = "rgba(248,113,113,0.08)";
    fileOk.style.borderColor = "rgba(248,113,113,0.3)";
    fileOk.style.color = "#f87171";
    showPasteArea();
  }
});

/* Drag-and-drop on upload box */
uploadBox.addEventListener("dragover", (e) => { e.preventDefault(); uploadBox.style.borderColor = "rgba(99,102,241,0.6)"; });
uploadBox.addEventListener("dragleave", () => { uploadBox.style.borderColor = ""; });
uploadBox.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadBox.style.borderColor = "";
  const file = e.dataTransfer.files[0];
  if (file) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event("change")); }
});

/* Extract text from PDF using PDF.js CDN */
async function extractPDF(file) {
  if (!window.pdfjsLib) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((s) => s.str).join(" ") + "\n";
  }
  return text.trim();
}

/*  For image uploads — tell the model we have an image  */
async function readImageAsBase64Note(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      // We can't send the image to Groq's text API, so surface the paste area
      resolve("");
    };
    reader.readAsDataURL(file);
  });
}

/* Dynamic script loader  */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

/*  Manual paste fallback  */
function showPasteArea() {
  if (document.getElementById("pasteArea")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div style="margin-top:12px">
      <div class="ctrl-lbl" style="margin-bottom:6px">Or paste report text here</div>
      <textarea id="pasteArea" placeholder="Paste your medical report text here…"
        style="width:100%;min-height:120px;background:rgba(255,255,255,0.04);
               border:1px solid rgba(255,255,255,0.1);border-radius:10px;
               color:#94a3b8;font-size:0.82rem;padding:12px;
               font-family:'Inter',sans-serif;resize:vertical;outline:none;
               line-height:1.6;"></textarea>
    </div>`;
  document.querySelector(".ctrl-group").after(wrap);

  document.getElementById("pasteArea").addEventListener("input", (e) => {
    extractedText = e.target.value.trim();
    analyzeBtn.disabled = extractedText.length < 30;
    if (extractedText.length >= 30) {
      fileOk.textContent = "✓ Text ready";
      fileOk.style.cssText = "";
      fileOk.classList.remove("hidden");
    }
  });
}

/* 
   2. ANALYZE BUTTON
 */
analyzeBtn.addEventListener("click", async () => {
  if (!extractedText) return;
  showLoader();
  try {
    const json = await callGroq(extractedText, langSelect.value, typeSelect.value);
    renderResults(json);
  } catch (err) {
    showError(err.message);
  }
});

function showLoader() {
  heroSection.classList.add("hidden");
  results.classList.add("hidden");
  loader.classList.remove("hidden");
}

function hideLoader() {
  loader.classList.add("hidden");
}

/*
   3. GROQ API CALL
 */
async function callGroq(reportText, language, reportType) {
  const langInstruction =
    language === "hindi"  ? "Respond entirely in Hindi (Devanagari script)." :
    language === "telugu" ? "Respond entirely in Telugu script." :
                            "Respond in clear, simple English.";

  const prompt = `
You are a medical report explainer. Analyze the following medical report and return ONLY valid JSON with no markdown, no code fences, no explanation.

${langInstruction}

Return this exact JSON structure:
{
  "reportType": "string (e.g. Blood Test, MRI Report, Discharge Summary)",
  "patientName": "string (extract from report, or 'Not specified')",
  "patientInfo": "string (age, gender, date if available, else '')",
  "summary": "string (2-4 sentences plain-language summary of overall health status)",
  "totalParams": number,
  "highCount": number,
  "lowCount": number,
  "normalCount": number,
  "parameters": [
    {
      "name": "parameter name",
      "value": "value with unit (e.g. 12.5 g/dL)",
      "status": "HIGH" | "LOW" | "NORMAL",
      "explanation": "1-2 sentences what this means in plain language"
    }
  ],
  "followUp": "string — recommended follow-up actions or doctor visits",
  "eatMore": ["list of foods/nutrients to eat more of, each as a short sentence"],
  "avoid": ["list of foods/habits to avoid, each as a short sentence"],
  "habits": ["list of lifestyle habits to adopt, each as a short sentence"],
  "askDoctor": ["list of questions or concerns to raise with the doctor"],
  "disclaimer": "string — brief medical disclaimer"
}

Medical report text:
"""
${reportText.slice(0, 6000)}
"""
`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${response.status}. Check your API key.`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from within the string
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI returned an unexpected format. Please try again.");
  }
}

/* 
   4. RENDER RESULTS
 */
function renderResults(d) {
  hideLoader();

  /* Banner */
  document.getElementById("reportTag").textContent  = "📋 " + (d.reportType || "Medical Report");
  document.getElementById("patientName").textContent = d.patientName || "Patient Report";
  document.getElementById("patientInfo").textContent = d.patientInfo || "";

  /* Stats row */
  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card">
      <div class="stat-num stat-red">${d.highCount ?? 0}</div>
      <div class="stat-lbl">High Values</div>
    </div>
    <div class="stat-card">
      <div class="stat-num stat-orange">${d.lowCount ?? 0}</div>
      <div class="stat-lbl">Low Values</div>
    </div>
    <div class="stat-card">
      <div class="stat-num stat-green">${d.normalCount ?? 0}</div>
      <div class="stat-lbl">Normal Values</div>
    </div>`;

  /* Summary */
  document.getElementById("summary").textContent = d.summary || "No summary available.";

  /* Parameters */
  const paramsEl = document.getElementById("parameters");
  if (d.parameters && d.parameters.length) {
    paramsEl.innerHTML = d.parameters.map((p) => `
      <div class="param-card ${p.status}">
        <div class="param-name">${escHtml(p.name)}</div>
        <div class="param-value">${escHtml(p.value)}</div>
        <span class="param-badge badge-${p.status}">${p.status}</span>
        <p class="param-exp">${escHtml(p.explanation || "")}</p>
      </div>`).join("");
  } else {
    paramsEl.innerHTML = `<p style="color:#475569;font-size:0.88rem">No individual parameters detected.</p>`;
  }

  /* Follow up */
  document.getElementById("followUp").textContent = d.followUp || "Consult your doctor for follow-up.";

  /* Tabs */
  renderList("tab-eat",    d.eatMore,    "dot-green");
  renderList("tab-avoid",  d.avoid,      "dot-red");
  renderList("tab-habits", d.habits,     "dot-blue");
  renderList("tab-doctor", d.askDoctor,  "dot-orange");

  /* Disclaimer */
  document.getElementById("disclaimer").textContent =
    d.disclaimer || "⚠ This analysis is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare professional before making health decisions.";

  results.classList.remove("hidden");
  results.scrollIntoView({ behavior: "smooth" });
}

function renderList(tabId, items, dotClass) {
  const el = document.getElementById(tabId);
  if (!items || !items.length) {
    el.innerHTML = `<p style="color:#475569;font-size:0.88rem">No specific recommendations.</p>`;
    return;
  }
  el.innerHTML = `<div class="sug-list">${
    items.map((item) => `
      <div class="sug-item">
        <span class="sug-dot ${dotClass}"></span>
        <p>${escHtml(item)}</p>
      </div>`).join("")
  }</div>`;
}

/* ── Tab switching ── */
window.switchTab = function(name) {
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  event.currentTarget.classList.add("active");
};

/* 
   5. PDF EXPORT
*/
document.getElementById("exportBtn").addEventListener("click", () => {
  if (!window.jspdf) { alert("PDF library not loaded yet, please wait a moment."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const name    = document.getElementById("patientName").textContent;
  const info    = document.getElementById("patientInfo").textContent;
  const summary = document.getElementById("summary").textContent;
  const followUp= document.getElementById("followUp").textContent;
  const disc    = document.getElementById("disclaimer").textContent;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("MedSimplify — Medical Report", 15, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Patient: ${name}`, 15, 32);
  if (info) doc.text(info, 15, 39);

  doc.setFontSize(11);
  doc.text("Summary:", 15, 52);
  const sumLines = doc.splitTextToSize(summary, 180);
  doc.text(sumLines, 15, 58);

  let y = 58 + sumLines.length * 6 + 8;

  // Parameters
  const cards = document.querySelectorAll(".param-card");
  if (cards.length) {
    doc.setFont("helvetica", "bold");
    doc.text("Parameters:", 15, y); y += 6;
    doc.setFont("helvetica", "normal");
    cards.forEach((c) => {
      const n  = c.querySelector(".param-name")?.textContent || "";
      const v  = c.querySelector(".param-value")?.textContent || "";
      const st = c.querySelector(".param-badge")?.textContent || "";
      const ex = c.querySelector(".param-exp")?.textContent  || "";
      if (y > 270) { doc.addPage(); y = 20; }
      const line = `${n}: ${v} [${st}] — ${ex}`;
      const lines = doc.splitTextToSize(line, 180);
      doc.text(lines, 15, y); y += lines.length * 5 + 3;
    });
  }

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.text("Follow-up:", 15, y); y += 6;
  doc.setFont("helvetica", "normal");
  const fuLines = doc.splitTextToSize(followUp, 180);
  doc.text(fuLines, 15, y); y += fuLines.length * 6 + 6;

  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.setTextColor(120);
  const dLines = doc.splitTextToSize(disc, 180);
  doc.text(dLines, 15, y);

  doc.save("MedSimplify_Report.pdf");
});

/* 
   6. ERROR DISPLAY
 */
function showError(msg) {
  hideLoader();
  heroSection.classList.remove("hidden");
  const existing = document.getElementById("errorBanner");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "errorBanner";
  el.style.cssText = `
    background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.25);
    border-radius:14px;padding:16px 20px;color:#f87171;font-size:0.88rem;
    margin-bottom:20px;line-height:1.6;`;
  el.innerHTML = `<strong>⚠ Error:</strong> ${escHtml(msg)}`;
  heroSection.after(el);
}

/*Utility */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}