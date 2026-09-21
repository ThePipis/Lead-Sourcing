import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Send, Trash2, Upload, X } from 'lucide-react';
import {
  AssistantAnswer,
  AssistantStatus,
  ChatTurn,
  RagDocument,
  askAssistant,
  deleteRagDocument,
  getAssistantStatus,
  listRagDocuments,
  uploadRagDocument,
} from '../services/assistantService.ts';

interface AssistantProps {
  open: boolean;
  onClose: () => void;
}

interface Exchange {
  question: string;
  answer?: AssistantAnswer;
  failed?: string;
}

type Tab = 'CHAT' | 'DOCS';

/**
 * The operating assistant, seated beside the form rather than on top of it.
 *
 * It answers from the system's own documentation, not from what the model
 * remembers: the passages it read are printed under every answer so a figure can
 * be checked against its source without leaving the panel. Asked something the
 * documentation does not cover, it says so — an invented postage rate or slot
 * price would be worse than no answer, because the operator charges money with
 * these numbers.
 *
 * The model runs on the operator's own machine, so nothing typed here leaves the
 * network and no question costs anything.
 */
export const Assistant: React.FC<AssistantProps> = ({ open, onClose }) => {
  const { t } = useTranslation(['common']);
  const [tab, setTab] = useState<Tab>('CHAT');
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [docError, setDocError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    getAssistantStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && tab === 'DOCS') refreshDocs();
  }, [open, tab]);

  // Escape closes it, the way every panel in this app does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep the newest turn in view as answers arrive.
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
  }, [exchanges, isAsking]);

  const refreshDocs = () => {
    listRagDocuments()
      .then((list) => {
        setDocs(list);
        setDocError(null);
      })
      .catch((err) => setDocError(err instanceof Error ? err.message : String(err)));
  };

  const ask = async (text: string) => {
    const asked = text.trim();
    if (!asked || isAsking) return;

    // The last few turns give the model the thread; the whole transcript would
    // bury the documentation it is supposed to answer from.
    const history: ChatTurn[] = exchanges
      .filter((e) => e.answer)
      .flatMap((e) => [
        { role: 'user' as const, content: e.question },
        { role: 'assistant' as const, content: e.answer!.answer },
      ]);

    setQuestion('');
    setExchanges((prev) => [...prev, { question: asked }]);
    setIsAsking(true);
    try {
      const answer = await askAssistant(asked, history);
      setExchanges((prev) => prev.map((e, i) => (i === prev.length - 1 ? { ...e, answer } : e)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExchanges((prev) =>
        prev.map((e, i) => (i === prev.length - 1 ? { ...e, failed: message } : e)),
      );
    } finally {
      setIsAsking(false);
      setStatus((s) => s);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setIsUploading(true);
    try {
      await uploadRagDocument(file);
      setDocError(null);
      refreshDocs();
      getAssistantStatus()
        .then(setStatus)
        .catch(() => {});
    } catch (err) {
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRagDocument(id);
      setDocError(null);
      refreshDocs();
      getAssistantStatus()
        .then(setStatus)
        .catch(() => {});
    } catch (err) {
      setDocError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!open) return null;

  const suggestions = t('common:assistant.suggestions', { returnObjects: true }) as string[];

  return (
    <>
      {/* The form stays readable behind the panel: this dims it, it does not
          hide it. */}
      <div
        className="fixed inset-0 z-40 bg-background/70 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('common:assistant.title')}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[34rem] flex-col border-l border-rule-strong bg-background shadow-2xl"
      >
        <header className="border-b border-rule-strong px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="imperative text-sm text-ink">{t('common:assistant.title')}</h2>
              <p className="mt-0.5 font-mono text-[0.63rem] leading-relaxed break-words text-ink-faint">
                {status
                  ? `${status.model} · ${status.endpoint} · ${t('common:assistant.indexed', {
                      docs: status.documents,
                      chunks: status.chunks,
                    })}`
                  : t('common:assistant.connecting')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common:assistant.close')}
              className="flex min-h-11 min-w-11 items-center justify-center text-ink-dim transition-colors hover:bg-secondary hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {status && !status.modelAvailable && (
            <p className="mt-2 border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">
              {t('common:assistant.offline', { endpoint: status.endpoint })}
            </p>
          )}

          <div role="tablist" className="mt-2 flex gap-px">
            {(['CHAT', 'DOCS'] as Tab[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`field-label flex min-h-11 items-center px-3 transition-colors ${
                  tab === id
                    ? 'bg-secondary text-ink'
                    : 'text-ink-dim hover:bg-secondary hover:text-ink'
                }`}
              >
                {t(`common:assistant.tab.${id.toLowerCase()}`)}
              </button>
            ))}
          </div>
        </header>

        {tab === 'CHAT' ? (
          <>
            <div ref={thread} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {exchanges.length === 0 && (
                <div>
                  <p className="text-xs leading-relaxed text-ink-dim">
                    {t('common:assistant.intro')}
                  </p>
                  <ul className="mt-3 space-y-px">
                    {suggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => ask(s)}
                          className="w-full border border-rule bg-card px-3 py-2.5 text-left text-xs text-ink transition-colors hover:border-live hover:bg-secondary"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {exchanges.map((e, i) => (
                <article key={i} className="mb-5">
                  <p className="field-label text-ink-faint">{t('common:assistant.you')}</p>
                  <p className="mt-1 border-l-2 border-rule-strong pl-3 text-sm text-ink">
                    {e.question}
                  </p>

                  {e.answer && (
                    <div className="mt-3">
                      <p className="field-label text-live">{t('common:assistant.reply')}</p>
                      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                        {e.answer.answer}
                      </div>

                      {e.answer.sources.length > 0 && (
                        <details className="mt-2.5 border-t border-rule pt-2">
                          <summary className="field-label cursor-pointer text-ink-dim transition-colors hover:text-ink">
                            {t('common:assistant.sources', { count: e.answer.sources.length })}
                          </summary>
                          <ul className="mt-2 space-y-2">
                            {e.answer.sources.map((s, n) => (
                              <li key={`${s.documentId}-${n}`} className="border border-rule p-2.5">
                                <p className="field-label text-ink-dim">
                                  [{n + 1}] {s.title}
                                  {s.heading ? ` › ${s.heading}` : ''}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-ink-dim">
                                  {s.excerpt}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  {e.failed && (
                    <p className="mt-2 border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">
                      {e.failed}
                    </p>
                  )}

                  {!e.answer && !e.failed && isAsking && i === exchanges.length - 1 && (
                    <p className="field-label mt-3 flex items-center gap-2 text-live">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('common:assistant.thinking')}
                    </p>
                  )}
                </article>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
              className="border-t border-rule-strong p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={input}
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter breaks the line: this is a
                    // question box, not a document editor.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      ask(question);
                    }
                  }}
                  placeholder={t('common:assistant.placeholder')}
                  aria-label={t('common:assistant.placeholder')}
                  className="min-h-11 flex-1 resize-none border border-rule bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-live focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!question.trim() || isAsking}
                  aria-label={t('common:assistant.send')}
                  className="flex min-h-11 min-w-11 items-center justify-center border border-live bg-live text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isAsking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[0.63rem] leading-relaxed text-ink-faint">
                {t('common:assistant.grounding')}
              </p>
            </form>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <p className="text-xs leading-relaxed text-ink-dim">
              {t('common:assistant.docsIntro')}
            </p>

            <input
              ref={fileInput}
              type="file"
              accept=".md,.markdown,.txt,.csv,.json,.yml,.yaml"
              className="sr-only"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={isUploading}
              className="imperative mt-3 flex min-h-11 w-full items-center justify-center gap-2 border border-live px-4 text-[0.69rem] text-live transition-colors hover:bg-live hover:text-primary-foreground disabled:opacity-40"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {t(isUploading ? 'common:assistant.uploading' : 'common:assistant.upload')}
            </button>

            {docError && (
              <p className="mt-3 border border-due/50 bg-due/10 px-3 py-2 text-xs text-due">
                {docError}
              </p>
            )}

            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-ink">{d.title}</p>
                    <p className="font-mono text-[0.63rem] text-ink-faint">
                      {d.origin === 'SEED'
                        ? t('common:assistant.originSeed')
                        : t('common:assistant.originUpload')}{' '}
                      · {t('common:assistant.chunks', { count: d.chunkCount })} ·{' '}
                      {Math.round(d.charCount / 1000)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    disabled={d.origin === 'SEED'}
                    title={t(
                      d.origin === 'SEED'
                        ? 'common:assistant.seedLocked'
                        : 'common:assistant.deleteDoc',
                    )}
                    aria-label={`${t('common:assistant.deleteDoc')} ${d.title}`}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-ink-faint transition-colors hover:text-due disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:text-ink-faint"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            {docs.length === 0 && (
              <p className="mt-4 text-center text-xs text-ink-dim">
                {t('common:assistant.noDocs')}
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
