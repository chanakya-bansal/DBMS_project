# 🏥 MediPulse | Hospital DBMS RAG Frontend

A clean, modern, single-page web interface for a **Hospital Management System** powered by a **Retrieval-Augmented Generation (RAG)** backend.

Users can submit queries in plain text (e.g., patient records, ICU bed availability, doctor on-duty rosters, pharmacy inventory, lab results). The frontend packages and dispatches the query to your backend RAG server via HTTP POST and renders rich answers with interactive database citations.

---

## 🚀 Quickstart (How to Run)

Because this is a zero-dependency modern single-page application, you can run it immediately using any of the following methods:

### Option 1: Direct in Browser
Simply double-click [`index.html`](./index.html) or right-click and choose **Open with Chrome / Edge / Firefox**.

### Option 2: Python HTTP Server (Recommended)
Open a terminal in this folder and run:
```bash
python -m http.server 3000
```
Then open your browser at `http://localhost:3000`.

### Option 3: VS Code Live Server
Right-click `index.html` in VS Code and select **"Open with Live Server"**.

---

## ⚙️ Connecting to Your Backend RAG System

Click the **Settings (⚙️)** icon in the top right corner of the website:

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

## 📡 Backend Integration Examples

Here are standard backend implementations that work directly out-of-the-box with this frontend:

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
- 📑 **RAG Citation Inspector**: Expandable drawers showing source table rows, matching scores, and SQL record extracts.
- 🤖 **Interactive Mock Engine**: Built-in simulator with rich hospital DBMS records (ICU beds, doctor schedules, patient records, pharmacy inventory) for instant previewing even before starting the backend.
- 🌙 **Dark & Light Mode**: Instant theme switching with persistent local storage.
- 🔒 **Secure Markdown & Table Parser**: Formats bullet points, clinical data tables, bolding, and code snippets safely via DOMPurify.
