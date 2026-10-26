# Hospital RAG — DBMS Project Setup

Stack: PostgreSQL + pgvector (storage) → Gemini embeddings (`text-embedding-004`) → Gemini `generateContent` (answer generation).

---

## 1. Install PostgreSQL + pgvector

### Windows
1. Download installer: https://www.postgresql.org/download/windows/ — run it, remember the password you set for `postgres` user, keep default port 5432.
2. Open **Stack Builder** (opens automatically at end of install) → under "Spatial Extensions" or search — pgvector isn't always bundled. Easiest route: use `pgAdmin`'s Query Tool once DB is up and just run `CREATE EXTENSION vector;` (see step 3) — on Windows this works out of the box with PostgreSQL 16+ official installer since pgvector ships with it. If it errors "extension not available", download the prebuilt binary from https://github.com/pgvector/pgvector#windows and drop the files into your Postgres `lib`/`share` folders per that page's instructions.

### macOS
```bash
brew install postgresql@16
brew install pgvector
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo apt install postgresql-16-pgvector   # package name varies by version
sudo systemctl start postgresql
```

---

## 2. Create the database

```bash
psql -U postgres
```
```sql
CREATE DATABASE hospital_rag;
\c hospital_rag
CREATE EXTENSION vector;
```

---

## 3. Load schema

```bash
psql -U postgres -d hospital_rag -f sql/schema.sql
```

---

## 4. Python environment

```bash
cd hospital-rag
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r scripts/requirements.txt
```

---

## 5. Set your Gemini API key

Create a `.env` file in the project root:
```
GEMINI_API_KEY=your_key_here
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hospital_rag
DB_USER=postgres
DB_PASSWORD=your_postgres_password
```

---

## 6. Ingest your CSVs

Drop `patients.csv`, `doctors.csv`, `appointments.csv`, `treatments.csv`, `billing.csv` into `data/`, then:

```bash
python scripts/ingest.py
```

This embeds the free-text fields (treatment descriptions, notes) and stores vectors in pgvector alongside the structured columns.

---

## 7. Ask questions

```bash
python scripts/rag.py "Which patients had similar symptoms to chest pain and fatigue?"
```

---

## ⚠️ Important — column names are placeholders

I don't have your actual CSVs yet, so `sql/schema.sql` and `scripts/ingest.py` use **guessed column names** based on typical Kaggle hospital datasets. Once you paste me the header row of each CSV (or run `head -1 data/patients.csv` etc.), I'll update the schema and ingestion script to match exactly — mismatched column names will break ingestion otherwise.
