"""
Usage:
    python rag.py "your question here"
"""

import sys
import json

from db import get_connection
from ollama_utils import embed_text
from gemini_utils import generate_answer
#from ollama_query import generate_answer


TOP_K = 15


def vector_literal(vector):
    """
    Convert a Python embedding vector into PostgreSQL
    halfvec literal format.

    Example:
        [0.1, -0.2, 0.3]
        ->
        "[0.1,-0.2,0.3]"
    """

    return "[" + ",".join(str(x) for x in vector) + "]"


def retrieve(cur, query_vector, top_k=TOP_K):
    """
    Retrieve the most semantically similar records
    from the embeddings table using cosine distance.
    """

    cur.execute(
        """
        SELECT
            source_table,
            source_id,
            content,
            metadata,
            embedding <=> %s::halfvec AS distance
        FROM embeddings
        ORDER BY distance
        LIMIT %s
        """,
        (
            query_vector,
            top_k
        )
    )

    return cur.fetchall()


def format_metadata(metadata):
    """
    Convert metadata into readable JSON.
    """

    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            pass

    return json.dumps(
        metadata,
        indent=2,
        default=str
    )


def build_context(results):
    """
    Convert retrieved database records into structured
    context that can be given to Gemini.
    """

    context_chunks = []

    for (
        source_table,
        source_id,
        content,
        metadata,
        distance
    ) in results:

        metadata_text = format_metadata(metadata)

        chunk = f"""
                SOURCE TABLE: {source_table}
                SOURCE ID: {source_id}
                SIMILARITY DISTANCE: {distance:.4f}

                CONTENT:
                {content}

                METADATA:
                {metadata_text}
                """.strip()

        context_chunks.append(chunk)

    return context_chunks


def main():

    if len(sys.argv) < 2:
        print('Usage: python rag.py "your question"')
        return

    # Join all command-line arguments so questions containing
    # spaces work even if they aren't quoted.
    question = " ".join(sys.argv[1:])

    print(f"\nQuestion: {question}")

    conn = get_connection()
    cur = conn.cursor()

    try:

        # ==================================================
        # 1. EMBED THE USER QUESTION
        # ==================================================

        print("\nEmbedding query with Ollama...")

        query_vector = embed_text(question)

        print(
            f"Generated {len(query_vector)}-dimensional vector."
        )

        query_vector_literal = vector_literal(
            query_vector
        )

        # ==================================================
        # 2. VECTOR SEARCH
        # ==================================================

        print(
            f"Searching for top {TOP_K} relevant records..."
        )

        results = retrieve(
            cur,
            query_vector_literal,
            TOP_K
        )

        print(
            f"Retrieved {len(results)} records."
        )

        # ==================================================
        # 3. DISPLAY RETRIEVED RECORDS
        # ==================================================

        print("--- Retrieved Records ---")

        # for (
        #     source_table,
        #     source_id,
        #     content,
        #     metadata,
        #     distance
        # ) in results:

        #     print(
        #         f"[distance={distance:.4f}] "
        #         f"{source_table}:{source_id}"
        #     )

        #     print(
        #         f"  {content[:150]}..."
        #     )

        # ==================================================
        # 4. BUILD CONTEXT
        # ==================================================

        context_chunks = build_context(results)

        print(
            f"Built {len(context_chunks)} context chunks."
        )

        # ==================================================
        # 5. SEND CONTEXT TO GEMINI
        # ==================================================

        print("Sending context to Ollama...")

        answer = generate_answer(
            question,
            context_chunks
        )

        # ==================================================
        # 6. FINAL ANSWER
        # ==================================================

        print("--- Answer ---")
        print(answer)

    except Exception as e:
        print("Ollama response failed ",e);

    finally:

        cur.close()
        conn.close()


if __name__ == "__main__":
    main()

