"use client";

// 心声弹窗：点击聊天里 AI 头像（主气泡头像 / 顶栏对方头像）打开的那张卡。
// 卡片里只有用户自己的 HTML（清洗后渲染，或进阶模式进沙箱 iframe）；
// 上一条/下一条/收藏/删除/主题名/关闭全部放在卡片外面，让用户 HTML 独占一整张干净的卡。

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Star, Trash2, X } from "lucide-react";
import {
    MIND_LOG_MAX,
    deleteMindRecord,
    getMindSandbox,
    loadMindRecords,
    mindDateText,
    mindStampText,
    renderMindCard,
    renderMindCardRaw,
    sampleMindFields,
    seedMindTheme,
    setMindRecordFav,
    usableMindThemes,
    type MindRecord,
    type MindRenderCtx,
    type MindTheme,
} from "@/lib/inner-voice";

type InnerVoicePopupProps = {
    sessionId: string;
    charName: string;
    charAvatar: string;
    userName: string;
    userAvatar: string;
    onClose: () => void;
};

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

function clockText(ts: number): string {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InnerVoicePopup({ sessionId, charName, charAvatar, userName, userAvatar, onClose }: InnerVoicePopupProps) {
    const [mounted, setMounted] = useState(false);
    const initial = useMemo(() => loadMindRecords(sessionId), [sessionId]);
    const [records, setRecords] = useState<MindRecord[]>(initial);
    const [index, setIndex] = useState(Math.max(0, initial.length - 1));
    const sandbox = useMemo(() => getMindSandbox(), []);

    useEffect(() => setMounted(true), []);

    const current: MindRecord | null = index >= 0 && index < records.length ? records[index] : null;
    // 没有历史时用第一份可用主题（或内置）做一份占位预览
    const previewTheme: MindTheme | null = useMemo(
        () => (records.length ? null : (usableMindThemes(sessionId)[0] || seedMindTheme())),
        [records.length, sessionId],
    );
    const previewAt = useMemo(() => Date.now(), []);

    const ctx: MindRenderCtx = useMemo(() => {
        const at = current ? current.at : previewAt;
        return {
            char: charName,
            user: userName,
            time: current ? `${mindDateText(at)} ${clockText(at)}` : clockText(at),
            date: mindDateText(at),
            stamp: mindStampText(at),
            charAvatar,
            userAvatar,
        };
    }, [current, previewAt, charName, userName, charAvatar, userAvatar]);

    const rendered = useMemo(() => {
        if (current) {
            return sandbox
                ? renderMindCardRaw(current, ctx)
                : renderMindCard(current, ctx);
        }
        if (previewTheme) {
            const fields = sampleMindFields(previewTheme.fields);
            return sandbox
                ? renderMindCardRaw({ html: previewTheme.html, fields }, ctx)
                : renderMindCard({ html: previewTheme.html, fields }, ctx);
        }
        return "";
    }, [current, previewTheme, sandbox, ctx]);

    const themeLabel = current ? (current.tname || "心声") : (previewTheme ? `${previewTheme.name || "心声"} · 预览` : "心声");
    const isFav = current?.fav === true;
    const canPrev = index > 0;
    const canNext = index >= 0 && index < records.length - 1;

    const step = (d: number) => {
        const next = index + d;
        if (next < 0 || next >= records.length) return;
        setIndex(next);
    };

    const handleFav = () => {
        if (!current) return;
        const next = !isFav;
        setMindRecordFav(sessionId, current.id, next);
        setRecords(prev => prev.map(r => (r.id === current.id ? { ...r, fav: next || undefined } : r)));
    };

    const handleDelete = () => {
        if (!current) return;
        const at = index;
        const next = deleteMindRecord(sessionId, current.id);
        setRecords(next);
        if (!next.length) {
            onClose();
            return;
        }
        setIndex(at > 0 ? at - 1 : 0);
    };

    if (!mounted) return null;

    const iframeDoc = sandbox
        ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;}</style></head><body>${rendered}</body></html>`
        : "";

    return createPortal(
        <div className="ivp-overlay" style={{ zIndex: 70 }} onClick={onClose}>
            <style>{IVP_STYLES}</style>
            <div className="ivp-wrap" onClick={e => e.stopPropagation()}>
                <div className="ivp-tools">
                    <span className="ivp-theme">{themeLabel}</span>
                    <div className="ivp-tools-btns">
                        <button type="button" className={`ivp-round${isFav ? " is-on" : ""}`} onClick={handleFav} aria-label="收藏" title="收藏">
                            <Star size={17} {...(isFav ? { fill: "currentColor" } : {})} />
                        </button>
                        <button type="button" className="ivp-round" onClick={handleDelete} aria-label="删除" title="删除">
                            <Trash2 size={17} />
                        </button>
                        <button type="button" className="ivp-round" onClick={onClose} aria-label="关闭" title="关闭">
                            <X size={17} />
                        </button>
                    </div>
                </div>

                {sandbox ? (
                    <div className="ivp-card">
                        <iframe
                            className="ivp-frame"
                            title="心声卡片"
                            sandbox="allow-scripts"
                            srcDoc={iframeDoc}
                        />
                    </div>
                ) : (
                    <div className="ivp-card">
                        <div className="ivp-body mvx-scope" dangerouslySetInnerHTML={{ __html: rendered }} />
                    </div>
                )}

                <div className="ivp-tools ivp-page">
                    <button type="button" className="ivp-round" onClick={() => step(-1)} disabled={!canPrev} aria-label="上一条" title="上一条">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="ivp-count">
                        {records.length ? `${index + 1}/${Math.min(records.length, MIND_LOG_MAX)}` : "没有历史"}
                    </span>
                    <button type="button" className="ivp-round" onClick={() => step(1)} disabled={!canNext} aria-label="下一条" title="下一条">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

const IVP_STYLES = `
.ivp-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.42);
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  display: flex; align-items: center; justify-content: center;
  padding: max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom));
  animation: ivp-fade .22s ease both;
}
@keyframes ivp-fade { from { opacity: 0; } to { opacity: 1; } }
.ivp-wrap {
  display: flex; flex-direction: column; gap: 10px;
  width: min(92vw, 520px); max-height: 100%;
  animation: ivp-pop .26s cubic-bezier(.34,1.3,.5,1) both;
}
@keyframes ivp-pop { from { opacity: 0; transform: scale(.92) translateY(14px); } to { opacity: 1; transform: none; } }
.ivp-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ivp-theme {
  font-size: 12px; letter-spacing: .04em; color: rgba(255,255,255,.82);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  text-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.ivp-tools-btns { display: flex; gap: 8px; flex: none; }
.ivp-round {
  flex: none; width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: none; cursor: pointer; color: rgba(255,255,255,.92);
  background: rgba(255,255,255,.16);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  transition: transform .15s ease, background .15s ease, opacity .15s ease;
}
.ivp-round:hover { background: rgba(255,255,255,.26); }
.ivp-round:active { transform: scale(.9); }
.ivp-round:disabled { opacity: .32; cursor: default; transform: none; }
.ivp-round.is-on { color: #ffd76a; }
.ivp-card {
  min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  border-radius: 22px;
  scrollbar-width: none;
}
.ivp-card::-webkit-scrollbar { display: none; }
.ivp-frame {
  display: block; width: 100%; height: min(68vh, 560px);
  border: none; background: transparent; border-radius: 22px;
}
.mvx-scope { display: block; }
.ivp-page { justify-content: center; gap: 14px; }
.ivp-count {
  font-size: 12px; letter-spacing: .06em; color: rgba(255,255,255,.82);
  font-variant-numeric: tabular-nums; min-width: 52px; text-align: center;
  text-shadow: 0 1px 4px rgba(0,0,0,.35);
}
`;
