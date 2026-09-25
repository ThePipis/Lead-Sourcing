import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlotState } from '../types.ts';
import { CheckCircle2, Loader2, Phone, ShieldCheck, X } from 'lucide-react';

interface PaymentStampProps {
  slot: SlotState;
  onConfirm: (record: { paymentRef: string; amountCollectedUsd: number; paidAt: string }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

/**
 * Returns today's date in local YYYY-MM-DD format (respecting user's local timezone instead of UTC)
 */
const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Payment methods accepted by local co-op direct mail campaigns.
 */
const PAYMENT_METHODS = ['zelle', 'check', 'transfer', 'cash'] as const;
const OTHER = '__other__';

export const PaymentStamp: React.FC<PaymentStampProps> = ({
  slot,
  onConfirm,
  onCancel,
  isSaving,
}) => {
  const { t } = useTranslation(['common']);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState<string>('Zelle');
  const [amount, setAmount] = useState<string>(String(slot.priceUsd || 350));
  const [date, setDate] = useState<string>(todayIso());
  
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  // Focus and select amount input on mount for rapid 1-click confirmation or keyboard editing
  useEffect(() => {
    amountInputRef.current?.focus();
    amountInputRef.current?.select();
  }, []);

  // Prevent scroll bleed on background document while modal is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Keyboard shortcut: Escape cancels and closes without scroll jump
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onCancel]);

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const refValid = reference.trim().length > 0;
  const canSubmit = amountValid && refValid && !isSaving;
  const belowList = amountValid && parsedAmount < slot.priceUsd;
  const aboveList = amountValid && parsedAmount > slot.priceUsd;

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod);
    if (newMethod === OTHER) {
      setReference('');
      setTimeout(() => otherInputRef.current?.focus(), 50);
    } else {
      const labels: Record<string, string> = {
        zelle: 'Zelle',
        check: 'Cheque',
        transfer: 'Transferencia bancaria',
        cash: 'Efectivo',
      };
      setReference(labels[newMethod] || newMethod);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      paymentRef: reference.trim(),
      amountCollectedUsd: parsedAmount,
      paidAt: new Date(`${date}T12:00:00`).toISOString(),
    });
  };

  const format = slot.format || 'SMALL';
  const formatBadge = {
    SMALL: { label: 'Chico (1×1)', color: 'bg-secondary text-ink-dim border-rule', price: 350 },
    MEDIUM: { label: 'Mediano (1×2)', color: 'bg-live/15 text-live border-live/30 font-bold', price: 650 },
    LARGE: { label: 'Grande (2×2)', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 font-black', price: 1200 },
    USPS: { label: 'USPS Postal', color: 'bg-secondary text-muted-foreground border-rule', price: 0 },
  }[format];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overscroll-contain animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-2xl border-2 border-live bg-card shadow-2xl relative flex flex-col focus:outline-none animate-in zoom-in-95 duration-150 rounded-none"
        aria-label={t('common:payment.title', { slot: slot.slotNumber })}
      >
        {/* Header: Sello de Cobro Postal + Slot # + Formato + Close Button */}
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-secondary/80 px-4 py-3 select-none">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded border border-live/40 bg-live/10 text-live shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="payment-modal-title" className="font-mono text-xs font-black uppercase tracking-wider text-live">
                  {t('common:payment.title', {
                    slot: String(slot.slotNumber).padStart(2, '0'),
                  })}
                </h3>
                <span className={`text-[0.62rem] px-1.5 py-0.5 rounded border ${formatBadge.color}`}>
                  {formatBadge.label}
                </span>
              </div>
              <p className="text-[0.68rem] text-muted-foreground">
                Comprobante de transacción y bloqueo de espacio publicitario
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-live focus-visible:outline-none transition-colors cursor-pointer"
            title="Cancelar (Esc)"
            aria-label="Cerrar modal"
          >
            <span className="hidden sm:inline font-mono text-[0.62rem] text-muted-foreground border border-rule px-1 rounded">Esc</span>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Advertiser Context Bar */}
        <div className="border-b border-rule bg-secondary/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.68rem] font-bold text-muted-foreground uppercase">Anunciante:</span>
            {slot.businessName ? (
              <span className="font-bold text-foreground">{slot.businessName}</span>
            ) : (
              <span className="italic text-muted-foreground">{t('common:payment.noBusiness')}</span>
            )}
            {slot.categoryName && (
              <span className="text-[0.7rem] text-muted-foreground">· {slot.categoryName}</span>
            )}
          </div>

          {slot.phone && (
            <span className="font-mono text-[0.7rem] text-muted-foreground flex items-center gap-1">
              <Phone className="h-2.5 w-2.5 text-live shrink-0" />
              {slot.phone}
            </span>
          )}
        </div>

        {/* 3 Ruled Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-rule bg-background">
          {/* 1. Forma de Pago */}
          <div className="p-4 flex flex-col justify-start">
            <label htmlFor="payment-method" className="h-5 flex items-center justify-between gap-1 mb-2 select-none cursor-pointer">
              <span className="field-label truncate">{t('common:payment.reference')}</span>
              <span className="font-mono text-[0.6rem] text-live font-bold tracking-wider shrink-0">REQUERIDO</span>
            </label>
            <div className="relative h-10 w-full">
              <select
                id="payment-method"
                value={method}
                onChange={(e) => handleMethodChange(e.target.value)}
                className="field-value h-10 w-full border border-rule bg-card px-3 text-xs sm:text-sm font-medium focus:border-live focus-visible:ring-1 focus-visible:ring-live focus:outline-none cursor-pointer"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`common:payment.methods.${m}`)}
                  </option>
                ))}
                <option value={OTHER}>{t('common:payment.methods.other')}</option>
              </select>
            </div>

            {method === OTHER ? (
              <div className="mt-2">
                <input
                  ref={otherInputRef}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t('common:payment.referencePlaceholder')}
                  className="field-value h-8 w-full border border-live bg-card px-2.5 text-xs placeholder:text-muted-foreground focus:border-live focus-visible:ring-1 focus-visible:ring-live focus:outline-none"
                />
              </div>
            ) : (
              <div className="mt-2 min-h-[1.1rem] flex items-center text-[0.63rem] font-mono text-muted-foreground">
                <span>Canal comercial verificado</span>
              </div>
            )}
          </div>

          {/* 2. Importe Cobrado */}
          <div className="p-4 flex flex-col justify-start">
            <label htmlFor="payment-amount" className="h-5 flex items-center justify-between gap-1 mb-2 select-none cursor-pointer">
              <span className="field-label truncate">{t('common:payment.amount')}</span>
              <span className="font-mono text-[0.6rem] text-muted-foreground font-bold tracking-wider shrink-0">USD</span>
            </label>
            <div className="relative flex items-center h-10 w-full border border-rule bg-card focus-within:border-live focus-within:ring-1 focus-within:ring-live transition-all">
              <span className="pl-3 font-mono text-xs sm:text-sm font-bold text-muted-foreground select-none">
                $
              </span>
              <input
                id="payment-amount"
                ref={amountInputRef}
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="field-value h-full w-full pl-2 pr-3 bg-transparent text-xs sm:text-sm font-mono font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="mt-2 min-h-[1.1rem] flex items-center text-[0.63rem] font-mono tabular-nums text-muted-foreground">
              <span>{t('common:payment.listPrice', { price: slot.priceUsd || formatBadge.price })}</span>
            </div>
          </div>

          {/* 3. Fecha del Cobro */}
          <div className="p-4 flex flex-col justify-start">
            <label htmlFor="payment-date" className="h-5 flex items-center justify-between gap-1 mb-2 select-none cursor-pointer">
              <span className="field-label truncate">{t('common:payment.date')}</span>
              <span className="font-mono text-[0.6rem] text-muted-foreground font-bold tracking-wider shrink-0">LOCAL</span>
            </label>
            <div className="relative h-10 w-full">
              <input
                id="payment-date"
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                className="field-value h-10 w-full border border-rule bg-card px-3 text-xs sm:text-sm font-mono focus:border-live focus-visible:ring-1 focus-visible:ring-live focus:outline-none cursor-pointer"
              />
            </div>
            <div className="mt-2 min-h-[1.1rem] flex items-center text-[0.63rem] font-mono text-muted-foreground">
              <span>Comprobante al instante</span>
            </div>
          </div>
        </div>

        {/* Negotiated Delta Alerts */}
        {belowList && (
          <div className="border-t border-rule bg-due/10 px-4 py-2 font-mono text-[0.68rem] tabular-nums text-due flex items-center gap-1.5">
            <span>⚠️</span>
            <span>
              {t('common:payment.belowList', {
                diff: Math.round((slot.priceUsd || formatBadge.price) - parsedAmount),
              })}
            </span>
          </div>
        )}

        {aboveList && (
          <div className="border-t border-rule bg-live/10 px-4 py-2 font-mono text-[0.68rem] tabular-nums text-live flex items-center gap-1.5">
            <span>★</span>
            <span>
              Tarifa acordada con recargo premium: +${Math.round(parsedAmount - (slot.priceUsd || formatBadge.price))} USD sobre precio de lista.
            </span>
          </div>
        )}

        {/* Footer Actions: Fast Enter shortcut and Sellar Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-rule bg-secondary/80 px-4 py-3 select-none">
          <div className="flex items-center gap-1.5 font-mono text-[0.65rem] text-muted-foreground">
            <span>↵ Presiona <span className="font-bold text-foreground">Enter</span> para sellar</span>
            <span className="text-muted-foreground/40">·</span>
            <span><span className="font-bold text-foreground">Esc</span> para cancelar</span>
          </div>

          <div className="flex items-center justify-end gap-2 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer border border-transparent"
            >
              {t('common:payment.cancel')}
            </button>
            <button
              id="btn-confirm-payment"
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-1.5 border border-clear bg-clear px-5 py-2 text-xs font-black text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('common:form.saving')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{t('common:payment.confirm')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
