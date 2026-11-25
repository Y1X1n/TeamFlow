'use client';

import Mention from '@tiptap/extension-mention';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Quote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { RichTextEditorProps } from './rich-text-editor';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

type MentionOption = {
  id: string;
  label: string;
};

interface MentionMenuState {
  items: MentionOption[];
  index: number;
  query: string;
  rect: { left: number; top: number; bottom: number } | null;
}

interface SuggestionPropsLike {
  query: string;
  items: unknown[];
  command: (option: MentionOption) => void;
  clientRect?: (() => DOMRect | null) | null;
}

function toMentionOptions(items: unknown[]): MentionOption[] {
  return items.filter((item): item is MentionOption => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as { id?: unknown; label?: unknown };
    return typeof record.id === 'string' && typeof record.label === 'string';
  });
}

const MENU_WIDTH = 232;
const MENU_MAX_HEIGHT = 240;
const MENU_MAX_ITEMS = 10;

export function RichTextEditorInner({
  value,
  onChange,
  members = [],
  disabled = false,
  minHeight = '120px',
}: RichTextEditorProps) {
  const [mentionMenu, setMentionMenu] = useState<MentionMenuState | null>(null);
  const menuRef = useRef<MentionMenuState | null>(null);
  const mentionCommandRef = useRef<((option: MentionOption) => void) | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuNodeRef = useRef<HTMLDivElement | null>(null);
  const membersRef = useRef(members);
  membersRef.current = members;

  const applyMenu = (next: MentionMenuState | null) => {
    menuRef.current = next;
    setMentionMenu(next);
  };

  const showMentionMenu = (props: SuggestionPropsLike) => {
    const options = toMentionOptions(props.items);
    const rect = typeof props.clientRect === 'function' ? props.clientRect() : null;
    const previous = menuRef.current;
    const index =
      previous && previous.query === props.query
        ? Math.min(previous.index, Math.max(options.length - 1, 0))
        : 0;
    mentionCommandRef.current = (option) => props.command(option);
    applyMenu({
      items: options,
      index,
      query: props.query,
      rect: rect ? { left: rect.left, top: rect.top, bottom: rect.bottom } : null,
    });
  };

  const selectMentionOption = (option: MentionOption) => {
    mentionCommandRef.current?.(option);
    mentionCommandRef.current = null;
    applyMenu(null);
  };

  useEffect(() => {
    if (!mentionMenu) return;
    const closeMenu = (event?: Event) => {
      if (event?.target instanceof Node && menuNodeRef.current?.contains(event.target)) return;
      mentionCommandRef.current = null;
      applyMenu(null);
    };
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [mentionMenu]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderText: ({ node }) => `@${String(node.attrs.label ?? '成员')}`,
        suggestion: {
          char: '@',
          allowedPrefixes: null,
          items: ({ query }) => {
            const keyword = query.trim().toLowerCase();
            return membersRef.current
              .filter((member) => member.name.toLowerCase().includes(keyword))
              .slice(0, MENU_MAX_ITEMS)
              .map((member) => ({ id: member.userId, label: member.name }));
          },
          render: () => ({
            onStart: (props) => showMentionMenu(props),
            onUpdate: (props) => showMentionMenu(props),
            onExit: () => {
              mentionCommandRef.current = null;
              applyMenu(null);
            },
            onKeyDown: ({ event }) => {
              const menu = menuRef.current;
              if (!menu) return false;
              if (event.key === 'Escape') {
                event.preventDefault();
                applyMenu(null);
                return true;
              }
              if (menu.items.length === 0) return false;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                const index = (menu.index + delta + menu.items.length) % menu.items.length;
                applyMenu({ ...menu, index });
                return true;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                const option = menu.items[Math.min(menu.index, menu.items.length - 1)];
                if (option) selectMentionOption(option);
                return true;
              }
              return false;
            },
          }),
        },
      }),
    ],
    content: value ?? undefined,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap prose-sm max-w-none rounded-b-md border border-t-0 border-input bg-background px-3 py-2 text-sm focus:outline-none',
          disabled && 'opacity-60',
        ),
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getJSON() as Record<string, unknown>, instance.getText());
    },
  });

  if (!editor) return null;

  const toolbar = [
    {
      icon: Bold,
      label: '加粗',
      active: editor.isActive('bold'),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      label: '斜体',
      active: editor.isActive('italic'),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: List,
      label: '无序列表',
      active: editor.isActive('bulletList'),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      label: '有序列表',
      active: editor.isActive('orderedList'),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: Quote,
      label: '引用',
      active: editor.isActive('blockquote'),
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];

  const computeMentionPosition = () => {
    const menu = mentionMenu;
    const wrapper = wrapperRef.current;
    if (!menu || !menu.rect || !wrapper || typeof window === 'undefined') return null;
    const wrapperRect = wrapper.getBoundingClientRect();
    const rect = menu.rect;
    const spaceBelow = window.innerHeight - rect.bottom;
    const offsetAbove = rect.top - wrapperRect.top;
    const openAbove = spaceBelow < MENU_MAX_HEIGHT + 8 && offsetAbove > MENU_MAX_HEIGHT;
    const left = Math.max(
      0,
      Math.min(rect.left - wrapperRect.left, Math.max(0, wrapperRect.width - MENU_WIDTH)),
    );
    const top = openAbove
      ? Math.max(0, offsetAbove - MENU_MAX_HEIGHT - 4)
      : Math.max(0, rect.bottom - wrapperRect.top + 4);
    return { left, top };
  };

  const mentionPosition = computeMentionPosition();
  const mentionDropdown =
    mentionMenu && mentionPosition && mentionMenu.items.length > 0 ? (
      <div
        ref={menuNodeRef}
        role="listbox"
        aria-label="提及成员"
        className="absolute z-[60] w-[232px] max-w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md scrollbar-thin"
        style={{
          left: mentionPosition.left,
          top: mentionPosition.top,
          maxHeight: MENU_MAX_HEIGHT,
        }}
      >
        {mentionMenu.items.map((option, optionIndex) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={optionIndex === mentionMenu.index}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => applyMenu({ ...mentionMenu, index: optionIndex })}
            onClick={() => selectMentionOption(option)}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none',
              optionIndex === mentionMenu.index
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/60',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-input bg-muted/40 px-1.5 py-1">
        {toolbar.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(item.active && 'bg-accent text-accent-foreground')}
            aria-label={item.label}
            disabled={disabled}
            onClick={item.action}
          >
            <item.icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        {members.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled}
              >
                @ 提及
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
              {members.map((member) => (
                <DropdownMenuItem
                  key={member.userId}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .insertContent([
                        { type: 'mention', attrs: { id: member.userId, label: member.name } },
                        { type: 'text', text: ' ' },
                      ])
                      .run();
                  }}
                >
                  {member.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <span className="ml-auto px-2 text-[11px] text-muted-foreground">支持 @ 成员</span>
      </div>
      <EditorContent editor={editor} />
      {mentionDropdown}
    </div>
  );
}
