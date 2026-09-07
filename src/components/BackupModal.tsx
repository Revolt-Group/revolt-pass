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
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  FileJson,
  AlertTriangle,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';

import type { VaultItem } from '../types/vault';
import {
  exportEncryptedBackup,
  exportPlaintextBackup,
  detectBackupFormat,
  importEncryptedBackup,
  triggerFileDownload,
} from '../lib/security/backup';
import {
  detectAndParseImport,
  analyzeReconciliation,
  applyReconciliation,
  type ReconciliationStrategy,
  type ReconciliationSummary,
  type ImportResult,
} from '../lib/importers/index';
import {
  exportVaultToAegis,
  exportVaultToBitwardenCsv,
  exportVaultToOtpAuthList,
} from '../lib/exporters/index';
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
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedContent, setPastedContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Parsed Import & Reconciliation State
  const [parsedImport, setParsedImport] = useState<ImportResult | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null);
  const [strategy, setStrategy] = useState<ReconciliationStrategy>('keep_existing');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset or initialize when modal opens
  const handleResetImportState = () => {
    setParsedImport(null);
    setReconciliation(null);
    setPastedContent('');
    setStrategy('keep_existing');
  };

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

  const handleExportAegis = () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const jsonContent = exportVaultToAegis(items);
      triggerFileDownload(jsonContent, `aegis-vault-${dateStr}.json`, 'application/json');
      toast.success('Bóveda en formato abierto Aegis JSON exportada');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al exportar';
      toast.error(msg);
    }
  };

  const handleExportBitwarden = () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const csvContent = exportVaultToBitwardenCsv(items);
      triggerFileDownload(csvContent, `bitwarden-vault-${dateStr}.csv`, 'text/csv;charset=utf-8;');
      toast.success('Bóveda CSV universal exportada');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al exportar';
      toast.error(msg);
    }
  };

  const handleExportOtpAuth = () => {
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const txtContent = exportVaultToOtpAuthList(items);
      triggerFileDownload(txtContent, `otpauth-tokens-${dateStr}.txt`, 'text/plain;charset=utf-8;');
      toast.success('Lista de enlaces otpauth:// exportada');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al exportar';
      toast.error(msg);
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
  // Import Processing (Universal & Reconciliation)
  // ---------------------------------------------------------------------------
  const processRawText = async (text: string, fileName?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Check if it's a native encrypted Revolt Pass backup first
    const nativeFormat = detectBackupFormat(trimmed);
    if (nativeFormat === 'encrypted') {
      if (!masterKey) {
        toast.error('Bóveda bloqueada: no se puede descifrar el respaldo cifrado');
        return;
      }
      try {
        const decryptedItems = await importEncryptedBackup(trimmed, masterKey);
        // Convert to ImportedAccount format for standard reconciliation preview
        const converted = decryptedItems.map((item) => ({
          name: item.account,
          issuer: item.issuer,
          secret: item.secret,
          type: item.type === 'totp' ? ('totp' as const) : ('hotp' as const),
          algorithm: item.algorithm === 'SHA256' ? ('SHA256' as const) : ('SHA1' as const),
          digits: item.digits,
          period: item.period,
          platform: 'unknown' as const,
        }));
        const summary = analyzeReconciliation(items, converted);
        setParsedImport({
          platform: 'unknown',
          platformLabel: 'Respaldo Cifrado Revolt Pass',
          accounts: converted,
          warnings: [],
        });
        setReconciliation(summary);
        toast.success(`Respaldo cifrado validado: ${converted.length} cuentas`);
        return;
      } catch {
        toast.error('No se pudo descifrar el archivo con la clave maestra actual.');
        return;
      }
    }

    // Otherwise, run Universal Platform Importer & Detector
    const res = detectAndParseImport(trimmed, fileName);

    if (res.accounts.length === 0) {
      if (res.warnings.length > 0) {
        toast.error(res.warnings[0]);
      } else {
        toast.error('No se detectaron cuentas válidas para importar en el contenido.');
      }
      return;
    }

    const summary = analyzeReconciliation(items, res.accounts);
    setParsedImport(res);
    setReconciliation(summary);
    toast.success(`${res.platformLabel}: ${res.accounts.length} cuentas identificadas`);
  };

  const handleFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      await processRawText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleApplyImport = () => {
    if (!reconciliation || !parsedImport) return;

    setIsProcessingImport(true);
    try {
      const merged = applyReconciliation(items, reconciliation, strategy);
      onVaultRestored(merged);
      toast.success(
        `Importación completada: ahora tienes ${merged.length} cuentas en tu bóveda.`
      );
      handleResetImportState();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al fusionar cuentas';
      toast.error(msg);
    } finally {
      setIsProcessingImport(false);
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleResetImportState();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl max-h-[90vh] bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_68px_rgba(0,0,0,0.8)] rounded-xl p-6 text-zinc-100 flex flex-col overflow-hidden focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] shrink-0">
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
          <div className="flex bg-[#08090a] border border-white/[0.06] p-1 rounded-lg my-4 text-xs shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('export');
                handleResetImportState();
              }}
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

          {/* Body Content - Scrollable */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs custom-scrollbar">
            {/* ================================================================= */}
            {/* TAB 1: EXPORT                                                     */}
            {/* ================================================================= */}
            {activeTab === 'export' && (
              <div className="space-y-3 text-xs">
                {/* 1. Encrypted Backup (Recommended) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#12141a] to-[#181a22] border border-white/[0.08] hairline-top space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                      <FileLock2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold text-white">
                        {t('backup.encryptedOptionTitle')}
                      </span>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                        {t('backup.encryptedOptionDesc')}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportEncrypted}
                    disabled={isExporting}
                    className="w-full py-2 px-3 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
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

                {/* 2. Aegis Authenticator JSON */}
                <div className="p-3.5 rounded-xl bg-[#16181d]/50 border border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                      <FileJson className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-white">{t('backup.exportAegisTitle')}</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('backup.exportAegisDesc')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportAegis}
                    className="py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] font-medium transition-all shrink-0 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>

                {/* 3. Bitwarden CSV */}
                <div className="p-3.5 rounded-xl bg-[#16181d]/50 border border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-white">{t('backup.exportBitwardenTitle')}</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('backup.exportBitwardenDesc')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportBitwarden}
                    className="py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] font-medium transition-all shrink-0 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>

                {/* 4. otpauth:// Plaintext List */}
                <div className="p-3.5 rounded-xl bg-[#16181d]/50 border border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-white">{t('backup.exportOtpAuthTitle')}</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {t('backup.exportOtpAuthDesc')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportOtpAuth}
                    className="py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] font-medium transition-all shrink-0 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>TXT</span>
                  </button>
                </div>

                {/* 5. Plaintext Revolt Pass JSON (Sensitive) */}
                <div className="p-3.5 rounded-xl bg-[#16181d]/50 border border-amber-500/20 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[#08090a] border border-amber-500/20 text-amber-400 shrink-0">
                      <FileWarning className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="font-semibold text-amber-200">{t('backup.plaintextOptionTitle')}</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
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
                    <span className="text-[11px]">{t('backup.confirmPlaintextCheckbox')}</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleExportPlaintext}
                    disabled={!plaintextConfirmed}
                    className="w-full py-2 px-3 rounded-lg bg-[#16181d] hover:bg-[#1c1f24] text-zinc-200 font-medium text-xs transition-all flex items-center justify-center gap-2 border border-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('backup.exportPlaintextButton')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ================================================================= */}
            {/* TAB 2: IMPORT                                                     */}
            {/* ================================================================= */}
            {activeTab === 'import' && (
              <div className="space-y-4 text-xs">
                {/* Platform Compatibility Showcase Pills */}
                <div className="flex flex-wrap gap-1 text-[10px] text-zinc-400 pb-1">
                  <span className="text-zinc-500">Compatibilidad:</span>
                  {[
                    'Google Authenticator',
                    'Authy',
                    'Aegis',
                    '2FAS',
                    'Bitwarden',
                    '1Password',
                    'Proton Pass',
                    'Ente',
                    'LastPass',
                    'otpauth://',
                  ].map((p) => (
                    <span
                      key={p}
                      className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-300 font-mono"
                    >
                      {p}
                    </span>
                  ))}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,.2fas,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                />

                {!parsedImport ? (
                  <>
                    {/* Dropzone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileSelected(file);
                      }}
                      className={`p-6 rounded-xl border border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer group ${
                        isDragging
                          ? 'border-white bg-white/[0.04]'
                          : 'border-white/[0.15] hover:border-white/40 bg-[#08090a]'
                      }`}
                    >
                      <FolderOpen className="w-8 h-8 text-zinc-500 group-hover:text-white mb-2 transition-colors" />
                      <p className="font-medium text-zinc-200">
                        {t('backup.dropzoneTitle')}
                      </p>
                      <p className="text-zinc-500 mt-1 font-mono text-[11px]">
                        {t('backup.dropzoneBrowse')}
                      </p>
                    </div>

                    {/* Toggle Paste Raw Content */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setPasteMode(!pasteMode)}
                        className="text-zinc-400 hover:text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>{t('backup.pasteOption')}</span>
                      </button>

                      {pasteMode && (
                        <div className="mt-2.5 space-y-2 animate-in fade-in">
                          <textarea
                            rows={4}
                            value={pastedContent}
                            onChange={(e) => setPastedContent(e.target.value)}
                            placeholder={t('backup.pastePlaceholder')}
                            className="w-full bg-[#08090a] border border-white/10 rounded-lg p-2.5 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-white/30 resize-none"
                          />
                          <button
                            type="button"
                            onClick={() => processRawText(pastedContent)}
                            disabled={!pastedContent.trim()}
                            className="py-1.5 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10 font-medium text-xs transition-all disabled:opacity-40"
                          >
                            {t('backup.pasteParseButton')}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  /* ========================================================= */
                  /* RECONCILIATION PREVIEW & STRATEGY VIEW                    */
                  /* ========================================================= */
                  <div className="space-y-4 animate-in fade-in">
                    {/* Platform Banner */}
                    <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#12141a] to-[#181a22] border border-white/[0.08] hairline-top flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {parsedImport.platformLabel}
                          </span>
                          <span className="font-semibold text-white">
                            {t('backup.detectedAccounts', { count: parsedImport.accounts.length })}
                          </span>
                        </div>

                        {/* Counts badges */}
                        {reconciliation && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-[10px]">
                              {reconciliation.newCount} {t('backup.diffNew')}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium text-[10px]">
                              {reconciliation.duplicateCount} {t('backup.diffDuplicate')}
                            </span>
                            {reconciliation.conflictCount > 0 && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium text-[10px]">
                                {reconciliation.conflictCount} {t('backup.diffConflict')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleResetImportState}
                        className="py-1 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/[0.06] text-[11px] transition-colors"
                      >
                        Cambiar archivo
                      </button>
                    </div>

                    {/* Warnings if any */}
                    {parsedImport.warnings.length > 0 && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Observaciones durante la importación:</span>
                        </div>
                        {parsedImport.warnings.map((w, idx) => (
                          <p key={idx} className="text-zinc-400 text-[10px] pl-5">
                            • {w}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Reconciliation Strategy Radio Selector */}
                    <div className="p-3.5 rounded-xl bg-[#16181d]/50 border border-white/[0.06] space-y-2">
                      <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider block">
                        Estrategia de Sincronización
                      </span>

                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2.5 text-zinc-200 cursor-pointer p-1.5 rounded-lg hover:bg-white/[0.02]">
                          <input
                            type="radio"
                            name="strategy"
                            value="keep_existing"
                            checked={strategy === 'keep_existing'}
                            onChange={() => setStrategy('keep_existing')}
                            className="text-white focus:ring-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-xs block">{t('backup.strategyKeepExisting')}</span>
                            <span className="text-[10px] text-zinc-500">
                              Agrega solo las cuentas nuevas. Conserva las que ya tengas sin cambios.
                            </span>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 text-zinc-200 cursor-pointer p-1.5 rounded-lg hover:bg-white/[0.02]">
                          <input
                            type="radio"
                            name="strategy"
                            value="overwrite"
                            checked={strategy === 'overwrite'}
                            onChange={() => setStrategy('overwrite')}
                            className="text-white focus:ring-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-xs block">{t('backup.strategyOverwrite')}</span>
                            <span className="text-[10px] text-zinc-500">
                              Actualiza las cuentas coincidentes con las claves del archivo importado.
                            </span>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 text-zinc-200 cursor-pointer p-1.5 rounded-lg hover:bg-white/[0.02]">
                          <input
                            type="radio"
                            name="strategy"
                            value="keep_both"
                            checked={strategy === 'keep_both'}
                            onChange={() => setStrategy('keep_both')}
                            className="text-white focus:ring-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-xs block">{t('backup.strategyKeepBoth')}</span>
                            <span className="text-[10px] text-zinc-500">
                              Conserva las actuales y añade las importadas con la etiqueta "(Importado)".
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Reconciliation Preview Items List */}
                    {reconciliation && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                          Vista previa de cuentas ({reconciliation.diffs.length})
                        </span>

                        {reconciliation.diffs.map((d, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-[#16181d]/30 border border-white/[0.04] flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="p-1.5 rounded-md bg-[#08090a] border border-white/[0.06] text-zinc-300 shrink-0">
                                <Key className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-white truncate">
                                  {d.account.issuer}
                                </div>
                                <div className="text-[11px] text-zinc-400 truncate">
                                  {d.account.name}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {d.status === 'new' && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
                                  {t('backup.diffNew')}
                                </span>
                              )}
                              {d.status === 'duplicate' && (
                                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-medium">
                                  {t('backup.diffDuplicate')}
                                </span>
                              )}
                              {d.status === 'conflict' && (
                                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-medium">
                                  {t('backup.diffConflict')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Apply Button */}
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      disabled={isProcessingImport}
                      className="w-full py-2.5 px-4 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isProcessingImport ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                          <span>Procesando...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                          <span>
                            {t('backup.applyImport', { count: parsedImport.accounts.length })}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 mt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('common.zeroKnowledgeBadge')}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                handleResetImportState();
                onClose();
              }}
              className="py-1.5 px-3.5 rounded-lg bg-[#16181d] text-zinc-200 border border-white/[0.08] font-medium hover:bg-[#1c1f24] hover:text-white transition-all text-xs"
            >
              {t('common.close')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
