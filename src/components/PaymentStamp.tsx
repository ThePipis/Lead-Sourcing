import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlotState } from '../types.ts';

interface PaymentStampProps {
  slot: SlotState;
  onConfirm: (record: { paymentRef: string; amountCollectedUsd: number; paidAt: string }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The acceptance block for a slot. Money moves outside the app entirely, so
 * marking a slot paid is a record of a transfer that already happened: it
 * needs a reference, a date, and the amount actually collected, which can
 * differ from list price after the partner negotiates.
 *
 * Rendered in place rather than as a dialog — it is a block on the form, and
 * the operator should still be able to read the card while filling it.
 */
/** What the money arrived as. The reference is free text only when it has to be. */
const PAYMENT_METHODS = ['zelle', 'check', 'transfer', 'cash'] as const;
const OTHER = '__other__';

export const PaymentStamp: React.FC<PaymentStampProps> = ({
  slot,
  onConfirm,
  onCancel,
  isSaving,
}) => {
  const { t } = useTranslation(['common']);
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState<string>(String(slot.priceUsd));
  const [date, setDate] = useState(todayIso());
  const refInput = useRef<HTMLInputElement | null>(null);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);

  useEffect(() => {
    refInput.current?.focus();
  }, []);

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const refValid = reference.trim().length > 0;
  const canSubmit = amountValid && refValid && !isSaving;
  const belowList = amountValid && parsedAmount < slot.priceUsd;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm({
      paymentRef: reference.trim(),
      amountCollectedUsd: parsedAmount,
      paidAt: new Date(`${date}T12:00:00`).toISOString(),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mt-5 border border-live bg-background"
      aria-label={t('common:payment.title', { slot: slot.slotNumber })}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h3 className="imperative text-xs text-live">
          {t('common:payment.title', {
            slot: String(slot.slotNumber).padStart(2, '0'),
          })}
        </h3>
        <span className="field-value text-xs text-ink-dim">
          {slot.businessName || t('common:payment.noBusiness')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-rule sm:grid-cols-3">
        {/* The same four methods come up every time, so they are a choice
            rather than a sentence to retype. "Otro" opens the box for the case
            the list does not cover, which is the only case worth typing. */}
        <label className="block bg-background px-4 py-3">
          <span className="field-label">{t('common:payment.reference')}</span>
          <select
            id="payment-method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setReference(e.target.value === OTHER ? '' : e.target.value);
            }}
            className="field-value mt-1.5 w-full border border-rule bg-card px-2 py-1.5 text-xs focus:border-live focus:outline-none"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`common:payment.methods.${m}`)}
              </option>
            ))}
            <option value={OTHER}>{t('common:payment.methods.other')}</option>
          </select>

          {method === OTHER && (
            <input
              ref={refInput}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('common:payment.referencePlaceholder')}
              className="field-value mt-1.5 w-full border border-rule bg-card px-2 py-1.5 text-xs placeholder:text-ink-faint focus:border-live focus:outline-none"
            />
          )}
        </label>

        <label className="block bg-background px-4 py-3">
          <span className="field-label">{t('common:payment.amount')}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="field-value mt-1.5 w-full border border-rule bg-card px-2 py-1.5 text-xs focus:border-live focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="mt-1 block font-mono text-[0.63rem] tabular-nums text-ink-faint">
            {t('common:payment.listPrice', { price: slot.priceUsd })}
          </span>
        </label>

        <label className="block bg-background px-4 py-3">
          <span className="field-label">{t('common:payment.date')}</span>
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="field-value mt-1.5 w-full border border-rule bg-card px-2 py-1.5 text-xs focus:border-live focus:outline-none"
          />
        </label>
      </div>

      {belowList && (
        <p className="border-t border-rule px-4 py-2 font-mono text-[0.69rem] tabular-nums text-live">
          {t('common:payment.belowList', {
            diff: Math.round(slot.priceUsd - parsedAmount),
          })}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-rule px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="field-label transition-colors hover:text-ink"
        >
          {t('common:payment.cancel')}
        </button>
        <button
          id="btn-confirm-payment"
          type="submit"
          disabled={!canSubmit}
          className="imperative border border-clear bg-clear px-4 py-2 text-[0.69rem] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? t('common:form.saving') : t('common:payment.confirm')}
        </button>
      </div>
    </form>
  );
};
