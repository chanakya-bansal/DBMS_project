import os
import json

from google import genai
from dotenv import load_dotenv
from google.genai import types
from google.genai.errors import ClientError

from sql_tool import execute_sql


load_dotenv()


client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


GEN_MODEL = "gemini-3.5-flash"

MODELS = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2-flash",
    "gemini-2-flash-lite",
]


def get_function_calls(response):
    parts = response.candidates[0].content.parts
    return [p.function_call for p in parts if p.function_call]

def get_text(response):
    parts = response.candidates[0].content.parts
    return "".join(p.text for p in parts if p.text)

SQL_TOOL = {
    "function_declarations": [
        {
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
    ]
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

    # --------------------------------------------------
    # Create Gemini chat with SQL tool
    # --------------------------------------------------

    for model_name in MODELS:

        try:
            print(f"Trying {model_name}...")

            chat = client.chats.create(
                model=model_name,
                config={
                    "tools": [SQL_TOOL]
                }
            )

        
            response = chat.send_message(prompt)

            function_calls = get_function_calls(response)

            while function_calls:
                tool_responses = []
                for function_call in function_calls:
                    if function_call.name != "execute_sql":
                        continue
                    sql = function_call.args["sql"]
                    print("sql query written by gemini -> ",sql );
                    result = execute_sql(sql)
                    tool_responses.append(
                        types.Part.from_function_response(
                            name=function_call.name,
                            response={"result": json.loads(json.dumps(result, default=str))}
                        )
                    )
                response = chat.send_message(tool_responses)
                function_calls = get_function_calls(response)

            return get_text(response)

        except ClientError as e:
            if getattr(e, "code", None) == 429:
                print(f"{model_name} quota hit, falling back...")
            else:
                print(f"{model_name} client error: {e}")
                raise  # don't fallback on non-quota errors

        except Exception as e:
            # Unexpected programming/network error
            print(f"Unexpected error with {model_name}: {e}")

            if model_name == MODELS[-1]:
                raise

            print("Falling back to next model...")

   # return response.text
