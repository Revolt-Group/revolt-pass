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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-[#090a0f] border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_68px_rgba(0,0,0,0.8)] rounded-2xl p-6 text-zinc-100 overflow-hidden focus:outline-none">
          {/* Hairline highlight */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-white/10 shadow-inner flex items-center justify-center text-zinc-100">
                <Shield className="w-5 h-5 text-zinc-100" />
              </div>
              <div>
                <Dialog.Title className="text-base font-bold text-white tracking-tight">
                  Respaldo & Migración de Bóveda
                </Dialog.Title>
                <Dialog.Description className="text-xs text-zinc-400">
                  Exporta e importa tus cuentas y secretos de forma soberana
                </Dialog.Description>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs Selector */}
          <div className="flex bg-zinc-950/60 border border-white/[0.08] p-1 rounded-xl mb-5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'export'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Bóveda</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`flex-1 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                activeTab === 'import'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importar Respaldo</span>
            </button>
          </div>

          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4 text-xs">
              {/* Opción 1: Respaldo Cifrado (Recomendado) */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.08] space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                    <FileLock2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">Copia Cifrada AES-256-GCM</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        RECOMENDADO
                      </span>
                    </div>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      Genera un archivo <code>.json</code> cifrado con tu Contraseña Maestra actual.
                      Seguro para almacenar en Google Drive, Dropbox, pendrives o almacenamiento local.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportEncrypted}
                  disabled={isExporting}
                  className="w-full py-2.5 px-4 rounded-lg bg-white text-zinc-950 font-semibold text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.4)] disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Cifrando Bóveda...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar Copia Cifrada ({items.length} cuentas)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Opción 2: Respaldo en Texto Plano (Sensible) */}
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-amber-500/20 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                    <FileWarning className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-amber-200">Exportación en Texto Plano (JSON)</span>
                    <p className="text-zinc-400 mt-1 leading-relaxed">
                      Contiene todos los secretos y semillas TOTP en texto claro. Úsalo únicamente para
                      migrar a otro software o para respaldos en papel/entornos desconectados.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={plaintextConfirmed}
                    onChange={(e) => setPlaintextConfirmed(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/30"
                  />
                  <span>Comprendo los riesgos de seguridad y deseo continuar</span>
                </label>

                <button
                  type="button"
                  onClick={handleExportPlaintext}
                  disabled={!plaintextConfirmed}
                  className="w-full py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-all flex items-center justify-center gap-2 border border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar en Texto Plano</span>
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
                className="p-6 rounded-xl border border-dashed border-white/20 hover:border-violet-500/60 bg-zinc-950/60 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-zinc-900/40 group"
              >
                <FolderOpen className="w-8 h-8 text-zinc-500 group-hover:text-violet-400 mb-2 transition-colors" />
                <p className="font-semibold text-zinc-200">
                  Haz clic para seleccionar o arrastra un archivo .json
                </p>
                <p className="text-zinc-500 mt-1">
                  Soporta respaldos cifrados (.json) o texto plano (.json) de Revolt Pass
                </p>
              </div>

              {/* Status & Options if file loaded */}
              {stagedItems && (
                <div className="p-4 rounded-xl bg-zinc-900/70 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="font-semibold">Archivo Válido</span>
                    </div>
                    <span className="font-mono text-zinc-400">
                      {stagedItems.length} cuentas listas
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
                        className="text-violet-500 focus:ring-violet-500/30"
                      />
                      <span>
                        <strong>Fusionar:</strong> Conservar cuentas actuales y agregar o actualizar
                        las del archivo
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-rose-500 focus:ring-rose-500/30"
                      />
                      <span className="text-rose-300">
                        <strong>Reemplazar:</strong> Sobrescribir toda la bóveda con el contenido de este
                        archivo
                      </span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isProcessingImport}
                    className="w-full mt-2 py-2.5 px-4 rounded-lg bg-white text-zinc-950 font-semibold text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessingImport ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Restaurando Bóveda...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>Confirmar Restauración</span>
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
