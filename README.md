# 🏥 MediPulse | Hospital DBMS RAG Frontend

A clean, modern, single-page web interface for a **Hospital Management System** powered by a **Retrieval-Augmented Generation (RAG)** backend.

The frontend sends questions to this project's local RAG adapter, streams pipeline progress into the chat, and displays the generated answer. The current database includes patients, doctors, appointments, treatments, billing, and X-ray records.

---

## 🚀 Quickstart (How to Run)

Run the RAG adapter and frontend in separate terminals. Start the adapter from the `DBMS` folder after activating the project virtual environment:

```powershell
.\venv\Scripts\Activate.ps1
uvicorn api_server:app --host 127.0.0.1 --port 8000
```

In a second terminal at the project root, run:

```powershell
python -m http.server 3000
```

Open `http://localhost:3000`. PostgreSQL, Ollama, the configured Gemini API key, and the required Python packages must be available for the pipeline to answer.

### Alternative: VS Code Live Server
Right-click `index.html` in VS Code and select **"Open with Live Server"**. Keep the RAG adapter running.

> The frontend is configured for this local RAG adapter. The generic API settings, mock mode, and citation display described in older sections below are not part of the current UI.

---

## Legacy generic backend configuration (not used by this frontend)

The settings instructions below describe an older generic frontend mode. The current UI uses the local RAG adapter shown in Quickstart and does not expose these options.

1. **Switch Mode**: Select **"Live Backend Server"**.
2. **Backend Endpoint URL**: Enter your backend API URL (e.g., `http://localhost:8000/api/rag/query`).
3. **Request Text Key**: Select your preferred JSON payload schema:
   - `{"query": "your text"}` (Default)
   - `{"text": "your text"}`
   - `{"prompt": "your text"}`
   - `{"message": "your text"}`
   - `Raw String` (plain text body)
4. **Auth Header (Optional)**: If your backend requires tokens (e.g., `Bearer ey...` or an API key).
5. Click **"Save Settings"**.

---

## 📡 Optional Backend Integration Examples

These are reference snippets only; they are not used by the current frontend.

### 1. Python FastAPI Backend Example (`main.py`)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# Allow CORS so the frontend can query the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

class Citation(BaseModel):
    table: str
    id: str
    score: Optional[str] = "0.95"
    content: str

class RAGResponse(BaseModel):
    answer: str
    citations: List[Citation] = []

@app.post("/api/rag/query", response_model=RAGResponse)
async def query_rag(req: QueryRequest):
    user_query = req.query
    
    # 1. Your Vector Search / SQL Database retrieval:
    # retrieved_chunks = dbms_retriever.retrieve(user_query)
    
    # 2. Your LLM Generation:
    # answer = llm_chain.generate(user_query, retrieved_chunks)
    
    return {
        "answer": f"Retrieved response for: {user_query}",
        "citations": [
            {
                "table": "patients",
                "id": "PAT-10482",
                "score": "0.98",
                "content": "patient_id: 10482 | diagnosis: Acute Bronchitis | bed: GW-114"
            }
        ]
    }
```

### 2. Python Flask Backend Example (`app.py`)
```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin requests

@app.route("/api/rag/query", methods=["POST"])
def rag_query():
    data = request.get_json()
    user_query = data.get("query", "")
    
    # Execute your DBMS RAG pipeline here
    answer = "Response from Hospital DBMS..."
    
    return jsonify({
        "answer": answer,
        "citations": [
            {"table": "beds", "id": "ICU-08", "score": "0.96", "content": "ICU Bed #8 Available"}
        ]
    })

if __name__ == "__main__":
    app.run(port=8000, debug=True)
```

---

## ✨ Features Included

- 🖥️ **Clean Single-Page Interface**: Clean medical slate/teal palette with responsive mobile and desktop support.
- ⚡ **Dynamic Text Submission**: Auto-expanding text console with `Enter` to submit and `Shift+Enter` for multiline queries.
- 🔄 **Live Pipeline Activity**: Shows progress printed by the RAG pipeline while it runs; the answer appears when generation completes.
- 🏥 **Project Database Scope**: Patients, doctors, appointments, treatments, billing, and X-ray records.
- 🌙 **Dark & Light Mode**: Instant theme switching with persistent local storage.
- 🔒 **Secure Markdown & Table Parser**: Formats bullet points, clinical data tables, bolding, and code snippets safely via DOMPurify.
