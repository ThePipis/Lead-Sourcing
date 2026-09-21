const API_BASE = '/api';

export interface AssistantSource {
  documentId: string;
  title: string;
  heading?: string;
  score: number;
  excerpt: string;
}

export interface AssistantAnswer {
  answer: string;
  sources: AssistantSource[];
  model: string;
  /** False when the local llama server could not be reached. */
  modelAvailable: boolean;
}

export interface AssistantStatus {
  documents: number;
  chunks: number;
  model: string;
  endpoint: string;
  modelAvailable: boolean;
}

export interface RagDocument {
  id: string;
  title: string;
  /** SEED ships with the app and is re-read on startup; UPLOAD is the operator's. */
  origin: 'SEED' | 'UPLOAD';
  source?: string;
  charCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function mapSource(raw: any): AssistantSource {
  return {
    documentId: raw.document_id,
    title: raw.title,
    heading: raw.heading ?? undefined,
    score: raw.score ?? 0,
    excerpt: raw.excerpt ?? '',
  };
}

function mapDocument(raw: any): RagDocument {
  return {
    id: raw.id,
    title: raw.title,
    origin: raw.origin,
    source: raw.source ?? undefined,
    charCount: raw.char_count ?? 0,
    chunkCount: raw.chunk_count ?? 0,
    createdAt: raw.created_at,
  };
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const res = await fetch(`${API_BASE}/assistant/status`);
  if (!res.ok) throw new Error(`GET /assistant/status -> ${res.status}`);
  const raw = await res.json();
  return {
    documents: raw.documents ?? 0,
    chunks: raw.chunks ?? 0,
    model: raw.model ?? '',
    endpoint: raw.endpoint ?? '',
    modelAvailable: Boolean(raw.model_available),
  };
}

export async function askAssistant(
  question: string,
  history: ChatTurn[],
): Promise<AssistantAnswer> {
  const res = await fetch(`${API_BASE}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok) throw new Error(`POST /assistant/chat -> ${res.status}`);
  const raw = await res.json();
  return {
    answer: raw.answer ?? '',
    sources: (raw.sources ?? []).map(mapSource),
    model: raw.model ?? '',
    modelAvailable: raw.model_available !== false,
  };
}

export async function listRagDocuments(): Promise<RagDocument[]> {
  const res = await fetch(`${API_BASE}/assistant/documents`);
  if (!res.ok) throw new Error(`GET /assistant/documents -> ${res.status}`);
  return (await res.json()).map(mapDocument);
}

/** Feed one text document into what the assistant can quote from. */
export async function uploadRagDocument(file: File): Promise<RagDocument> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_BASE}/assistant/documents`, { method: 'POST', body });
  if (!res.ok) {
    // The backend explains refusals in words (wrong format, too big, empty);
    // pass that sentence through instead of an HTTP code.
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `POST /assistant/documents -> ${res.status}`);
  }
  return mapDocument(await res.json());
}

export async function deleteRagDocument(documentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/assistant/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail)
      .catch(() => '');
    throw new Error(detail || `DELETE /assistant/documents -> ${res.status}`);
  }
}
