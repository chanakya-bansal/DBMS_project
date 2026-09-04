"""
Loads the 5 CSVs into their relational tables, then builds a text "chunk"
for every row across ALL 5 tables (not just treatments/appointments) and
embeds them locally via Ollama (qwen3-embedding:4b) — no API quota.

Matches real Kaggle dataset columns:
  doctors.csv:      doctor_id,first_name,last_name,specialization,phone_number,years_experience,hospital_branch,email
  patients.csv:     patient_id,first_name,last_name,gender,date_of_birth,contact_number,address,registration_date,insurance_provider,insurance_number,email
  appointments.csv: appointment_id,patient_id,doctor_id,appointment_date,appointment_time,reason_for_visit,status
  treatments.csv:   treatment_id,appointment_id,treatment_type,description,cost,treatment_date
  billing.csv:      bill_id,patient_id,treatment_id,bill_date,amount,payment_method,payment_status
"""
import json
import pandas as pd
from db import get_connection
from ollama_utils import embed_batch

DATA_DIR = "../archive"
BATCH_SIZE = 10   # texts per Ollama call — local CPU embedding can be slow, keep batches modest


def load_table(cur, csv_path, table, columns):
    """Generic loader: columns = list of (csv_col, db_col) pairs, in DB column order."""
    df = pd.read_csv(csv_path)
    db_cols = [db for _, db in columns]
    csv_cols = [csv for csv, _ in columns]
    placeholders = ", ".join(["%s"] * len(db_cols))
    col_list = ", ".join(db_cols)
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"
    rows = df[csv_cols].values.tolist()
    cur.executemany(sql, rows)
    print(f"Loaded {len(rows)} rows into {table}")


def embed_and_store_batch(cur, rows):
    """rows = list of (source_table, source_id, text, metadata_dict).
    Skips rows already embedded (resumability across reruns), then embeds
    remaining texts via local Ollama in chunks of BATCH_SIZE.
    """
    if not rows:
        return

    to_do = []
    for source_table, source_id, text, metadata in rows:
        if not text or not str(text).strip():
            continue
        cur.execute(
            "SELECT 1 FROM embeddings WHERE source_table = %s AND source_id = %s",
            (source_table, source_id),
        )
        if cur.fetchone() is None:
            to_do.append((source_table, source_id, str(text), metadata))

    if not to_do:
        print(f"  All {len(rows)} rows already embedded, skipping.")
        return

    for i in range(0, len(to_do), BATCH_SIZE):
        chunk = to_do[i:i + BATCH_SIZE]
        texts = [c[2] for c in chunk]
        vectors = embed_batch(texts)

        for (source_table, source_id, text, metadata), vector in zip(chunk, vectors):
            vector_literal = "[" + ",".join(str(x) for x in vector) + "]"
            cur.execute(
                """INSERT INTO embeddings (source_table, source_id, content, embedding, metadata)
                   VALUES (%s, %s, %s, %s::halfvec, %s)""",
                (source_table, source_id, text, vector_literal, json.dumps(metadata)),
            )

        print(f"  Embedded {min(i + BATCH_SIZE, len(to_do))}/{len(to_do)}")


def main():
    conn = get_connection()
    cur = conn.cursor()

    # --- Doctors ---
    load_table(cur, f"{DATA_DIR}/doctors.csv", "doctors", [
        ("doctor_id", "doctor_id"),
        ("first_name", "first_name"),
        ("last_name", "last_name"),
        ("specialization", "specialization"),
        ("phone_number", "phone_number"),
        ("years_experience", "years_experience"),
        ("hospital_branch", "hospital_branch"),
        ("email", "email"),
    ])

    # --- Patients ---
    load_table(cur, f"{DATA_DIR}/patients.csv", "patients", [
        ("patient_id", "patient_id"),
        ("first_name", "first_name"),
        ("last_name", "last_name"),
        ("gender", "gender"),
        ("date_of_birth", "date_of_birth"),
        ("contact_number", "contact_number"),
        ("address", "address"),
        ("registration_date", "registration_date"),
        ("insurance_provider", "insurance_provider"),
        ("insurance_number", "insurance_number"),
        ("email", "email"),
    ])
    conn.commit()

    # --- Appointments ---
    load_table(cur, f"{DATA_DIR}/appointments.csv", "appointments", [
        ("appointment_id", "appointment_id"),
        ("patient_id", "patient_id"),
        ("doctor_id", "doctor_id"),
        ("appointment_date", "appointment_date"),
        ("appointment_time", "appointment_time"),
        ("reason_for_visit", "reason_for_visit"),
        ("status", "status"),
    ])
    conn.commit()

    # --- Treatments ---
    load_table(cur, f"{DATA_DIR}/treatments.csv", "treatments", [
        ("treatment_id", "treatment_id"),
        ("appointment_id", "appointment_id"),
        ("treatment_type", "treatment_type"),
        ("description", "description"),
        ("cost", "cost"),
        ("treatment_date", "treatment_date"),
    ])
    conn.commit()

    # --- Billing ---
    load_table(cur, f"{DATA_DIR}/billing.csv", "billing", [
        ("bill_id", "bill_id"),
        ("patient_id", "patient_id"),
        ("treatment_id", "treatment_id"),
        ("bill_date", "bill_date"),
        ("amount", "amount"),
        ("payment_method", "payment_method"),
        ("payment_status", "payment_status"),
    ])
    conn.commit()

    # ============================================================
    # Build embeddable text chunks for ALL 5 entity types.
    # Structured columns get templated into natural-language sentences
    # so semantic search has real content to match against, not just
    # the two free-text fields (treatments.description, appointments.reason_for_visit).
    # ============================================================

    # --- Doctors ---
    cur.execute("SELECT doctor_id, first_name, last_name, specialization, years_experience, hospital_branch FROM doctors")
    doctor_rows = []
    for doctor_id, first_name, last_name, specialization, years_experience, hospital_branch in cur.fetchall():
        text = (f"Dr. {first_name} {last_name} is a {specialization} specialist with "
                f"{years_experience} years of experience, based at {hospital_branch}.")
        doctor_rows.append(("doctors", doctor_id, text, {
            "doctor_id": doctor_id, "specialization": specialization, "branch": hospital_branch,
        }))
    print(f"Embedding {len(doctor_rows)} doctor profiles...")
    embed_and_store_batch(cur, doctor_rows)
    conn.commit()

    # --- Patients ---
    cur.execute("""SELECT patient_id, first_name, last_name, gender, date_of_birth,
                          insurance_provider, registration_date FROM patients""")
    patient_rows = []
    for patient_id, first_name, last_name, gender, date_of_birth, insurance_provider, registration_date in cur.fetchall():
        text = (f"Patient {first_name} {last_name}, {gender}, born {date_of_birth}, "
                f"registered on {registration_date}, insured with {insurance_provider}.")
        patient_rows.append(("patients", patient_id, text, {
            "patient_id": patient_id, "gender": gender, "insurance_provider": insurance_provider,
        }))
    print(f"Embedding {len(patient_rows)} patient profiles...")
    embed_and_store_batch(cur, patient_rows)
    conn.commit()

    # --- Appointments (reason_for_visit + status, richer than before) ---
    cur.execute("""SELECT appointment_id, patient_id, doctor_id, reason_for_visit,
                          appointment_date, status FROM appointments""")
    appointment_rows = []
    for appointment_id, patient_id, doctor_id, reason_for_visit, appointment_date, status in cur.fetchall():
        text = (f"Appointment on {appointment_date}, reason: {reason_for_visit}. "
                f"Status: {status}.")
        appointment_rows.append(("appointments", appointment_id, text, {
            "patient_id": patient_id, "doctor_id": doctor_id, "date": str(appointment_date), "status": status,
        }))
    print(f"Embedding {len(appointment_rows)} appointments...")
    embed_and_store_batch(cur, appointment_rows)
    conn.commit()

    # --- Treatments (join through appointments for patient/doctor context) ---
    cur.execute("""
        SELECT t.treatment_id, t.description, t.treatment_type, t.cost, t.treatment_date,
               a.patient_id, a.doctor_id
        FROM treatments t
        JOIN appointments a ON t.appointment_id = a.appointment_id
    """)
    treatment_rows = []
    for treatment_id, description, treatment_type, cost, treatment_date, patient_id, doctor_id in cur.fetchall():
        text = (f"Treatment type: {treatment_type}. Description: {description}. "
                f"Cost: ${cost}. Date: {treatment_date}.")
        treatment_rows.append(("treatments", treatment_id, text, {
            "patient_id": patient_id, "doctor_id": doctor_id,
            "treatment_type": treatment_type, "date": str(treatment_date),
        }))
    print(f"Embedding {len(treatment_rows)} treatments...")
    embed_and_store_batch(cur, treatment_rows)
    conn.commit()

    # --- Billing ---
    cur.execute("""SELECT bill_id, patient_id, amount, payment_method, payment_status, bill_date FROM billing""")
    billing_rows = []
    for bill_id, patient_id, amount, payment_method, payment_status, bill_date in cur.fetchall():
        text = (f"Bill of ${amount} via {payment_method}, status: {payment_status}, dated {bill_date}.")
        billing_rows.append(("billing", bill_id, text, {
            "patient_id": patient_id, "payment_status": payment_status, "date": str(bill_date),
        }))
    print(f"Embedding {len(billing_rows)} billing records...")
    embed_and_store_batch(cur, billing_rows)
    conn.commit()

    cur.close()
    conn.close()
    print("Ingestion complete.")


if __name__ == "__main__":
    main()