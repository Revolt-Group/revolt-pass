import { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Shield,
  Download,
  Upload,
  X,
  FileLock2,
  FileWarning,
  CheckCircle2,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';

import type { VaultItem } from '../types/vault';
import {
  exportEncryptedBackup,
  exportPlaintextBackup,
  detectBackupFormat,
  importEncryptedBackup,
  importPlaintextBackup,
  mergeVaultItems,
  triggerFileDownload,
} from '../lib/security/backup';
import { useTranslation } from '../i18n/index.ts';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: VaultItem[];
  masterKey: CryptoKey | null;
  kdfSalt: string;
  onVaultRestored: (newItems: VaultItem[]) => void;
}

export function BackupModal({
  isOpen,
  onClose,
  items,
  masterKey,
  kdfSalt,
  onVaultRestored,
}: BackupModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export State
  const [plaintextConfirmed, setPlaintextConfirmed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Import State
  const [stagedItems, setStagedItems] = useState<VaultItem[] | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isProcessingImport, setIsProcessingImport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ---------------------------------------------------------------------------
  // Export Handlers
  // ---------------------------------------------------------------------------
  const handleExportEncrypted = async () => {
    if (!masterKey) {
      toast.error('La bóveda está bloqueada. No se puede exportar.');
      return;
    }

    setIsExporting(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const jsonContent = await exportEncryptedBackup(items, masterKey, kdfSalt);
      triggerFileDownload(
        jsonContent,
        `revolt-pass-encrypted-${dateStr}.json`,
        'application/json'
      );
      localStorage.setItem('revolt_last_backup', Date.now().toString());
      window.dispatchEvent(new Event('revolt:backup-updated'));
      toast.success('Copia de seguridad cifrada (AES-256-GCM) descargada');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al exportar';
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPlaintext = () => {
    if (!plaintextConfirmed) {
      toast.error('Debes confirmar que comprendes los riesgos');
      return;
    }

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const jsonContent = exportPlaintextBackup(items);
      triggerFileDownload(
        jsonContent,
        `revolt-pass-plaintext-${dateStr}.json`,
        'application/json'
      );
      localStorage.setItem('revolt_last_backup', Date.now().toString());
      window.dispatchEvent(new Event('revolt:backup-updated'));
      toast.warning('Archivo en texto plano descargado. Guárdalo en un medio seguro.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al exportar';
      toast.error(msg);
    }
  };

  // ---------------------------------------------------------------------------
  // Import Handlers
  // ---------------------------------------------------------------------------
  const handleFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const format = detectBackupFormat(text);

      if (format === 'invalid') {
        toast.error('El archivo no tiene un formato de respaldo válido de Revolt Pass');
        setStagedItems(null);
        return;
      }

      try {
        if (format === 'encrypted') {
          if (!masterKey) {
            toast.error('Bóveda bloqueada: no se puede descifrar el archivo');
            return;
          }
          const decrypted = await importEncryptedBackup(text, masterKey);
          setStagedItems(decrypted);
          toast.success(`Archivo cifrado válido: ${decrypted.length} cuentas encontradas`);
        } else {
          const plainItems = importPlaintextBackup(text);
          setStagedItems(plainItems);
          toast.success(`Archivo en texto plano válido: ${plainItems.length} cuentas encontradas`);
        }
      } catch {
        toast.error('No se pudo descifrar el archivo. ¿Fue cifrado con una contraseña maestra distinta?');
        setStagedItems(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!stagedItems) return;

    setIsProcessingImport(true);
    try {
      let finalItems: VaultItem[];
      if (importMode === 'merge') {
        finalItems = mergeVaultItems(items, stagedItems);
        toast.success(`Fusión completada: ahora tienes ${finalItems.length} cuentas en total`);
      } else {
        finalItems = stagedItems;
        toast.success(`Bóveda reemplazada: ${finalItems.length} cuentas restauradas`);
      }

      onVaultRestored(finalItems);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la importación';
      toast.error(msg);
    } finally {
      setIsProcessingImport(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_68px_rgba(0,0,0,0.8)] rounded-xl p-6 text-zinc-100 overflow-hidden focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top flex items-center justify-center text-white">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-white tracking-tight">
                  {t('backup.title')}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400">
                  {t('backup.subtitle')}
                </Dialog.Description>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs Selector */}
          <div className="flex bg-[#08090a] border border-white/[0.06] p-1 rounded-lg mb-5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'export'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('backup.exportTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`flex-1 py-1.5 rounded-md font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'import'
                  ? 'bg-[#16181d] text-white border border-white/[0.08] shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t('backup.importTab')}</span>
            </button>
          </div>

          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4 text-xs">
              {/* Option 1: Encrypted Backup (Recommended) */}
              <div className="p-4 rounded-lg bg-[#16181d]/50 border border-white/[0.06] space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-[#08090a] border border-emerald-500/20 text-emerald-400 shrink-0">
                    <FileLock2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{t('backup.encryptedOptionTitle')}</span>
                    </div>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      {t('backup.encryptedOptionDesc')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportEncrypted}
                  disabled={isExporting}
                  className="w-full py-2 px-4 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                      <span>{t('common.loading')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-black" />
                      <span>{t('backup.exportEncryptedButton')} ({items.length})</span>
                    </>
                  )}
                </button>
              </div>

              {/* Option 2: Plaintext Backup (Sensitive) */}
              <div className="p-4 rounded-lg bg-[#16181d]/50 border border-amber-500/20 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-[#08090a] border border-amber-500/20 text-amber-400 shrink-0">
                    <FileWarning className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-amber-200">{t('backup.plaintextOptionTitle')}</span>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      {t('backup.plaintextOptionDesc')}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-zinc-300 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plaintextConfirmed}
                    onChange={(e) => setPlaintextConfirmed(e.target.checked)}
                    className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0"
                  />
                  <span>{t('backup.confirmPlaintextCheckbox')}</span>
                </label>

                <button
                  type="button"
                  onClick={handleExportPlaintext}
                  disabled={!plaintextConfirmed}
                  className="w-full py-2 px-4 rounded-lg bg-[#16181d] hover:bg-[#1c1f24] text-zinc-200 font-medium text-xs transition-all flex items-center justify-center gap-2 border border-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('backup.exportPlaintextButton')}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-4 text-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
              />

              {/* File Dropzone / Selector */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-lg border border-dashed border-white/[0.15] hover:border-white/40 bg-[#08090a] flex flex-col items-center justify-center text-center cursor-pointer transition-colors group"
              >
                <FolderOpen className="w-7 h-7 text-zinc-500 group-hover:text-white mb-2 transition-colors" />
                <p className="font-medium text-zinc-200">
                  {t('backup.dropzoneTitle')}
                </p>
                <p className="text-zinc-500 mt-1 font-mono text-[11px]">
                  {t('backup.dropzoneBrowse')}
                </p>
              </div>

              {/* Status & Options if file loaded */}
              {stagedItems && (
                <div className="p-4 rounded-lg bg-[#16181d]/50 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="font-medium">{t('backup.fileSelected')}</span>
                    </div>
                    <span className="font-mono text-zinc-400">
                      {stagedItems.length}
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="text-white focus:ring-0"
                      />
                      <span>{t('backup.importModeMerge')}</span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-rose-400 focus:ring-0"
                      />
                      <span className="text-rose-300">{t('backup.importModeReplace')}</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isProcessingImport}
                    className="w-full mt-2 py-2 px-4 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessingImport ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                        <span>{t('common.loading')}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-black" />
                        <span>{t('backup.confirmImportButton')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
