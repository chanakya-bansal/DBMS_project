import os
import json

import ollama
from dotenv import load_dotenv

from sql_tool import execute_sql


load_dotenv()

client = ollama.Client(host="http://127.0.0.1:11434")

GEN_MODEL = "qwen2.5:7b"

SQL_TOOL = {
    "type": "function",
    "function": {
        "name": "execute_sql",
        "description": """
        Execute a read-only SQL SELECT query against the hospital PostgreSQL database.

        Use this tool when the user's question requires exact structured information,
        such as:

        - counting patients
        - counting appointments
        - finding the highest or lowest value
        - filtering records using exact conditions
        - sorting records
        - joining multiple tables
        - aggregating billing information
        - finding doctors, patients, treatments, or appointments using exact fields

        Only generate SELECT queries.

        The database contains these tables:

        doctors:
            doctor_id
            first_name
            last_name
            specialization
            phone_number
            years_experience
            hospital_branch
            email

        patients:
            patient_id
            first_name
            last_name
            gender
            date_of_birth
            contact_number
            address
            registration_date
            insurance_provider
            insurance_number
            email

        appointments:
            appointment_id
            patient_id
            doctor_id
            appointment_date
            appointment_time
            reason_for_visit
            status

        treatments:
            treatment_id
            appointment_id
            patient_id
            treatment_date
            description
            cost

        billing:
            bill_id
            patient_id
            appointment_id
            amount
            billing_date
            payment_status

        Use the actual column names listed above.
        """,
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "A read-only PostgreSQL SELECT query."
                }
            },
            "required": ["sql"]
        }
    }
}


def generate_answer(
    question: str,
    context_chunks: list[str]
) -> str:

    context = "\n\n---\n\n".join(context_chunks)

    prompt = f"""
            You are a hospital records assistant.

            You have access to:

            1. Semantic retrieval context from the hospital records.
            2. A SQL tool that can execute read-only SELECT queries.

            Your job is to answer the user's question accurately.

            Use the SQL tool when the question requires exact structured
            database information.

            Examples where SQL is appropriate:

            - "How many patients are there?"
            - "Which doctor has the most appointments?"
            - "What is the total billing amount?"
            - "How many appointments were cancelled?"
            - "Which patients have more than 3 appointments?"

            Use the provided semantic context when the question requires
            semantic understanding of free-text medical records.

            Examples where semantic retrieval is useful:

            - "Which patients had symptoms similar to chest pain?"
            - "What treatments were given for patients complaining about fever?"
            - "Find records describing headaches."

            You may use both the context and SQL if necessary.

            IMPORTANT:
            - Never invent database values.
            - If SQL is needed, use the SQL tool.
            - Only use SELECT queries.
            - Do not expose SQL to the user unless specifically asked.
            - After receiving SQL results, explain them naturally.
            - If neither the context nor SQL results provide the answer,
            say that the available records do not contain enough information.

            SEMANTIC RETRIEVAL CONTEXT:

            {context}

            USER QUESTION:

            {question}
            """

    messages = [{"role": "user", "content": prompt}]

    response = client.chat(
        model=GEN_MODEL,
        messages=messages,
        tools=[SQL_TOOL]
    )

    message = response["message"]
    messages.append(message)

    while message.get("tool_calls"):

        for tool_call in message["tool_calls"]:

            if tool_call["function"]["name"] != "execute_sql":
                continue

            sql = tool_call["function"]["arguments"]["sql"]
            print("sql query written by qwen -> ", sql)

            result = execute_sql(sql)
            result = json.loads(json.dumps(result, default=str))

            messages.append({
                "role": "tool",
                "content": json.dumps(result)
            })

        response = client.chat(
            model=GEN_MODEL,
            messages=messages,
            tools=[SQL_TOOL]
        )

        message = response["message"]
        messages.append(message)

    return message["content"]