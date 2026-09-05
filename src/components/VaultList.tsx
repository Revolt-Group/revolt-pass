import { useState, useMemo } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  Search,
  Plus,
  Pin,
  ShieldOff,
  Filter,
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

  const [parentListRef] = useAutoAnimate<HTMLDivElement>();
  const [pinnedListRef] = useAutoAnimate<HTMLDivElement>();

  // Extraer todos los tags únicos de las cuentas registradas
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

  // Filtrar cuentas por búsqueda y tag seleccionado
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
    <div className="w-full space-y-6">
      {/* Barra de Filtros, Búsqueda y Acción Superior */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/40 border border-zinc-800/80 p-2.5 rounded-2xl backdrop-blur-xl">
        {/* Input de Búsqueda */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, cuenta o etiqueta... (Ctrl + K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-950/60 border border-zinc-800/80 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {/* Botón de Agregar Cuenta */}
        <button
          type="button"
          onClick={onOpenAddModal}
          className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Cuenta</span>
        </button>
      </div>

      {/* Pills de Filtrado por Etiquetas (Tags) */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs select-none">
          <span className="text-zinc-500 flex items-center gap-1 px-1.5 text-[11px]">
            <Filter className="w-3 h-3" />
            Tags:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedTag === null
                ? 'bg-violet-600/20 border border-violet-500/40 text-violet-300 font-semibold'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
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
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-violet-600/20 border border-violet-500/40 text-violet-300 font-semibold'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State: Bóveda sin Cuentas */}
      {items.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800 rounded-3xl bg-zinc-950/40">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-4 shadow-xl">
            <Plus className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">Tu bóveda está vacía</h3>
          <p className="text-xs text-zinc-400 max-w-sm mb-6">
            Vincula tus cuentas de GitHub, AWS, Google o cualquier servicio compatible con TOTP para proteger tus accesos.
          </p>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xl shadow-violet-600/25 flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Vincular Primera Cuenta 2FA</span>
          </button>
        </div>
      )}

      {/* Empty State: Búsqueda sin Resultados */}
      {items.length > 0 && filteredItems.length === 0 && (
        <div className="py-16 flex flex-col items-center justify-center text-center p-6 border border-zinc-800/80 rounded-2xl bg-zinc-900/20">
          <ShieldOff className="w-10 h-10 text-zinc-500 mb-3" />
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
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Sección 1: Cuentas Fijadas (Pinned) */}
      {pinnedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-violet-400 uppercase tracking-wider px-1">
            <Pin className="w-3.5 h-3.5 rotate-45" />
            <span>Cuentas Prioritarias ({pinnedItems.length})</span>
          </div>
          <div
            ref={pinnedListRef}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {pinnedItems.map((item) => (
              <TotpCard
                key={item.id}
                item={item}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
                onToggleRecoveryCode={onToggleRecoveryCode}
                onEdit={onEditAccount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sección 2: Todas las Cuentas / Resto */}
      {regularItems.length > 0 && (
        <div>
          {pinnedItems.length > 0 && (
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">
              <span>Todas las Cuentas ({regularItems.length})</span>
            </div>
          )}
          <div
            ref={parentListRef}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {regularItems.map((item) => (
              <TotpCard
                key={item.id}
                item={item}
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
