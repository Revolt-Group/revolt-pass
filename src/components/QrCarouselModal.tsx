import { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  ChevronLeft,
  ChevronRight,
  QrCode,
  Copy,
  Check,
  ShieldAlert,
  Smartphone,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon';
import { QrCodeView } from './QrCodeView';
import {
  encodeMigrationPayload,
  chunkAccountsForMigration,
} from '../lib/exporters/protobufEncoder';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard';
import { useTranslation } from '../i18n/index';
import type { VaultItem } from '../types/vault';

interface QrCarouselModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: VaultItem[];
}

export function QrCarouselModal({ isOpen, onClose, items }: QrCarouselModalProps) {
  const { t } = useTranslation();
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [copiedUri, setCopiedUri] = useState(false);

  // Stable batch ID per modal open session
  const batchId = useMemo(() => Math.floor(Math.random() * 1000000), [isOpen]);

  // Split items into chunks of 7 accounts per QR code
  const batches = useMemo(() => chunkAccountsForMigration(items, 7), [items]);
  const totalBatches = Math.max(1, batches.length);
  const activeBatch = batches[currentBatchIndex] || [];

  // Reset index when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentBatchIndex(0);
      setCopiedUri(false);
    }
  }, [isOpen]);

  // Compute current batch migration URI
  const currentMigrationUri = useMemo(() => {
    if (!isOpen || activeBatch.length === 0) return '';
    return encodeMigrationPayload(activeBatch, currentBatchIndex, totalBatches, batchId);
  }, [isOpen, activeBatch, currentBatchIndex, totalBatches, batchId]);

  // Keyboard navigation (ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentBatchIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentBatchIndex((prev) => Math.min(totalBatches - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalBatches]);

  const handleCopyUri = async () => {
    if (!currentMigrationUri) return;
    await copyToClipboardSecurely(currentMigrationUri);
    setCopiedUri(true);
    toast.success('Enlace de migración copiado');
    setTimeout(() => setCopiedUri(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl z-50 focus:outline-none max-h-[92vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-zinc-100">
                  {t('backup.qrCarouselTitle') || 'Transferencia por Códigos QR'}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400">
                  {t('backup.qrCarouselSubtitle') || 'Escanea con Google Authenticator, Aegis o 2FAS'}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Privacy & Instructions Notice */}
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-300/90">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-200">
                {t('backup.qrCarouselWarning') || 'Asegúrate de estar en un entorno privado.'}
              </span>{' '}
              Abre Google Authenticator en tu teléfono, ve a{' '}
              <strong className="text-white">Transferir cuentas &gt; Importar cuentas</strong> y escanea
              cada código.
            </div>
          </div>

          {/* Carousel Step Bar */}
          <div className="mt-4 flex items-center justify-between px-2">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Código {currentBatchIndex + 1} de {totalBatches}
            </span>
            <span className="text-xs text-zinc-400">
              {items.length} cuentas en total
            </span>
          </div>

          {/* Segmented Progress Indicator */}
          {totalBatches > 1 && (
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${totalBatches}, 1fr)` }}>
              {batches.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentBatchIndex(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentBatchIndex
                      ? 'bg-blue-500'
                      : idx < currentBatchIndex
                      ? 'bg-zinc-600'
                      : 'bg-zinc-800'
                  }`}
                  title={`Ir al código ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* QR Code Container with Navigation Arrows */}
          <div className="mt-4 relative flex items-center justify-center p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            {totalBatches > 1 && (
              <button
                type="button"
                disabled={currentBatchIndex === 0}
                onClick={() => setCurrentBatchIndex((prev) => Math.max(0, prev - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-md z-10"
                title="Código anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <div className="flex flex-col items-center justify-center w-full min-h-[270px]">
              <QrCodeView
                value={currentMigrationUri}
                size={260}
                margin={3}
                alt={`Código QR lote ${currentBatchIndex + 1} de ${totalBatches}`}
              />
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>
                  Lote actual: <strong className="text-zinc-200">{activeBatch.length} cuentas</strong>
                </span>
              </div>
            </div>

            {totalBatches > 1 && (
              <button
                type="button"
                disabled={currentBatchIndex === totalBatches - 1}
                onClick={() => setCurrentBatchIndex((prev) => Math.min(totalBatches - 1, prev + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-md z-10"
                title="Siguiente código"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Accounts In This Batch (Preview) */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold text-zinc-300">
                {t('backup.qrCarouselAccountsInBatch', { count: activeBatch.length }) ||
                  `Cuentas en este código (${activeBatch.length})`}
              </h5>
              <button
                type="button"
                onClick={handleCopyUri}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                {copiedUri ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar URI del lote</span>
                  </>
                )}
              </button>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/60 divide-y divide-zinc-800/40">
              {activeBatch.map((acc) => (
                <div key={acc.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <BrandIcon
                      issuer={acc.issuer}
                      iconUrl={acc.icon_url}
                      size={20}
                      className="rounded shrink-0"
                    />
                    <span className="font-medium text-zinc-200 truncate">{acc.issuer}</span>
                    <span className="text-zinc-500 truncate">({acc.account})</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                    {acc.digits}d · {acc.algorithm}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
            {totalBatches > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentBatchIndex === 0}
                  onClick={() => setCurrentBatchIndex((prev) => Math.max(0, prev - 1))}
                  className="px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-40 rounded-xl transition-colors"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={currentBatchIndex === totalBatches - 1}
                  onClick={() => setCurrentBatchIndex((prev) => Math.min(totalBatches - 1, prev + 1))}
                  className="px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 rounded-xl transition-colors"
                >
                  Siguiente ({currentBatchIndex + 1}/{totalBatches})
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Bóveda completa en este código único</span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors ml-auto"
            >
              {t('common.close') || 'Cerrar'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
