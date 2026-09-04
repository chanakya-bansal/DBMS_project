-- Hospital RAG schema — matches actual Kaggle CSV headers
-- IDs are TEXT (e.g. 'D001', 'P001', 'A001') since the dataset uses prefixed string IDs, not integers.
CREATE EXTENSION IF NOT EXISTS vector;

-- ===== Core relational tables =====

CREATE TABLE doctors (
    doctor_id       TEXT PRIMARY KEY,
    first_name      TEXT,
    last_name       TEXT,
    specialization  TEXT,
    phone_number    TEXT,
    years_experience INT,
    hospital_branch TEXT,
    email           TEXT
);

CREATE TABLE patients (
    patient_id          TEXT PRIMARY KEY,
    first_name          TEXT,
    last_name           TEXT,
    gender              TEXT,
    date_of_birth       DATE,
    contact_number      TEXT,
    address             TEXT,
    registration_date   DATE,
    insurance_provider  TEXT,
    insurance_number    TEXT,
    email               TEXT
);

CREATE TABLE appointments (
    appointment_id    TEXT PRIMARY KEY,
    patient_id        TEXT REFERENCES patients(patient_id),
    doctor_id         TEXT REFERENCES doctors(doctor_id),
    appointment_date  DATE,
    appointment_time  TIME,
    reason_for_visit  TEXT,
    status            TEXT          -- e.g. Scheduled / Completed / Cancelled
);

CREATE TABLE treatments (
    treatment_id    TEXT PRIMARY KEY,
    appointment_id  TEXT REFERENCES appointments(appointment_id),
    treatment_type  TEXT,
    description     TEXT,          -- free-text: what this embedding table indexes
    cost            NUMERIC(10,2),
    treatment_date  DATE
);

CREATE TABLE billing (
    bill_id         TEXT PRIMARY KEY,
    patient_id      TEXT REFERENCES patients(patient_id),
    treatment_id    TEXT REFERENCES treatments(treatment_id),
    bill_date       DATE,
    amount          NUMERIC(10,2),
    payment_method  TEXT,
    payment_status  TEXT           -- Paid / Pending / Overdue
);

-- ===== RAG layer: embeddings table =====
-- Stores a vector for any free-text field we want semantically searchable.
-- source_table + source_id lets us trace each embedding back to its row.
--
-- Using halfvec(3072) instead of vector(3072): pgvector's HNSW index caps out
-- at 2000 dims for the regular `vector` type. halfvec stores each dimension as
-- a 16-bit float instead of 32-bit, extending the indexable limit to 4000 dims
-- with negligible precision loss — needed since gemini-embedding-001's native
-- output is 3072-dim.

CREATE TABLE embeddings (
    embedding_id    SERIAL PRIMARY KEY,
    source_table    TEXT NOT NULL,     -- 'treatments', 'appointments', etc.
    source_id       TEXT NOT NULL,     -- the PK of the row this text came from (e.g. 'T001')
    content         TEXT NOT NULL,     -- the raw text that was embedded
    embedding       HALFVEC(2560),     -- Gemini gemini-embedding-001, full native dimension
    metadata        JSONB,             -- e.g. {"patient_id": "P012", "doctor_id": "D004", "date": "2024-05-01"}
    created_at      TIMESTAMP DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbor cosine search
CREATE INDEX ON embeddings USING hnsw (embedding halfvec_cosine_ops);

-- Helpful indexes for hybrid filtering (metadata + vector search combined)
CREATE INDEX idx_embeddings_source ON embeddings (source_table, source_id);
CREATE INDEX idx_embeddings_metadata ON embeddings USING GIN (metadata);