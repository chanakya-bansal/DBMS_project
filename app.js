/**
 * MediPulse | Hospital DBMS RAG Frontend Logic
 * Supports customizable text payload dispatch to any RAG backend API
 * and an interactive DBMS simulator for instant testing.
 */

// Default Configuration & State
const DEFAULT_CONFIG = {
  mode: 'mock', // 'mock' or 'live'
  apiUrl: 'http://localhost:8000/api/rag/query',
  method: 'POST',
  payloadFormat: 'query', // 'query' | 'text' | 'prompt' | 'message' | 'raw'
  authHeader: '',
  theme: 'light',
};

const STORAGE_KEYS = {
  SETTINGS: 'medipulse_rag_settings_v1',
  HISTORY: 'medipulse_rag_history_v1',
  THEME: 'medipulse_rag_theme_v1'
};

// Application State
let appState = {
  settings: { ...DEFAULT_CONFIG },
  messages: [],
  isLoading: false,
  abortController: null,
};

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const messagesList = document.getElementById('messagesList');
const welcomeHero = document.getElementById('welcomeHero');
const queryInput = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const abortBtn = document.getElementById('abortBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');

// Modals & Controls
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const customApiIndicator = document.getElementById('customApiIndicator');

const modeMockBtn = document.getElementById('modeMockBtn');
const modeLiveBtn = document.getElementById('modeLiveBtn');
const liveBackendFields = document.getElementById('liveBackendFields');
const apiUrlInput = document.getElementById('apiUrlInput');
const apiMethodSelect = document.getElementById('apiMethodSelect');
const payloadFormatSelect = document.getElementById('payloadFormatSelect');
const apiAuthInput = document.getElementById('apiAuthInput');

const infoBtn = document.getElementById('infoBtn');
const infoModal = document.getElementById('infoModal');
const closeInfoModalBtn = document.getElementById('closeInfoModalBtn');
const closeInfoModalBottomBtn = document.getElementById('closeInfoModalBottomBtn');

const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const toastContainer = document.getElementById('toastContainer');

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  loadSavedSettings();
  loadSavedTheme();
  loadSavedHistory();
  initEventListeners();
  updateUIForCurrentMode();
  lucide.createIcons();
});

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (saved) {
      appState.settings = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading settings from localStorage:', e);
  }
}

function saveSettingsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
  } catch (e) {
    console.error('Error saving settings to localStorage:', e);
  }
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);
}

function setTheme(theme) {
  appState.settings.theme = theme;
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    themeIcon.setAttribute('data-lucide', 'sun');
  } else {
    document.documentElement.classList.remove('dark');
    themeIcon.setAttribute('data-lucide', 'moon');
  }
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  lucide.createIcons();
}

function toggleTheme() {
  const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  setTheme(newTheme);
}

function loadSavedHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (saved) {
      appState.messages = JSON.parse(saved);
      renderAllMessages();
    }
  } catch (e) {
    console.error('Error loading history:', e);
    appState.messages = [];
  }
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(appState.messages));
  } catch (e) {
    console.error('Error saving history:', e);
  }
}

// ==================== EVENT LISTENERS ====================

function initEventListeners() {
  // Input auto-resize & keyboard submission
  queryInput.addEventListener('input', autoResizeInput);
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuery();
    }
  });

  // Action buttons
  sendBtn.addEventListener('click', handleSendQuery);
  abortBtn.addEventListener('click', handleAbortQuery);
  clearChatBtn.addEventListener('click', handleClearChat);
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Suggested prompt chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        queryInput.value = prompt;
        autoResizeInput();
        handleSendQuery();
      }
    });
  });

  // Settings Modal events
  settingsBtn.addEventListener('click', openSettingsModal);
  closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
  cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  saveSettingsBtn.addEventListener('click', saveSettingsFromModal);
  testConnectionBtn.addEventListener('click', testApiConnection);

  modeMockBtn.addEventListener('click', () => selectModeInModal('mock'));
  modeLiveBtn.addEventListener('click', () => selectModeInModal('live'));

  // Info / DB Schema Modal events
  infoBtn.addEventListener('click', () => { infoModal.classList.remove('hidden'); infoModal.classList.add('flex'); });
  closeInfoModalBtn.addEventListener('click', () => { infoModal.classList.add('hidden'); infoModal.classList.remove('flex'); });
  closeInfoModalBottomBtn.addEventListener('click', () => { infoModal.classList.add('hidden'); infoModal.classList.remove('flex'); });

  // Close modals on backdrop click
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
    if (e.target === infoModal) {
      infoModal.classList.add('hidden');
      infoModal.classList.remove('flex');
    }
  });
}

function autoResizeInput() {
  queryInput.style.height = 'auto';
  queryInput.style.height = Math.min(queryInput.scrollHeight, 140) + 'px';
}

// ==================== QUERY HANDLING & API DISPATCH ====================

async function handleSendQuery() {
  const queryText = queryInput.value.trim();
  if (!queryText || appState.isLoading) return;

  // Clear input
  queryInput.value = '';
  autoResizeInput();

  // Hide welcome hero if first message
  if (welcomeHero) welcomeHero.classList.add('hidden');

  // Add User Message
  const userMsgId = 'msg-' + Date.now();
  const userMsg = {
    id: userMsgId,
    role: 'user',
    text: queryText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  appState.messages.push(userMsg);
  appendMessageToDOM(userMsg);

  // Add Assistant Placeholder with loading state
  const assistantMsgId = 'msg-' + (Date.now() + 1);
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    text: '',
    citations: [],
    status: 'loading',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  appState.messages.push(assistantMsg);
  appendMessageToDOM(assistantMsg);

  setLoadingState(true);
  scrollToBottom();

  try {
    if (appState.settings.mode === 'live') {
      await fetchLiveRagResponse(queryText, assistantMsgId);
    } else {
      await simulateMockRagResponse(queryText, assistantMsgId);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      updateAssistantMessage(assistantMsgId, {
        text: '_Query was cancelled by user._',
        status: 'complete'
      });
      showToast('Query cancelled', 'info');
    } else {
      console.error('RAG Query Error:', err);
      const errorMsg = `### ⚠️ Backend Connection Failed\n\nCould not receive a response from the RAG backend endpoint at \`${appState.settings.apiUrl}\`.\n\n**Details:** ${err.message || 'Unknown network error'}\n\n> **Tip:** If your backend server is not running yet, open **Settings (⚙️)** in the top right and switch to **Interactive Mock Mode** to test the UI immediately!`;
      updateAssistantMessage(assistantMsgId, {
        text: errorMsg,
        status: 'error'
      });
      showToast('Backend connection failed', 'error');
    }
  } finally {
    setLoadingState(false);
    saveHistoryToStorage();
    scrollToBottom();
  }
}

function handleAbortQuery() {
  if (appState.abortController) {
    appState.abortController.abort();
    appState.abortController = null;
  }
  setLoadingState(false);
}

function setLoadingState(loading) {
  appState.isLoading = loading;
  sendBtn.disabled = loading;
  if (loading) {
    abortBtn.classList.remove('hidden');
    sendBtn.classList.add('hidden');
  } else {
    abortBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
  }
}

// ==================== LIVE API FETCH ====================

async function fetchLiveRagResponse(queryText, assistantMsgId) {
  appState.abortController = new AbortController();
  const { apiUrl, method, payloadFormat, authHeader } = appState.settings;

  let requestBody = null;
  const headers = {};

  if (authHeader && authHeader.trim()) {
    headers['Authorization'] = authHeader.trim();
  }

  // Construct request payload according to configured format
  if (method === 'POST') {
    if (payloadFormat === 'raw') {
      headers['Content-Type'] = 'text/plain';
      requestBody = queryText;
    } else {
      headers['Content-Type'] = 'application/json';
      const payloadObj = {};
      payloadObj[payloadFormat] = queryText;
      requestBody = JSON.stringify(payloadObj);
    }
  }

  let finalUrl = apiUrl;
  if (method === 'GET') {
    const urlObj = new URL(apiUrl, window.location.origin);
    urlObj.searchParams.append('query', queryText);
    finalUrl = urlObj.toString();
  }

  const response = await fetch(finalUrl, {
    method: method,
    headers: headers,
    body: method === 'POST' ? requestBody : undefined,
    signal: appState.abortController.signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let responseText = '';
  let citations = [];

  if (contentType.includes('application/json')) {
    const data = await response.json();
    // Auto-detect response field
    responseText = data.answer || data.response || data.output || data.text || data.result || data.message || JSON.stringify(data, null, 2);
    citations = data.citations || data.sources || data.retrieved_records || data.database_records || [];
  } else {
    responseText = await response.text();
  }

  updateAssistantMessage(assistantMsgId, {
    text: responseText,
    citations: citations,
    status: 'complete'
  });
}

// ==================== REALISTIC MOCK RAG SYSTEM ====================

async function simulateMockRagResponse(queryText, assistantMsgId) {
  // Simulate network retrieval latency (600ms - 1200ms)
  await new Promise(r => setTimeout(r, 800));

  const lower = queryText.toLowerCase();
  let responseText = '';
  let citations = [];

  if (lower.includes('bed') || lower.includes('icu') || lower.includes('ward') || lower.includes('occupancy')) {
    responseText = `### 🏥 Hospital Bed & Ward Status Overview

Based on the real-time query against the **Hospital DBMS (\`BEDS\` & \`WARDS\` tables)**:

* **Total Hospital Bed Capacity:** 450 Beds
* **Total Occupied:** 382 Beds (84.8% Occupancy Rate)
* **Total Available:** 68 Beds

#### Current Availability by Department:

| Ward / Unit | Total Capacity | Occupied | Available | Status |
| :--- | :--- | :--- | :--- | :--- |
| **ICU (Intensive Care Unit)** | 40 | 36 | **4 Beds** | 🟡 Limited |
| **CCU (Cardiac Care Unit)** | 25 | 22 | **3 Beds** | 🟡 Limited |
| **General Male Ward** | 120 | 102 | **18 Beds** | 🟢 Available |
| **General Female Ward** | 120 | 98 | **22 Beds** | 🟢 Available |
| **Pediatric Ward** | 60 | 49 | **11 Beds** | 🟢 Available |
| **Emergency Holding Bay** | 30 | 20 | **10 Beds** | 🟢 Available |

> 📌 **Clinical Note:** ICU Beds #ICU-08, #ICU-14, #ICU-22, and #ICU-39 are sanitized and ready for immediate critical admissions.`;

    citations = [
      {
        table: 'beds',
        id: 'BED-ICU-08',
        score: '0.96',
        content: 'bed_id: 108 | ward_id: 1 (ICU) | type: Ventilator-Equipped | status: Available | floor: 2nd Floor West Wing'
      },
      {
        table: 'wards',
        id: 'WARD-SUMMARY-SQL',
        score: '0.94',
        content: 'SELECT ward_name, COUNT(*) as total, SUM(CASE WHEN status="Occupied" THEN 1 ELSE 0 END) as occupied FROM beds GROUP BY ward_id;'
      }
    ];

  } else if (lower.includes('sharma') || lower.includes('doctor') || lower.includes('opd') || lower.includes('schedule') || lower.includes('duty') || lower.includes('cardiology')) {
    responseText = `### 👨‍⚕️ Doctor Duty & OPD Schedule

Retrieved from **Hospital DBMS (\`DOCTORS\` & \`DUTY_ROSTER\` tables)**:

**Dr. Rajesh Sharma, MD, DM (Cardiology)**
* **Designation:** Senior Consultant Interventional Cardiologist
* **Department:** Department of Cardiology & Catheterization Lab
* **Today's Status:** 🟢 **On Active Duty**

#### Schedule Details:
1. **Morning OPD Clinic:** 09:00 AM – 01:30 PM (OPD Room **#C-204**, 2nd Floor)
2. **Cath Lab & Angioplasty Procedures:** 02:30 PM – 05:00 PM (OT-3)
3. **Evening Rounds / IPD Visit:** 05:30 PM – 07:00 PM (Cardiac Care Ward)
4. **On-Call Emergency Duty:** Yes (Available via Emergency Pager #4402)

> ℹ️ **Next Open Appointment Slot:** Today at 12:45 PM (Slot #18).`;

    citations = [
      {
        table: 'doctors',
        id: 'DOC-CARD-042',
        score: '0.98',
        content: 'doctor_id: 42 | name: Dr. Rajesh Sharma | dept: Cardiology | room_no: C-204 | pager: 4402 | license: MCI-94022'
      },
      {
        table: 'duty_roster',
        id: 'ROSTER-TODAY',
        score: '0.95',
        content: 'roster_id: 8841 | doctor_id: 42 | shift_date: CURRENT_DATE | shift_type: Full Day & Emergency Call'
      }
    ];

  } else if (lower.includes('p-10482') || lower.includes('10482') || lower.includes('patient') || lower.includes('history') || lower.includes('diagnosis')) {
    responseText = `### 📋 Clinical Summary: Patient #P-10482

Retrieved from **Hospital DBMS (\`PATIENTS\`, \`PRESCRIPTIONS\`, & \`LAB_REPORTS\` tables)**:

#### Demographics & Admission:
* **Patient Name:** Marcus Vance
* **Age / Gender:** 54 Years / Male | **Blood Group:** O+
* **Admission Date:** 3 days ago (Bed #GW-114, General Medicine)
* **Attending Physician:** Dr. S. Ananya (Internal Medicine)
* **Primary Diagnosis:** Type 2 Diabetes Mellitus with Acute Exacerbation of Hypertension & Mild Bronchitis.

#### Active Medications (Pharmacy DB):
* **Metformin 500mg:** 1 tablet twice daily with meals.
* **Amlodipine 5mg:** 1 tablet once daily in the morning.
* **Azithromycin 500mg:** 1 tablet once daily for 5 days.

#### Recent Diagnostic Lab Results:
* **HbA1c:** 8.4% *(Elevated)*
* **Fasting Blood Glucose:** 168 mg/dL *(High)*
* **Serum Creatinine:** 0.95 mg/dL *(Normal)*
* **Chest X-Ray (AP View):** Mild bilateral lower lobe bronchial thickening; no consolidations.`;

    citations = [
      {
        table: 'patients',
        id: 'PAT-10482',
        score: '0.99',
        content: 'patient_id: P-10482 | name: Marcus Vance | age: 54 | blood: O+ | ward_bed: GW-114 | admit_status: Inpatient'
      },
      {
        table: 'lab_reports',
        id: 'LAB-2026-904',
        score: '0.93',
        content: 'report_id: 904 | patient_id: P-10482 | test: Comprehensive Metabolic Panel & HbA1c | verified_by: Dr. Pathologist'
      }
    ];

  } else if (lower.includes('pharmacy') || lower.includes('stock') || lower.includes('paracetamol') || lower.includes('ceftriaxone') || lower.includes('drug') || lower.includes('medicine')) {
    responseText = `### 💊 Central Pharmacy Inventory Report

Retrieved from **Hospital DBMS (\`PHARMACY_INVENTORY\` & \`BATCH_RECORDS\` tables)**:

| Medication Name | Form & Strength | Current Stock | Reorder Level | Unit Price | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Paracetamol** | Tablet 500 mg | **14,250 Units** | 2,000 Units | $0.15 | 🟢 Adequate Stock |
| **Ceftriaxone** | Vial 1g (Injectable) | **840 Vials** | 250 Vials | $4.50 | 🟢 Adequate Stock |
| **Insulin Glargine** | 100 IU/mL Pen | **95 Pens** | 100 Pens | $28.00 | 🟡 Reorder Triggered |
| **Salbutamol Inhaler**| 100 mcg / dose | **310 Units** | 150 Units | $6.20 | 🟢 Adequate Stock |

> 📦 **Batch Information:** Ceftriaxone batch #CF-2025B (Exp: Nov 2027) stored in cold-chain room at 2°C–8°C.`;

    citations = [
      {
        table: 'pharmacy_inventory',
        id: 'MED-PAR-500',
        score: '0.97',
        content: 'item_code: MED-1002 | brand: Paracetamol 500mg | stock: 14250 | rack_location: Rack-A4 | supplier: MediPharm Inc'
      },
      {
        table: 'pharmacy_inventory',
        id: 'MED-CEF-1G',
        score: '0.95',
        content: 'item_code: MED-4081 | brand: Ceftriaxone 1g Inj | stock: 840 | cold_chain: YES | min_threshold: 250'
      }
    ];

  } else {
    // General DBMS query fallback
    responseText = `### 🏥 Hospital DBMS Query Result

Your query **"${escapeHtml(queryText)}"** was evaluated against the hospital relational databases and clinical knowledge graph.

#### Retrieved Database Insights:
* **Indexed DBMS Tables Searched:** \`PATIENTS\`, \`DOCTORS\`, \`DEPARTMENTS\`, \`BEDS\`, \`PRESCRIPTIONS\`, \`BILLING\`
* **Database State:** 100% synchronized with PostgreSQL/MySQL hospital server.
* **Match Confidence:** 91.5% semantic similarity match.

#### Summary:
The hospital system is operating under standard protocols. You can query specific details such as:
1. Patient IDs (e.g. \`#P-10482\`, \`#P-10041\`)
2. Doctor schedules and OPD hours (e.g. *Dr. Sharma*, *Cardiology*, *Neurology*)
3. Real-time ICU & General ward bed vacancy counts
4. Pharmacy stock, batch numbers, and reorder levels
5. Clinical diagnostic criteria and admission guidelines.`;

    citations = [
      {
        table: 'hospital_metadata',
        id: 'SYS-DBMS-INDEX',
        score: '0.91',
        content: 'schema_version: 3.4.1 | total_records: 1,248,500 | vector_dimension: 1536 | DBMS: Relational + Vector Index'
      }
    ];
  }

  updateAssistantMessage(assistantMsgId, {
    text: responseText,
    citations: citations,
    status: 'complete'
  });
}

// ==================== DOM RENDERING FUNCTIONS ====================

function renderAllMessages() {
  messagesList.innerHTML = '';
  if (appState.messages.length === 0) {
    if (welcomeHero) welcomeHero.classList.remove('hidden');
  } else {
    if (welcomeHero) welcomeHero.classList.add('hidden');
    appState.messages.forEach(msg => appendMessageToDOM(msg));
  }
  lucide.createIcons();
}

function appendMessageToDOM(msg) {
  const msgEl = document.createElement('div');
  msgEl.id = msg.id;
  msgEl.className = 'message-node animate-fade-in';

  if (msg.role === 'user') {
    msgEl.innerHTML = `
      <div class="flex items-start justify-end gap-3 max-w-3xl ml-auto">
        <div class="flex flex-col items-end">
          <div class="p-4 rounded-2xl rounded-tr-none bg-gradient-to-r from-brand-600 to-teal-600 text-white shadow-md shadow-brand-500/10 text-sm leading-relaxed whitespace-pre-wrap selection:bg-white selection:text-brand-800">
            ${escapeHtml(msg.text)}
          </div>
          <span class="text-[10px] text-slate-400 dark:text-slate-500 mt-1 mr-1">${msg.timestamp || ''}</span>
        </div>
        <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0 shadow-sm">
          <i data-lucide="user" class="w-4 h-4"></i>
        </div>
      </div>
    `;
  } else {
    // Assistant message
    const hasLoading = msg.status === 'loading';
    const contentHtml = hasLoading
      ? `<div class="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm py-2">
          <span class="w-2 h-2 rounded-full bg-brand-500 animate-ping"></span>
          <span>Querying Hospital DBMS & generating RAG response...</span>
        </div>`
      : formatMarkdown(msg.text);

    const citationsHtml = (msg.citations && msg.citations.length > 0)
      ? renderCitationsAccordion(msg.id, msg.citations)
      : '';

    msgEl.innerHTML = `
      <div class="flex items-start gap-3 max-w-4xl mr-auto">
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-brand-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-brand-500/20">
          <i data-lucide="bot" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="p-5 rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm text-slate-800 dark:text-slate-100 text-sm">
            <div class="message-content markdown-body">
              ${contentHtml}
            </div>
            <div class="citations-container mt-4">
              ${citationsHtml}
            </div>
          </div>
          <div class="flex items-center justify-between mt-1.5 px-1">
            <span class="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <i data-lucide="database" class="w-3 h-3 text-brand-500"></i> Grounded via Hospital RAG
            </span>
            <span class="text-[10px] text-slate-400 dark:text-slate-500">${msg.timestamp || ''}</span>
          </div>
        </div>
      </div>
    `;
  }

  messagesList.appendChild(msgEl);
  lucide.createIcons();
}

function updateAssistantMessage(msgId, updates) {
  const index = appState.messages.findIndex(m => m.id === msgId);
  if (index !== -1) {
    appState.messages[index] = { ...appState.messages[index], ...updates };
  }

  const msgEl = document.getElementById(msgId);
  if (msgEl) {
    const contentEl = msgEl.querySelector('.message-content');
    const citationsEl = msgEl.querySelector('.citations-container');
    
    if (contentEl && updates.text !== undefined) {
      contentEl.innerHTML = formatMarkdown(updates.text);
    }
    
    if (citationsEl && updates.citations) {
      citationsEl.innerHTML = renderCitationsAccordion(msgId, updates.citations);
    }
    
    lucide.createIcons();
  }
}

function renderCitationsAccordion(msgId, citations) {
  if (!citations || citations.length === 0) return '';
  const accordionId = `citation-acc-${msgId}`;

  const citationItems = citations.map((c, i) => `
    <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs font-mono">
      <div class="flex items-center justify-between text-[11px] mb-1 font-sans">
        <span class="font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1">
          <i data-lucide="table" class="w-3 h-3"></i> Table: [${escapeHtml(c.table || 'db_record')}] &bull; Record: ${escapeHtml(c.id || '#' + (i+1))}
        </span>
        ${c.score ? `<span class="bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 px-1.5 py-0.2 rounded text-[10px]">Match: ${Math.round(parseFloat(c.score)*100)}%</span>` : ''}
      </div>
      <div class="text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-all text-[11px]">
        ${escapeHtml(typeof c === 'string' ? c : (c.content || c.text || JSON.stringify(c)))}
      </div>
    </div>
  `).join('');

  return `
    <details class="group border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
      <summary class="flex items-center justify-between px-3.5 py-2 cursor-pointer select-none text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition">
        <span class="flex items-center gap-1.5">
          <i data-lucide="file-check-2" class="w-3.5 h-3.5 text-brand-500"></i>
          Retrieved Database Sources (${citations.length})
        </span>
        <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform group-open:rotate-180"></i>
      </summary>
      <div class="p-3 border-t border-slate-200/70 dark:border-slate-800 space-y-2">
        ${citationItems}
      </div>
    </details>
  `;
}

function formatMarkdown(text) {
  if (!text) return '';
  try {
    // Configure marked options
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
    const rawHtml = marked.parse(text);
    return DOMPurify.sanitize(rawHtml);
  } catch (e) {
    console.error('Markdown parsing failed:', e);
    return `<p>${escapeHtml(text)}</p>`;
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function scrollToBottom() {
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 50);
}

function handleClearChat() {
  if (appState.messages.length === 0) return;
  if (confirm('Clear all conversation messages?')) {
    appState.messages = [];
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    renderAllMessages();
    showToast('Chat history cleared', 'info');
  }
}

// ==================== SETTINGS MODAL LOGIC ====================

function openSettingsModal() {
  const { mode, apiUrl, method, payloadFormat, authHeader } = appState.settings;
  selectModeInModal(mode);
  apiUrlInput.value = apiUrl || '';
  apiMethodSelect.value = method || 'POST';
  payloadFormatSelect.value = payloadFormat || 'query';
  apiAuthInput.value = authHeader || '';

  settingsModal.classList.remove('hidden');
  settingsModal.classList.add('flex');
  lucide.createIcons();
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
  settingsModal.classList.remove('flex');
}

function selectModeInModal(mode) {
  if (mode === 'mock') {
    modeMockBtn.className = 'px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition bg-brand-50 dark:bg-brand-950/60 border-brand-500 text-brand-700 dark:text-brand-300';
    modeLiveBtn.className = 'px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800';
  } else {
    modeLiveBtn.className = 'px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition bg-brand-50 dark:bg-brand-950/60 border-brand-500 text-brand-700 dark:text-brand-300';
    modeMockBtn.className = 'px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800';
  }
  modeMockBtn.setAttribute('data-selected', mode === 'mock' ? 'true' : 'false');
  modeLiveBtn.setAttribute('data-selected', mode === 'live' ? 'true' : 'false');
}

function saveSettingsFromModal() {
  const isMock = modeMockBtn.getAttribute('data-selected') === 'true';
  appState.settings.mode = isMock ? 'mock' : 'live';
  appState.settings.apiUrl = apiUrlInput.value.trim() || DEFAULT_CONFIG.apiUrl;
  appState.settings.method = apiMethodSelect.value;
  appState.settings.payloadFormat = payloadFormatSelect.value;
  appState.settings.authHeader = apiAuthInput.value.trim();

  saveSettingsToStorage();
  updateUIForCurrentMode();
  closeSettingsModal();
  showToast('Settings saved successfully', 'success');
}

function updateUIForCurrentMode() {
  if (appState.settings.mode === 'mock') {
    statusBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 transition-all';
    statusText.textContent = 'Mock Demo Active';
    customApiIndicator.classList.add('hidden');
  } else {
    statusBadge.className = 'flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 transition-all';
    statusText.textContent = 'Live Backend API';
    customApiIndicator.classList.remove('hidden');
  }
}

async function testApiConnection() {
  const url = apiUrlInput.value.trim();
  if (!url) {
    showToast('Please provide a valid backend URL', 'error');
    return;
  }

  testConnectionBtn.disabled = true;
  testConnectionBtn.innerHTML = `<span class="w-3 h-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin mr-1"></span> Testing...`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const headers = {};
    if (apiAuthInput.value.trim()) {
      headers['Authorization'] = apiAuthInput.value.trim();
    }

    const testRes = await fetch(url, {
      method: 'OPTIONS',
      headers: headers,
      signal: controller.signal
    }).catch(async () => {
      // Fallback probe with GET or POST with sample test
      return await fetch(url, {
        method: apiMethodSelect.value,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: apiMethodSelect.value === 'POST' ? JSON.stringify({ query: 'ping' }) : undefined,
        signal: controller.signal
      });
    });

    clearTimeout(timeoutId);

    if (testRes.ok || testRes.status === 405 || testRes.status === 422 || testRes.status === 400) {
      showToast(`Server reachable! Status: ${testRes.status}`, 'success');
    } else {
      showToast(`Server responded with HTTP ${testRes.status}`, 'info');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('Connection timed out (>4s)', 'error');
    } else {
      showToast(`Unable to connect: ${err.message}`, 'error');
    }
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.innerHTML = `<i data-lucide="wifi" class="w-4 h-4"></i> Test Connection`;
    lucide.createIcons();
  }
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const typeStyles = {
    info: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white'
  };

  toast.className = `px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 ${typeStyles[type] || typeStyles.info}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  toastContainer.appendChild(toast);

  // Trigger entrance
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Auto dismiss
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
