import time
import ollama



EMBED_MODEL = "qwen3-embedding:4b"


client = ollama.Client(host="http://127.0.0.1:11434")


def embed_batch(
    texts: list[str],
    max_retries: int = 6
):
    """
    Embed a list of texts using Ollama.

    Returns:
        List of embedding vectors in the same order as the input.
    """

    delay = 2

    for attempt in range(max_retries):
        try:
            response = client.embed(
                model=EMBED_MODEL,
                input=texts,
            )

            return response.embeddings

        except Exception as e:
            if attempt < max_retries - 1:
                print(
                    f"  Ollama error: {e}. "
                    f"Retrying in {delay}s "
                    f"(attempt {attempt + 1}/{max_retries})..."
                )

                time.sleep(delay)
                delay *= 2

            else:
                raise

    raise RuntimeError("embed_batch: exhausted retries")


def embed_text(
    text: str
):
    """
    Single-text convenience wrapper.
    Used by rag.py for queries.
    """

    return embed_batch([text])[0]


