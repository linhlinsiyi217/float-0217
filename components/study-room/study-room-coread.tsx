"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, Send } from "lucide-react";

import { loadCharacters } from "@/lib/character-storage";
import {
  pushChatMessage,
  loadChatMessages,
  type ChatMessage,
  type ChatSession,
} from "@/lib/chat-storage";
import { generateReadingChat, parseReadingDiscussResponse } from "@/lib/reading-engine";
import { getCoreadSession, buildReadRange } from "@/lib/study-room-coread";
import type { Book, BookChapter } from "@/lib/reading-types";
import type { Character } from "@/lib/character-types";

type StudyRoomCoreadProps = {
  book: Book;
  chapter: BookChapter | null;
  chapterIndex: number;
  readParagraphIndex: number;
  selectedText?: string;
  onClose: () => void;
};

export function StudyRoomCoread({
  book,
  chapter,
  chapterIndex,
  readParagraphIndex,
  selectedText,
  onClose,
}: StudyRoomCoreadProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chars = loadCharacters();
    setCharacters(chars);
    setCharacterId((prev) => prev ?? chars[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!characterId) {
      setSession(null);
      setMessages([]);
      return;
    }
    const next = getCoreadSession(book.id, characterId);
    setSession(next);
    setMessages(loadChatMessages(next.id));
    setError(null);
  }, [book.id, characterId]);

  const scrollToEnd = useCallback(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, scrollToEnd]);

  const character = characters.find((c) => c.id === characterId) ?? null;
  const visibleMessages = messages.filter((m) => m.content && m.role !== "system");

  // 同一人连续消息按组处理：只有组末气泡显示尾巴
  const bubbleRows = useMemo(() => {
    return visibleMessages.map((msg, index) => {
      const prev = visibleMessages[index - 1];
      const next = visibleMessages[index + 1];
      return {
        msg,
        mine: msg.role === "user",
        groupStart: !prev || prev.role !== msg.role,
        groupEnd: !next || next.role !== msg.role,
      };
    });
  }, [visibleMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !session || !characterId || !chapter || sending) return;

    setInput("");
    setError(null);
    setSending(true);

    pushChatMessage({ sessionId: session.id, role: "user", content: text, origin: "reading_discuss" });
    setMessages(loadChatMessages(session.id));

    try {
      const raw = await generateReadingChat(
        session,
        book,
        {
          chapterTitle: chapter.title,
          chapterContent: buildReadRange(chapter.paragraphs, readParagraphIndex, selectedText),
          annotations: [],
        },
        characterId,
      );
      if (raw == null) throw new Error("no-response");
      const { reply } = parseReadingDiscussResponse(raw);
      if (reply) {
        pushChatMessage({ sessionId: session.id, role: "assistant", content: reply, origin: "reading_discuss" });
      }
      setMessages(loadChatMessages(session.id));
    } catch {
      setError("回复失败，请检查 API 配置后重试。");
    } finally {
      setSending(false);
    }
  };

  const readLabel = chapter
    ? `第 ${chapterIndex + 1} 章 · 已读至第 ${Math.min(readParagraphIndex + 1, chapter.paragraphs.length)} 段`
    : "尚未进入章节";

  return (
    <>
      <div className="sr-coread-mask" onClick={onClose} />
      <aside className="sr-coread" aria-label="AI 共读">
        <header className="sr-coread-head">
          <div className="sr-coread-head-row">
            <span
              className="sr-coread-avatar"
              style={
                character?.avatar
                  ? { backgroundImage: `url("${character.avatar}")`, backgroundSize: "cover", backgroundPosition: "center" }
                  : undefined
              }
            >
              {character?.avatar ? "" : (character?.name ?? "共").slice(0, 1)}
            </span>
            <div className="sr-coread-head-text">
              <div className="sr-coread-name">{character?.name ?? "选择一个角色"}</div>
              <div className="sr-coread-sub">{readLabel}</div>
            </div>
            <button type="button" className="sr-icon-btn" onClick={onClose} aria-label="收起共读">
              <ChevronRight size={22} strokeWidth={1.6} />
            </button>
          </div>

          {characters.length > 1 && (
            <div className="sr-coread-chars">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="sr-coread-char"
                  data-active={c.id === characterId ? "true" : undefined}
                  onClick={() => setCharacterId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </header>

        <div ref={bodyRef} className="sr-coread-body">
          {characters.length === 0 ? (
            <div className="sr-coread-empty">
              还没有角色。
              <br />
              先在小手机里创建角色，再回到书房共读。
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="sr-coread-empty">
              和「{character?.name}」一起读《{book.title}》。
              <br />
              共读只会看到你已经读到的部分，不会剧透后面的内容。
            </div>
          ) : (
            bubbleRows.map(({ msg, mine, groupStart, groupEnd }) => (
              <div
                key={msg.id}
                className="sr-coread-msg"
                data-role={msg.role}
                data-mine={mine ? "true" : "false"}
                data-group-start={groupStart ? "true" : undefined}
                data-group-end={groupEnd ? "true" : undefined}
              >
                {msg.content}
              </div>
            ))
          )}
          {sending && (
            <div className="sr-coread-msg" data-role="assistant" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Loader2 size={14} className="sr-spin" /> 正在思考…
            </div>
          )}
          {error && <div className="sr-coread-error">{error}</div>}
        </div>

        <footer className="sr-coread-foot">
          <textarea
            className="sr-coread-input"
            placeholder={chapter ? "问问这一段的看法…" : "进入章节后可共读"}
            value={input}
            rows={1}
            disabled={!chapter || sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            className="sr-coread-send"
            onClick={handleSend}
            disabled={!input.trim() || sending || !chapter}
            aria-label="发送"
          >
            <Send size={18} strokeWidth={1.8} />
          </button>
        </footer>
      </aside>
    </>
  );
}
