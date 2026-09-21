"""
The assistant's memory: chunking, retrieval and the prompt it answers from.

Retrieval is BM25 over the document chunks, not embeddings. That is a deliberate
choice and not a shortcut: the llama server in this setup
(http://192.168.1.28:11434/v1) serves exactly one model, a chat model, with no
embedding model behind it. A retriever that needs a service the operator does not
run would be a retriever that silently returns nothing. BM25 needs no model, no
network and no extra dependency, it is exact on the vocabulary that actually
matters here (EDDM, ECRWSS, presort, hero, piso operativo), and it is fast enough
that the whole corpus is scored on every question.

The trade is real and worth naming: BM25 matches words, not meanings, so a
question phrased entirely in synonyms retrieves less than an embedding index
would. The upgrade path is one function — `search()` — if an embedding model ever
gets pulled onto that server.
"""

import re
import unicodedata
from collections import Counter
from math import log
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from ..models import RagChunk, RagDocument

# A chunk has to be small enough that several fit in a prompt and large enough to
# carry a whole idea: one formula with its explanation, one glossary entry.
TARGET_CHARS = 1100
MAX_CHARS = 1600

# Words that carry no retrieval signal in either language the operators use.
STOPWORDS = {
    "a", "al", "algo", "and", "ante", "antes", "any", "are", "as", "asi", "at",
    "aun", "aunque", "be", "been", "but", "by", "cada", "como", "con", "cual",
    "cuando", "cuanto", "de", "del", "desde", "do", "donde", "dos", "el", "ella",
    "ellos", "en", "entre", "era", "es", "esa", "ese", "eso", "esta", "este",
    "esto", "for", "from", "ha", "hace", "han", "has", "hasta", "hay", "how",
    "in", "is", "it", "la", "las", "le", "les", "lo", "los", "mas", "me", "mi",
    "mis", "mucho", "muy", "ni", "no", "nos", "o", "of", "on", "or", "otra",
    "otro", "para", "pero", "por", "porque", "pue", "puede", "que", "quien",
    "se", "segun", "ser", "si", "sin", "sobre", "solo", "son", "su", "sus",
    "tan", "the", "that", "this", "to", "todo", "todos", "tu", "un", "una",
    "uno", "unos", "was", "what", "when", "where", "which", "with", "y", "ya",
    "yo",
}

TOKEN_RE = re.compile(r"[a-z0-9]+")

K1 = 1.5
B = 0.75


def normalize(text: str) -> str:
    """Lowercase and strip accents, so 'curación' and 'curacion' are one word."""
    lowered = text.lower()
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def tokenize(text: str) -> List[str]:
    return [w for w in TOKEN_RE.findall(normalize(text)) if w not in STOPWORDS and len(w) > 1]


def chunk_markdown(text: str, fallback_title: str) -> List[Tuple[Optional[str], str]]:
    """
    Split a document into passages, cutting on headings first and paragraphs
    second, and remembering which heading each passage came from so an answer
    can say where it read something.
    """
    lines = text.replace("\r\n", "\n").split("\n")
    sections: List[Tuple[Optional[str], List[str]]] = []
    heading: Optional[str] = None
    buffer: List[str] = []

    for line in lines:
        if line.startswith("#"):
            if buffer:
                sections.append((heading, buffer))
                buffer = []
            heading = line.lstrip("#").strip() or fallback_title
        else:
            buffer.append(line)
    if buffer:
        sections.append((heading, buffer))

    chunks: List[Tuple[Optional[str], str]] = []
    for head, body in sections:
        paragraphs = [p.strip() for p in "\n".join(body).split("\n\n") if p.strip()]
        current = ""
        for para in paragraphs:
            candidate = f"{current}\n\n{para}".strip() if current else para
            if len(candidate) <= TARGET_CHARS or not current:
                current = candidate
                # A single paragraph longer than the hard cap (a wide table, a
                # pasted block) is emitted on its own rather than truncated.
                if len(current) >= MAX_CHARS:
                    chunks.append((head, current))
                    current = ""
            else:
                chunks.append((head, current))
                current = para
        if current:
            chunks.append((head, current))

    return chunks or [(None, text.strip())] if text.strip() else []


class Corpus:
    """
    A BM25 index over every chunk in the database.

    Rebuilt from SQLite whenever a document is added or removed; the corpus here
    is a manual plus whatever the operator uploads, which is small enough that
    rebuilding costs less than keeping an index in sync.
    """

    def __init__(self, rows: Sequence[Tuple[int, str, str, Optional[str], str]]):
        # rows: (chunk_id, document_id, doc_title, heading, text)
        self.rows = list(rows)
        self.tokens: List[List[str]] = [tokenize(f"{r[2]} {r[3] or ''} {r[4]}") for r in self.rows]
        self.lengths = [len(t) for t in self.tokens]
        self.avg_len = (sum(self.lengths) / len(self.lengths)) if self.lengths else 0.0
        self.freqs: List[Counter] = [Counter(t) for t in self.tokens]

        df: Counter = Counter()
        for tok in self.tokens:
            df.update(set(tok))
        total = len(self.rows) or 1
        self.idf: Dict[str, float] = {
            term: log(1 + (total - count + 0.5) / (count + 0.5)) for term, count in df.items()
        }

    def search(self, query: str, k: int = 5) -> List[Tuple[float, dict]]:
        terms = tokenize(query)
        if not terms or not self.rows:
            return []

        scored: List[Tuple[float, int]] = []
        for i, freq in enumerate(self.freqs):
            score = 0.0
            length = self.lengths[i] or 1
            for term in terms:
                tf = freq.get(term, 0)
                if not tf:
                    continue
                idf = self.idf.get(term, 0.0)
                denom = tf + K1 * (1 - B + B * length / (self.avg_len or 1))
                score += idf * tf * (K1 + 1) / denom
            if score > 0:
                scored.append((score, i))

        scored.sort(reverse=True)
        out = []
        for score, i in scored[:k]:
            chunk_id, doc_id, title, heading, text = self.rows[i]
            out.append(
                (
                    round(score, 3),
                    {
                        "chunk_id": chunk_id,
                        "document_id": doc_id,
                        "title": title,
                        "heading": heading,
                        "text": text,
                    },
                )
            )
        return out


_corpus: Optional[Corpus] = None


def invalidate() -> None:
    global _corpus
    _corpus = None


def get_corpus(db: Session) -> Corpus:
    global _corpus
    if _corpus is None:
        rows = (
            db.query(
                RagChunk.id,
                RagChunk.document_id,
                RagDocument.title,
                RagChunk.heading,
                RagChunk.text,
            )
            .join(RagDocument, RagDocument.id == RagChunk.document_id)
            .all()
        )
        _corpus = Corpus([tuple(r) for r in rows])
    return _corpus


def build_context(passages: Sequence[dict]) -> str:
    """The retrieved passages, numbered so the answer can cite them."""
    blocks = []
    for n, p in enumerate(passages, start=1):
        where = f"{p['title']}" + (f" › {p['heading']}" if p["heading"] else "")
        blocks.append(f"[{n}] {where}\n{p['text']}")
    return "\n\n---\n\n".join(blocks)


SYSTEM_PROMPT = """Eres el asistente de operación de una plataforma de correo directo cooperativo del Inland Empire, California. Trabajas para un equipo de dos personas que opera el sistema todos los días.

Reglas:
- Responde SIEMPRE en el idioma de la pregunta. Por defecto, español.
- Responde ÚNICAMENTE con lo que digan los fragmentos de documentación que se te entregan. Son la verdad del sistema.
- Si los fragmentos no contienen la respuesta, dilo con claridad: "Eso no está en la documentación del sistema". No inventes cifras, fórmulas, tarifas ni siglas.
- Cita los fragmentos que usaste con su número, así: [1], [2].
- Sé breve y directo. Si son pasos, numéralos.
- CIFRAS Y FÓRMULAS: transcríbelas LITERALMENTE del fragmento, carácter por carácter. No las recalcules, no las redondees, no cambies un número por otro parecido. Si un fragmento dice 497, escribes 497. Copiar mal una cifra es el peor error posible en este sistema: el operador cobra dinero real con ellas.
- Si citas una fórmula, ponla en un bloque de código copiado tal cual del fragmento.
- Los términos técnicos (EDDM, ECRWSS, IMB, CASS/NCOA, BMEU, SCF, presort) se quedan en inglés."""


def build_messages(question: str, passages: Sequence[dict], history: Sequence[dict]) -> List[dict]:
    context = build_context(passages) or "(sin fragmentos relevantes)"
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    # Recent turns give the model the thread of the conversation; the context is
    # attached to the current question so retrieval always matches what is asked.
    for turn in history[-6:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append(
        {
            "role": "user",
            "content": (
                f"Documentación del sistema:\n\n{context}\n\n"
                f"---\n\nPregunta: {question}"
            ),
        }
    )
    return messages


def demo() -> None:
    """Chunking and ranking checks that need no database and no network."""
    doc = (
        "# Manual\n\n"
        "## Franqueo\n\n"
        "El franqueo EDDM Retail cuesta 0.260 dolares por pieza.\n\n"
        "## Curación\n\n"
        "El pool sintético es el triple del alcance objetivo.\n"
    )
    chunks = chunk_markdown(doc, "Manual")
    assert len(chunks) >= 2, chunks
    assert any(c[0] == "Franqueo" for c in chunks), chunks

    rows = [(i + 1, "doc", "Manual", head, text) for i, (head, text) in enumerate(chunks)]
    corpus = Corpus(rows)

    hits = corpus.search("¿cuánto cuesta el franqueo?", k=2)
    assert hits, "the postage passage must be retrievable"
    assert "0.260" in hits[0][1]["text"], hits

    # Accents must not change the match.
    assert corpus.search("curacion")[0][1]["heading"] == "Curación"
    # A question about something absent must retrieve nothing rather than noise.
    assert corpus.search("zzzz qqqq") == []
    print("rag_service: ok")


if __name__ == "__main__":
    demo()
