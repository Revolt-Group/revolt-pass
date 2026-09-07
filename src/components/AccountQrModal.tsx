import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, QrCode, Copy, Check, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon';
import { QrCodeView } from './QrCodeView';
import { buildOtpAuthUri } from '../lib/exporters/protobufEncoder';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard';
import { useTranslation } from '../i18n/index';
import type { VaultItem } from '../types/vault';

interface AccountQrModalProps {
  item: VaultItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AccountQrModal({ item, isOpen, onClose }: AccountQrModalProps) {
  const { t } = useTranslation();
  const [copiedUri, setCopiedUri] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCopiedUri(false);
      setCopiedSecret(false);
      setRevealSecret(false);
    }
  }, [isOpen]);

  if (!item) return null;

  const uri = buildOtpAuthUri(item);

  const handleCopyUri = async () => {
    await copyToClipboardSecurely(uri);
    setCopiedUri(true);
    toast.success(t('common.copied') || 'Enlace copiado');
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const handleCopySecret = async () => {
    await copyToClipboardSecurely(item.secret);
    setCopiedSecret(true);
    toast.success('Clave secreta copiada (se limpiará en 45s)');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl z-50 focus:outline-none max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-zinc-100">
                  {t('accountQr.title') || 'Código QR de la Cuenta'}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400">
                  {t('accountQr.subtitle') || 'Escanea para transferir a otro dispositivo'}
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

          {/* Account Identity Card */}
          <div className="mt-4 p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <BrandIcon
                issuer={item.issuer}
                iconUrl={item.icon_url}
                size={36}
                className="rounded-lg shrink-0"
              />
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-zinc-200 truncate">
                  {item.issuer || t('audit.unknownDevice') || 'Cuenta'}
                </h4>
                <p className="text-xs text-zinc-400 truncate">{item.account}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-300 rounded-md border border-zinc-700/50">
                {item.digits}d
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-zinc-800 text-zinc-300 rounded-md border border-zinc-700/50">
                {item.algorithm}
              </span>
            </div>
          </div>

          {/* QR Code Canvas / SVG Wrapper */}
          <div className="mt-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/60">
            <QrCodeView
              value={uri}
              size={250}
              margin={3}
              alt={`Código QR ${item.issuer} ${item.account}`}
            />
            <p className="mt-3 text-[11px] text-zinc-400 text-center flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{t('accountQr.scanHelp') || 'Escaneable por Google Auth, Aegis, 2FAS, Microsoft, etc.'}</span>
            </p>
          </div>

          {/* Secret Display & Actions */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-zinc-400">
                {t('accountQr.secretLabel') || 'Clave Secreta Base32'}
              </span>
              <button
                type="button"
                onClick={() => setRevealSecret(!revealSecret)}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                {revealSecret ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Ocultar</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Revelar</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 font-mono text-xs text-zinc-300 justify-between">
              <span className="truncate px-1 tracking-wider select-all">
                {revealSecret ? item.secret : '••••••••••••••••••••••••'}
              </span>
              <button
                type="button"
                onClick={handleCopySecret}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors shrink-0"
                title="Copiar secreto"
              >
                {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Copy Universal URI Action */}
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCopyUri}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-xl border border-zinc-700/60 transition-colors"
            >
              {copiedUri ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('common.copied') || 'Copiado'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('accountQr.copyUri') || 'Copiar Enlace otpauth://'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors"
            >
              {t('common.close') || 'Cerrar'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
