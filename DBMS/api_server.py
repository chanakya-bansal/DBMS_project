"""
Lightweight FastAPI adapter for the existing RAG pipeline (rag.py).
Does NOT modify rag.py or any backend pipeline code.
Exposes a single POST /api/rag/query endpoint that runs rag.py as a subprocess
and returns both the full stdout (for thinking display) and the parsed answer.
"""
import asyncio
import subprocess
import sys
import json
import re
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="MediPulse RAG API Adapter")

# Allow frontend (file:// or localhost) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RAG_SCRIPT = Path(__file__).parent / "rag.py"
PYTHON_EXE = sys.executable  # Use current venv's python


class QueryRequest(BaseModel):
    query: str


class QueryResponse(BaseModel):
    answer: str
    thinking: str  # Full stdout from rag.py
    citations: list = []


def parse_rag_output(stdout: str) -> tuple[str, str]:
    """
    Parse rag.py stdout to extract:
    - thinking: everything printed before the final answer
    - answer: the content after "--- Answer ---"
    """
    # Split on the answer delimiter
    answer_marker = "--- Answer ---"
    if answer_marker in stdout:
        thinking_part, answer_part = stdout.split(answer_marker, 1)
        answer = answer_part.strip()
        thinking = thinking_part.strip()
    else:
        # Fallback: treat all as thinking, no clear answer
        thinking = stdout.strip()
        answer = "No answer delimiter found in pipeline output."
    return thinking, answer


def stream_event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def stream_rag_output(query: str):
    process = None

    try:
        if not RAG_SCRIPT.exists():
            yield stream_event({"type": "error", "message": f"RAG script not found at {RAG_SCRIPT}"})
            return

        process = await asyncio.create_subprocess_exec(
            PYTHON_EXE,
            "-u",
            str(RAG_SCRIPT),
            query,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(RAG_SCRIPT.parent),
        )

        deadline = asyncio.get_running_loop().time() + 120
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                yield stream_event({"type": "error", "message": "RAG pipeline timed out after 120 seconds"})
                return

            try:
                line = await asyncio.wait_for(process.stdout.readline(), timeout=remaining)
            except asyncio.TimeoutError:
                yield stream_event({"type": "error", "message": "RAG pipeline timed out after 120 seconds"})
                return

            if not line:
                break

            yield stream_event({
                "type": "output",
                "text": line.decode("utf-8", errors="replace"),
            })

        return_code = await process.wait()
        if return_code:
            yield stream_event({
                "type": "error",
                "message": f"RAG pipeline failed with exit code {return_code}",
            })
        else:
            yield stream_event({"type": "done"})
    except OSError as exc:
        yield stream_event({"type": "error", "message": f"Could not start the RAG pipeline: {exc}"})
    finally:
        if process is not None and process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            await process.wait()


@app.post("/api/rag/stream")
async def stream_query_rag(request: QueryRequest):
    """Stream pipeline stdout as server-sent events."""
    return StreamingResponse(
        stream_rag_output(request.query),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/rag/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest):
    """Execute rag.py with the given question and return structured response."""
    if not RAG_SCRIPT.exists():
        raise HTTPException(status_code=500, detail=f"RAG script not found at {RAG_SCRIPT}")

    try:
        # Run rag.py as subprocess, capturing stdout and stderr
        result = subprocess.run(
            [PYTHON_EXE, str(RAG_SCRIPT), request.query],
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout for full pipeline
            cwd=str(RAG_SCRIPT.parent),
        )

        stdout = result.stdout
        stderr = result.stderr

        if result.returncode != 0:
            error_msg = f"RAG pipeline failed (exit code {result.returncode}):\n{stderr}\n{stdout}"
            raise HTTPException(status_code=500, detail=error_msg)

        thinking, answer = parse_rag_output(stdout)

        return QueryResponse(
            answer=answer,
            thinking=thinking,
            citations=[],  # rag.py doesn't output structured citations; could parse retrieved records if needed
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="RAG pipeline timed out after 120 seconds")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Adapter error: {str(e)}")


@app.get("/health")
async def health_check():
    return {"status": "ok", "rag_script": str(RAG_SCRIPT), "python": PYTHON_EXE}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)