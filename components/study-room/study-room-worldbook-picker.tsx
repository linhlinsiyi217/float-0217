"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";

import { getCharacterWorldGroup } from "@/lib/character-world-storage";
import { loadBindingConfig, loadWorldBooks, resolveBinding } from "@/lib/settings-storage";

type WorldBookPickerProps = {
  characterId: string;
  /** undefined = 跟随角色在「共创」里的绑定 */
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
};

/**
 * 角色写作的设定来源：世界书（设定条目）与世界卷宗（角色所在世界与关系）分开显示。
 * 世界书默认跟随角色绑定，可以为这部作品单独勾选；世界卷宗只读，在「角色」App 里改。
 */
export function WorldBookPicker({ characterId, value, onChange }: WorldBookPickerProps) {
  const books = useMemo(() => loadWorldBooks(), []);
  const bound = useMemo(() => resolveBinding(loadBindingConfig(), characterId, "cocreate").worldBookIds ?? [], [characterId]);
  const worldGroup = useMemo(() => getCharacterWorldGroup(characterId), [characterId]);
  const following = value === undefined;
  const selected = following ? bound : value;

  const toggle = (id: string) => {
    const base = following ? bound : value;
    onChange(base.includes(id) ? base.filter((item) => item !== id) : [...base, id]);
  };

  return (
    <div className="sr-wb-picker">
      <div className="sr-wb-head">
        <span className="sr-filter-label">世界书</span>
        {following ? (
          <span className="sr-note-meta">{bound.length > 0 ? `跟随角色绑定（${bound.length} 本）` : "角色没有绑定世界书"}</span>
        ) : (
          <button type="button" className="sr-btn-text" onClick={() => onChange(undefined)}>
            改回跟随角色绑定
          </button>
        )}
      </div>
      {books.length === 0 ? (
        <p className="sr-note-meta">还没有世界书，可以在设置里导入。</p>
      ) : (
        <div className="sr-chip-row" role="group" aria-label="选择世界书">
          {books.map((book) => {
            const on = selected.includes(book.id);
            return (
              <button
                key={book.id}
                type="button"
                className="sr-chip"
                data-active={on ? "true" : undefined}
                aria-pressed={on}
                onClick={() => toggle(book.id)}
              >
                {on && <Check size={13} strokeWidth={2} />}
                {book.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="sr-wb-head">
        <span className="sr-filter-label">世界卷宗</span>
        <span className="sr-note-meta">
          {worldGroup ? `${worldGroup.name} · ${worldGroup.relations.length} 条角色关系` : "未归入卷宗"}
        </span>
      </div>
    </div>
  );
}
