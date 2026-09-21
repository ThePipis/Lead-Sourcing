"""
The operating assistant: the local llama server, grounded in the system's own
documentation.

The model on that server is a general chat model and it does not know this
business — asked cold what EDDM means, it answers "Electronic Data Processing".
So nothing here asks the model what it knows. Every answer is built from
passages retrieved out of the documentation, the model's job is to phrase them,
and when retrieval comes back empty the assistant says so instead of filling the
silence.
"""

import datetime
import hashlib
import os
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import RagChunk, RagDocument
from ..services import rag_service

router = APIRouter(prefix="/assistant", tags=["Operating Assistant"])

# The operator's own GPU box. No token cost, no data leaving the network.
LLAMA_URL = (os.getenv("LLAMA_CPP_BASE_URL", "http://192.168.1.28:11434/v1")).rstrip("/")
LLAMA_MODEL = (os.getenv("LLAMA_CPP_MODEL", "llama-server")).strip("\"'") or "llama-server"

# Uploads are read into memory and chunked, so the cap is what a manual or a
# quote could plausibly weigh, not what a disk can hold.
MAX_UPLOAD_BYTES = 2_000_000
TEXT_SUFFIXES = (".md", ".markdown", ".txt", ".csv", ".json", ".yml", ".yaml")

# Where the shipped documentation lives, relative to backend/.
SEED_DIRS = ("../docs",)
SEED_FILES = ("../PRODUCT.md", "../DESIGN.md")


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    history: List[ChatTurn] = []
    # How many passages to put in front of the model. More context is not always
    # better: it buries the relevant passage.
    top_k: int = Field(5, ge=1, le=10)


class SourceOut(BaseModel):
    document_id: str
    title: str
    heading: Optional[str] = None
    score: float
    excerpt: str


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceOut] = []
    model: str
    # False when the llama server could not be reached; the passages still come
    # back so the question is not a dead end.
    model_available: bool = True


class DocumentOut(BaseModel):
    id: str
    title: str
    origin: str
    source: Optional[str] = None
    char_count: int
    chunk_count: int
    created_at: datetime.datetime


def _doc_id(origin: str, key: str) -> str:
    return f"{origin.lower()}_{hashlib.sha1(key.encode('utf-8')).hexdigest()[:16]}"


def ingest(
    db: Session,
    *,
    doc_id: str,
    title: str,
    text: str,
    origin: str,
    source: Optional[str],
) -> RagDocument:
    """Replace a document and its chunks in place, then drop the search index."""
    existing = db.query(RagDocument).filter(RagDocument.id == doc_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    doc = RagDocument(
        id=doc_id,
        title=title,
        origin=origin,
        source=source,
        char_count=len(text),
        created_at=datetime.datetime.utcnow(),
    )
    db.add(doc)
    db.flush()

    for ordinal, (heading, body) in enumerate(rag_service.chunk_markdown(text, title)):
        db.add(RagChunk(document_id=doc.id, ordinal=ordinal, heading=heading, text=body))

    db.commit()
    rag_service.invalidate()
    return doc


def seed_documents() -> None:
    """
    Load the shipped documentation at startup, replacing it when the file has
    changed. Uploaded documents are never touched by this.
    """
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    paths: List[str] = []
    for rel in SEED_DIRS:
        folder = os.path.normpath(os.path.join(here, rel))
        if os.path.isdir(folder):
            paths += [
                os.path.join(folder, f)
                for f in sorted(os.listdir(folder))
                if f.lower().endswith(TEXT_SUFFIXES)
            ]
    for rel in SEED_FILES:
        path = os.path.normpath(os.path.join(here, rel))
        if os.path.isfile(path):
            paths.append(path)

    if not paths:
        return

    db = SessionLocal()
    try:
        for path in paths:
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    text = fh.read()
            except OSError as e:
                print(f"[Assistant] could not read {path}: {e}")
                continue
            if not text.strip():
                continue

            name = os.path.basename(path)
            doc_id = _doc_id("seed", name)
            existing = db.query(RagDocument).filter(RagDocument.id == doc_id).first()
            if existing and existing.char_count == len(text):
                continue  # unchanged since last start
            title = _title_from(text, name)
            ingest(db, doc_id=doc_id, title=title, text=text, origin="SEED", source=name)
            print(f"[Assistant] indexed {name} ({len(text)} chars)")
    finally:
        db.close()


def _title_from(text: str, fallback: str) -> str:
    for line in text.split("\n", 40)[:40]:
        if line.startswith("# "):
            return line[2:].strip()[:200]
    return os.path.splitext(fallback)[0].replace("-", " ").replace("_", " ").title()[:200]


async def ask_llama(messages: List[dict]) -> Optional[str]:
    """
    One completion from the local server, or None when it cannot be reached.

    Thinking is switched off: the model on this box emits its reasoning into a
    separate field that eats the token budget, and with the passages in hand
    there is nothing to reason about — the answer is in the text.
    """
    payload = {
        "model": LLAMA_MODEL,
        "messages": messages,
        # Zero temperature: this assistant quotes figures the operator charges
        # money with, and creative rephrasing of a number is a defect.
        "temperature": 0.0,
        "max_tokens": 900,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(f"{LLAMA_URL}/chat/completions", json=payload)
        if resp.status_code != 200:
            print(f"[Assistant] llama HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        data = resp.json()
        message = (data.get("choices") or [{}])[0].get("message", {}) or {}
        content = (message.get("content") or "").strip()
        # A thinking model that ran out of budget mid-thought leaves content
        # empty; its reasoning is not an answer, so it is not passed off as one.
        return content or None
    except Exception as e:
        print(f"[Assistant] llama unreachable: {e}")
        return None


@router.get("/status")
async def status(db: Session = Depends(get_db)):
    docs = db.query(RagDocument).count()
    chunks = db.query(RagChunk).count()
    reachable = True
    # Report the model the server is actually serving, not the name configured
    # in .env: llama.cpp ignores the requested name, and showing a label that
    # does not match what answers the questions is a small lie.
    served = LLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{LLAMA_URL}/models")
            reachable = r.status_code == 200
            if reachable:
                entries = (r.json() or {}).get("data") or []
                if entries and entries[0].get("id"):
                    served = entries[0]["id"]
    except Exception:
        reachable = False
    return {
        "documents": docs,
        "chunks": chunks,
        "model": served,
        "endpoint": LLAMA_URL,
        "model_available": reachable,
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    corpus = rag_service.get_corpus(db)
    hits = corpus.search(req.question, k=req.top_k)
    passages = [p for _, p in hits]

    sources = [
        SourceOut(
            document_id=p["document_id"],
            title=p["title"],
            heading=p["heading"],
            score=score,
            excerpt=p["text"][:280],
        )
        for score, p in hits
    ]

    if not passages:
        return ChatResponse(
            answer=(
                "No encontré nada sobre eso en la documentación del sistema. "
                "Prueba con otras palabras, o sube el documento que lo explique "
                "desde la pestaña Documentos."
            ),
            sources=[],
            model=LLAMA_MODEL,
            model_available=True,
        )

    answer = await ask_llama(
        rag_service.build_messages(
            req.question, passages, [t.model_dump() for t in req.history]
        )
    )

    if answer is None:
        # The retrieval still worked, so the operator gets the passages rather
        # than an error: that is usually enough to unblock them.
        return ChatResponse(
            answer=(
                f"No pude hablar con el modelo en {LLAMA_URL}. Revisa que el "
                "servidor esté encendido. Mientras tanto, esto es lo que dice la "
                "documentación sobre tu pregunta:\n\n"
                + rag_service.build_context(passages[:3])
            ),
            sources=sources,
            model=LLAMA_MODEL,
            model_available=False,
        )

    return ChatResponse(answer=answer, sources=sources, model=LLAMA_MODEL)


@router.get("/documents", response_model=List[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(RagDocument).order_by(RagDocument.origin, RagDocument.title).all()
    return [
        DocumentOut(
            id=d.id,
            title=d.title,
            origin=d.origin,
            source=d.source,
            char_count=d.char_count or 0,
            chunk_count=len(d.chunks),
            created_at=d.created_at,
        )
        for d in docs
    ]


@router.post("/documents", response_model=DocumentOut)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Add a document to what the assistant can quote.

    Text formats only. A PDF would need a parser this project does not carry, and
    indexing its raw bytes would poison the answers with garbage, so it is
    refused with an explanation rather than accepted and quietly mangled.
    """
    name = file.filename or "documento"
    if not name.lower().endswith(TEXT_SUFFIXES):
        raise HTTPException(
            status_code=415,
            detail=(
                f"Formato no admitido ({name}). Admitidos: "
                + ", ".join(TEXT_SUFFIXES)
                + ". Para un PDF, pégalo como .md o .txt."
            ),
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El archivo pesa {len(raw) // 1000} KB; el máximo son {MAX_UPLOAD_BYTES // 1000} KB.",
        )
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    if not text.strip():
        raise HTTPException(status_code=422, detail="El archivo está vacío.")

    doc = ingest(
        db,
        doc_id=_doc_id("upload", name),
        title=_title_from(text, name),
        text=text,
        origin="UPLOAD",
        source=name,
    )
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        origin=doc.origin,
        source=doc.source,
        char_count=doc.char_count or 0,
        chunk_count=len(doc.chunks),
        created_at=doc.created_at,
    )


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.query(RagDocument).filter(RagDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if doc.origin == "SEED":
        raise HTTPException(
            status_code=409,
            detail=(
                "Ese documento es la documentación del propio sistema y se "
                "regenera al arrancar. Edita el archivo en docs/ para cambiarlo."
            ),
        )
    db.delete(doc)
    db.commit()
    rag_service.invalidate()
    return None
