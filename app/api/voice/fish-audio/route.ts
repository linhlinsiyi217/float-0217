// Fish Audio TTS 中转：Fish 官方接口不允许浏览器跨域直连，这里只做转发。
// - API Key 由调用方（用户自己的语音设置）随请求带来，服务端不保存、不写日志。
// - 上游地址固定为官方接口，请求体按规范重建，调用方不能指定 URL 或附加头。
// - 只用请求里选定的模型，失败直接返回，不重试、不换模型。
// 与本项目其他 app/api/voice 路由一致不做登录校验（密钥属于调用者自己），
// 另加同源校验，避免被其他站点当成公共转发。
import { fishAudioSpeechRequest } from "@/lib/fish-audio-protocol";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function fail(error: string, status: number) {
    return Response.json({ error }, { status, headers: responseHeaders });
}

export async function POST(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin) {
        try {
            const source = new URL(origin);
            const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
            if (!["http:", "https:"].includes(source.protocol) || source.origin !== origin || source.host.toLowerCase() !== host.toLowerCase()) {
                return fail("invalid_origin", 403);
            }
        } catch {
            return fail("invalid_origin", 403);
        }
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 110_000);
    try {
        if (request.signal.aborted) return fail("fish_cancelled", 499);
        const raw = await request.text();
        if (raw.length > 256_000) return fail("request_too_large", 413);
        let data: { text?: unknown; reference_id?: unknown } | null;
        try { data = JSON.parse(raw); } catch { return fail("invalid_request", 400); }
        if (!data || typeof data.text !== "string" || !data.text.trim() || typeof data.reference_id !== "string") {
            return fail("invalid_request", 400);
        }
        const auth = request.headers.get("authorization") || "";
        if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return fail("missing_api_key", 400);

        let upstream: ReturnType<typeof fishAudioSpeechRequest>;
        try {
            upstream = fishAudioSpeechRequest(data.text, {
                id: "relay",
                provider: "FishAudio",
                model: request.headers.get("model") || "",
                apiKey: auth.slice(7),
                defaultVoice: data.reference_id,
                enableTTS: true,
                enableSTT: false,
            });
        } catch {
            return fail("invalid_model_or_voice", 400);
        }

        const response = await proxyFetch(upstream.url, {
            method: "POST",
            headers: upstream.headers,
            body: JSON.stringify(upstream.body),
            signal: controller.signal,
            redirect: "error",
            cache: "no-store",
        });
        if (!response.ok) {
            await response.body?.cancel();
            return fail("fish_upstream_error", response.status);
        }
        const type = (response.headers.get("content-type") || "").toLowerCase();
        if (!type.startsWith("audio/") && !type.startsWith("application/octet-stream")) {
            await response.body?.cancel();
            return fail("fish_invalid_audio", 502);
        }
        const audio = await response.arrayBuffer();
        if (!audio.byteLength) return fail("fish_empty_audio", 502);
        if (controller.signal.aborted) return fail("fish_cancelled", 499);
        return new Response(audio, { headers: { ...responseHeaders, "Content-Type": "audio/mpeg" } });
    } catch {
        return fail(controller.signal.aborted ? "fish_timeout" : "fish_network_error", controller.signal.aborted ? 504 : 502);
    } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", abort);
    }
}
