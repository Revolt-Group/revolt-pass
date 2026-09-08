import { useState, useEffect, useCallback } from 'react';
import {
  Pin,
  MoreVertical,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  ExternalLink,
  CreditCard,
  FileText,
  Terminal,
  User,
  RotateCcw,
  History,
  Clock,
  Shield,
  Key,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { TotpCard } from './TotpCard.tsx';
import { generateTotp, getTotpRemainingSeconds } from '../lib/crypto/totp.ts';
import { getTimeDriftOffsetMs } from '../lib/sync/timeSync.ts';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
import type { VaultItem } from '../types/vault.ts';

interface PolymorphicItemCardProps {
  item: VaultItem;
  viewMode?: 'grid' | 'list';
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onPurge?: (id: string) => void;
  onToggleRecoveryCode?: (id: string, codeIndex: number) => void;
  onEdit?: (item: VaultItem) => void;
}

export function PolymorphicItemCard({
  item,
  viewMode = 'grid',
  onTogglePin,
  onDelete,
  onRestore,
  onPurge,
  onToggleRecoveryCode,
  onEdit,
}: PolymorphicItemCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showCvv, setShowCvv] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Inline TOTP for Login items with 2FA seed
  const [inlineTotp, setInlineTotp] = useState<string>('------');
  const [inlineRemaining, setInlineRemaining] = useState<number>(30);

  const isTrash = typeof item.deleted_at === 'number';

  // Update inline TOTP code if present
  const totpSeed = item.login_data?.totp_seed || item.secret;
  const updateInlineTotp = useCallback(async () => {
    if (!totpSeed) return;
    try {
      const offsetMs = getTimeDriftOffsetMs();
      const code = await generateTotp(totpSeed, {
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
        timeDriftOffsetMs: offsetMs,
      });
      setInlineTotp(code);
      setInlineRemaining(getTotpRemainingSeconds(30, offsetMs));
    } catch {
      setInlineTotp('ERROR');
    }
  }, [totpSeed]);

  useEffect(() => {
    if (totpSeed && item.type === 'login' && !isTrash) {
      updateInlineTotp();
      const interval = setInterval(updateInlineTotp, 1000);
      return () => clearInterval(interval);
    }
  }, [totpSeed, item.type, isTrash, updateInlineTotp]);

  // If item is TOTP and not in trash, delegate directly to TotpCard for full timer & recovery codes
  if (item.type === 'totp' && !isTrash) {
    return (
      <TotpCard
        item={item}
        viewMode={viewMode}
        onTogglePin={onTogglePin}
        onDelete={onDelete}
        onToggleRecoveryCode={onToggleRecoveryCode || (() => {})}
        onEdit={onEdit}
      />
    );
  }

  const copyValue = async (value: string, fieldName: string, message: string) => {
    if (!value) return;
    await copyToClipboardSecurely(value, 45000);
    setCopiedField(fieldName);
    toast.success(message);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Remaining days in trash
  const daysInTrash = isTrash
    ? Math.max(0, 30 - Math.floor((Date.now() - (item.deleted_at || Date.now())) / (24 * 60 * 60 * 1000)))
    : 0;

  // ---------------------------------------------------------------------------
  // TRASH BIN VIEW (When soft-deleted)
  // ---------------------------------------------------------------------------
  if (isTrash) {
    return (
      <div className="bg-[#0c0d10] border border-red-500/20 rounded-xl p-4 flex flex-col justify-between gap-3 relative overflow-hidden transition-all opacity-85 hover:opacity-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-zinc-200 truncate">{item.issuer || 'Secreto sin título'}</h4>
              <p className="text-xs text-zinc-500 truncate">{item.account || item.type.toUpperCase()}</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            Purga en {daysInTrash}d
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]">
          {onRestore && (
            <button
              type="button"
              onClick={() => onRestore(item.id)}
              className="px-2.5 py-1 rounded-lg bg-[#16181d] hover:bg-white/[0.08] text-xs text-zinc-300 flex items-center gap-1.5 transition-colors border border-white/[0.08]"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Restaurar</span>
            </button>
          )}
          {onPurge && (
            <button
              type="button"
              onClick={() => onPurge(item.id)}
              className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-xs text-red-300 flex items-center gap-1.5 transition-colors border border-red-500/30"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Eliminar definitivamente</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ACTIVE POLYMORPHIC CARD
  // ---------------------------------------------------------------------------
  return (
    <div className="bg-[#0f1013] border border-white/[0.08] rounded-xl p-4 flex flex-col justify-between gap-3 relative transition-all hover:border-white/[0.16] shadow-sm">
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {item.type === 'card' ? (
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
          ) : item.type === 'note' ? (
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
          ) : item.type === 'server_key' ? (
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
          ) : item.type === 'identity' ? (
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <BrandIcon
              issuer={item.issuer || item.account}
              iconUrl={item.icon_url}
              size={36}
              className="shrink-0"
            />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold text-white truncate">{item.issuer || 'Secreto'}</h4>
              {item.pinned && (
                <Pin className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
              )}
            </div>
            <p className="text-xs text-zinc-400 truncate">{item.account}</p>
          </div>
        </div>

        {/* Dropdown Menu */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="w-44 bg-[#16181d] border border-white/[0.1] rounded-xl p-1 shadow-2xl text-xs text-zinc-300 z-50 animate-in fade-in zoom-in-95"
            >
              <DropdownMenu.Item
                onClick={() => onTogglePin(item.id)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] hover:text-white cursor-pointer outline-none"
              >
                <Pin className="w-3.5 h-3.5" />
                <span>{item.pinned ? 'Desfijar' : 'Fijar arriba'}</span>
              </DropdownMenu.Item>
              {onEdit && (
                <DropdownMenu.Item
                  onClick={() => onEdit(item)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] hover:text-white cursor-pointer outline-none"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar secreto</span>
                </DropdownMenu.Item>
              )}
              {item.login_data?.password_history && item.login_data.password_history.length > 0 && (
                <DropdownMenu.Item
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] hover:text-white cursor-pointer outline-none"
                >
                  <History className="w-3.5 h-3.5 text-blue-400" />
                  <span>Historial ({item.login_data.password_history.length})</span>
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="h-[1px] bg-white/[0.08] my-1" />
              <DropdownMenu.Item
                onClick={() => onDelete(item.id)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer outline-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Mover a papelera</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* TYPE-SPECIFIC BODY                                                  */}
      {/* -------------------------------------------------------------------- */}

      {/* LOGIN ITEM */}
      {item.type === 'login' && (
        <div className="space-y-2 pt-1">
          {/* Password field with copy and reveal */}
          {item.login_data?.password && (
            <div className="flex items-center justify-between bg-[#08090a] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs">
              <span className="font-mono text-zinc-300 tracking-wider">
                {showPassword ? item.login_data.password : '••••••••••••'}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyValue(item.login_data!.password!, 'password', 'Contraseña copiada (se borrará en 45s)')}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Inline 2FA TOTP */}
          {totpSeed && (
            <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] rounded-lg px-2.5 py-1 text-xs">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-mono font-bold text-white tracking-widest">{inlineTotp}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 font-mono">{inlineRemaining}s</span>
                <button
                  type="button"
                  onClick={() => copyValue(inlineTotp, 'totp', 'Código 2FA copiado')}
                  className="p-1 text-zinc-500 hover:text-zinc-300"
                >
                  {copiedField === 'totp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* URL shortcut */}
          {item.login_data?.urls && item.login_data.urls.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 truncate pt-0.5">
              <ExternalLink className="w-3 h-3 shrink-0" />
              <a
                href={item.login_data.urls[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 truncate hover:underline"
              >
                {item.login_data.urls[0].replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}

          {/* Password History Drawer */}
          {showHistory && item.login_data?.password_history && (
            <div className="mt-2 p-2.5 bg-[#16181d] border border-white/[0.08] rounded-lg text-[11px] space-y-1.5">
              <div className="text-zinc-400 font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Últimas contraseñas anteriores:</span>
              </div>
              {item.login_data.password_history.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-0.5 font-mono text-zinc-300">
                  <span className="truncate max-w-[160px]">{h.password}</span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(h.changed_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PAYMENT CARD ITEM */}
      {item.type === 'card' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between bg-[#08090a] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs font-mono">
            <span className="tracking-widest text-zinc-200">
              {item.card_data?.card_number
                ? `•••• •••• •••• ${item.card_data.card_number.slice(-4)}`
                : '•••• •••• •••• ••••'}
            </span>
            {item.card_data?.card_number && (
              <button
                type="button"
                onClick={() => copyValue(item.card_data!.card_number!, 'cardNumber', 'Número de tarjeta copiado')}
                className="p-1 text-zinc-500 hover:text-zinc-300"
              >
                {copiedField === 'cardNumber' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>
              Vence:{' '}
              <strong className="text-zinc-200 font-mono">
                {item.card_data?.exp_month || 'MM'}/{item.card_data?.exp_year || 'AA'}
              </strong>
            </span>
            {item.card_data?.cvv && (
              <div className="flex items-center gap-1">
                <span>CVV:</span>
                <span className="font-mono text-zinc-200 font-bold">
                  {showCvv ? item.card_data.cvv : '•••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCvv(!showCvv)}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300"
                >
                  {showCvv ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyValue(item.card_data!.cvv!, 'cvv', 'CVV copiado (se borrará en 45s)')}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300"
                >
                  {copiedField === 'cvv' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECURE NOTE ITEM */}
      {item.type === 'note' && (
        <div className="pt-1">
          <div className="bg-[#08090a] border border-white/[0.06] rounded-lg p-2.5 text-xs text-zinc-300 font-mono max-h-24 overflow-y-auto leading-relaxed whitespace-pre-wrap">
            {item.note_data?.content_markdown || item.notes || 'Nota sin contenido'}
          </div>
        </div>
      )}

      {/* SERVER / SSH KEY ITEM */}
      {item.type === 'server_key' && (
        <div className="space-y-1.5 pt-1 text-xs">
          <div className="flex items-center justify-between bg-[#08090a] border border-white/[0.06] rounded-lg px-2.5 py-1.5 font-mono text-zinc-300">
            <span className="truncate">
              ssh {item.server_key_data?.username || 'root'}@{item.server_key_data?.host || 'localhost'}
              {item.server_key_data?.port && item.server_key_data.port !== 22 ? ` -p ${item.server_key_data.port}` : ''}
            </span>
            <button
              type="button"
              onClick={() =>
                copyValue(
                  `ssh ${item.server_key_data?.username || 'root'}@${item.server_key_data?.host || 'localhost'}${
                    item.server_key_data?.port && item.server_key_data.port !== 22 ? ` -p ${item.server_key_data.port}` : ''
                  }`,
                  'ssh',
                  'Comando SSH copiado'
                )
              }
              className="p-1 text-zinc-500 hover:text-zinc-300 shrink-0"
            >
              {copiedField === 'ssh' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {item.server_key_data?.public_key && (
            <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <span>Clave pública configurada</span>
              <button
                type="button"
                onClick={() => copyValue(item.server_key_data!.public_key!, 'pubkey', 'Clave pública SSH copiada')}
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                <span>Copiar clave pública</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* IDENTITY ITEM */}
      {item.type === 'identity' && (
        <div className="space-y-1 pt-1 text-xs text-zinc-400">
          {item.identity_data?.id_number && (
            <div className="flex items-center justify-between bg-[#08090a] border border-white/[0.06] rounded-lg px-2.5 py-1">
              <span>DNI / Cédula:</span>
              <span className="font-mono text-zinc-200 font-medium">{item.identity_data.id_number}</span>
            </div>
          )}
          {item.identity_data?.passport_number && (
            <div className="flex items-center justify-between px-1 text-[11px]">
              <span>Pasaporte:</span>
              <span className="font-mono text-zinc-300">{item.identity_data.passport_number}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
