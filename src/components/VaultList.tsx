import { useState, useMemo } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  Search,
  Plus,
  Pin,
  ShieldOff,
  Filter,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import { TotpCard } from './TotpCard.tsx';
import type { VaultItem } from '../types/vault.ts';

interface VaultListProps {
  items: VaultItem[];
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleRecoveryCode: (id: string, codeIndex: number) => void;
  onOpenAddModal: () => void;
  onEditAccount: (item: VaultItem) => void;
}

export function VaultList({
  items,
  onTogglePin,
  onDelete,
  onToggleRecoveryCode,
  onOpenAddModal,
  onEditAccount,
}: VaultListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [parentListRef] = useAutoAnimate<HTMLDivElement>();
  const [pinnedListRef] = useAutoAnimate<HTMLDivElement>();

  // Extract all unique tags across registered accounts
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.tags) {
        for (const t of item.tags) {
          set.add(t);
        }
      }
    }
    return Array.from(set).sort();
  }, [items]);

  // Filter accounts by search query and selected tag
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const matchSearch =
        !q ||
        item.issuer.toLowerCase().includes(q) ||
        item.account.toLowerCase().includes(q) ||
        item.tags?.some((t) => t.toLowerCase().includes(q));

      const matchTag = !selectedTag || item.tags?.includes(selectedTag);

      return matchSearch && matchTag;
    });
  }, [items, searchQuery, selectedTag]);

  const pinnedItems = filteredItems.filter((i) => i.pinned);
  const regularItems = filteredItems.filter((i) => !i.pinned);

  return (
    <div className="w-full space-y-5">
      {/* Filters, Search, and Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#0f1013] border border-white/[0.08] p-2 rounded-xl hairline-top shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cuenta, usuario o etiqueta... (Ctrl + K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-[#08090a] border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#16181d] text-white border border-white/[0.08]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Vista en cuadrícula"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#16181d] text-white border border-white/[0.08]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Vista compacta de lista"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Account Button */}
          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-3 py-1.5 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-medium shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-black" />
            <span>Nueva Cuenta</span>
          </button>
        </div>
      </div>

      {/* Tag Filter Pills */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
          <span className="text-zinc-500 flex items-center gap-1 px-1 text-[11px] font-mono uppercase">
            <Filter className="w-3 h-3" />
            Filtros:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              selectedTag === null
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'bg-[#16181d] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Todos ({items.length})
          </button>
          {allTags.map((tag) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(isSelected ? null : tag)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'bg-[#16181d] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State: Empty Vault */}
      {items.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/[0.08] rounded-2xl bg-[#0f1013]/50">
          <div className="w-12 h-12 rounded-xl bg-[#16181d] border border-white/[0.1] hairline-top flex items-center justify-center text-zinc-300 mb-3.5">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">Tu bóveda está vacía</h3>
          <p className="text-xs text-zinc-400 max-w-sm mb-5">
            Vincula tus cuentas de GitHub, AWS, Google o cualquier servicio compatible con TOTP para proteger tus accesos.
          </p>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-medium shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5 text-black" />
            <span>Vincular Primera Cuenta 2FA</span>
          </button>
        </div>
      )}

      {/* Empty State: No Search Results */}
      {items.length > 0 && filteredItems.length === 0 && (
        <div className="py-14 flex flex-col items-center justify-center text-center p-6 border border-white/[0.08] rounded-xl bg-[#0f1013]/50">
          <ShieldOff className="w-8 h-8 text-zinc-500 mb-2.5" />
          <h4 className="text-sm font-semibold text-white mb-1">Sin coincidencias</h4>
          <p className="text-xs text-zinc-400 mb-4">
            No se encontraron cuentas para el filtro actual.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedTag(null);
            }}
            className="px-3 py-1.5 bg-[#16181d] hover:bg-[#1c1f24] text-zinc-300 border border-white/[0.08] rounded-lg text-xs"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Section 1: Pinned Accounts */}
      {pinnedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider px-1">
            <Pin className="w-3 h-3 text-zinc-300" />
            <span>Cuentas Prioritarias ({pinnedItems.length})</span>
          </div>
          <div
            ref={pinnedListRef}
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5'
                : 'flex flex-col gap-2'
            }
          >
            {pinnedItems.map((item) => (
              <TotpCard
                key={item.id}
                item={item}
                viewMode={viewMode}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
                onToggleRecoveryCode={onToggleRecoveryCode}
                onEdit={onEditAccount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section 2: All Remaining Accounts */}
      {regularItems.length > 0 && (
        <div>
          {pinnedItems.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-mono font-medium text-zinc-500 uppercase tracking-wider px-1">
              <span>Todas las Cuentas ({regularItems.length})</span>
            </div>
          )}
          <div
            ref={parentListRef}
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5'
                : 'flex flex-col gap-2'
            }
          >
            {regularItems.map((item) => (
              <TotpCard
                key={item.id}
                item={item}
                viewMode={viewMode}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
                onToggleRecoveryCode={onToggleRecoveryCode}
                onEdit={onEditAccount}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
