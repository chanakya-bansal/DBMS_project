import time
import ollama
from pathlib import Path


EMBED_MODEL = "qwen3-embedding:4b"
VISION_MODEL = "medgemma:4b"



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




def generate_xray_description(
    image_path: str,
    max_retries: int = 6
) -> str:
    """
    Generate a description of a chest X-ray using MedGemma.

    Returns:
        AI-generated description as a string.
    """

    image_path = Path(image_path)

    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    prompt = """
    Describe this chest X-ray for a medical information retrieval system.
    
        Include:
        - Image quality and visible anatomical structures
        - Lung fields and any visible opacities or abnormalities
        - Pleural spaces and costophrenic angles
        - Cardiac silhouette and mediastinum, where assessable
        - Any other notable visible findings
    
        Clearly distinguish visible observations from uncertainty.
        Do not invent findings when structures are unclear.
        Do not infer patient history or provide treatment recommendations.
        If an observation cannot be assessed, state that explicitly.
    
        Return a concise, structured description in plain text.
    """

    delay = 2

    for attempt in range(max_retries):
        try:
            response = client.generate(
                model=VISION_MODEL,
                prompt=prompt,
                images=[str(image_path.resolve())],
                stream=False
            )

            description = response["response"].strip()

            if not description:
                raise ValueError("MedGemma returned an empty description")

            return description

        except Exception as e:
            if attempt < max_retries - 1:
                print(
                    f"  MedGemma error: {e}. "
                    f"Retrying in {delay}s "
                    f"(attempt {attempt + 1}/{max_retries})..."
                )
                time.sleep(delay)
                delay *= 2
            else:
                raise

    raise RuntimeError("generate_xray_description: exhausted retries")