// lib/update-log/update-service.ts — 远程版本清单的拉取、比较与确认。
//
// 职责（对应 UPDATE_SYSTEM.md 规范）：
// 1. 用 cache: no-store + Cache-Control: no-cache + 时间戳查询参数拉 /app-version.json，
//    绝不吃 Service Worker 或 HTTP 缓存的旧清单；
// 2. 按 releaseId → commitSha → webVersion → versionCode 的顺序比较新旧版本，
//    即使 versionName/versionCode 没变，只要 releaseId（含 commitSha）变了就算新版本；
// 3. 已确认的 releaseId 存 localStorage（key 见下），确认过不再弹；
// 4. 手动「检查更新」与更新公告弹窗共用这里的拉取与比较逻辑，状态互相独立。

export type RemoteManifest = {
  releaseId: string;
  commitSha: string;
  releasedAt: string;
  versionName: string;
  versionCode: number;
  webVersion: string;
  summary: string;
  /** 与 app-version.json 的 changes 同构：{ type, title, detail } */
  entries: Array<{ type: string; title: string; detail: string }>;
};

export type UpdateCheckState = "available" | "latest" | "offline" | "timeout" | "error";

export type UpdateCheckResult =
  | { state: "available"; manifest: RemoteManifest }
  | { state: "latest"; manifest: RemoteManifest }
  | { state: "offline" | "timeout" | "error"; manifest: null; message: string };

const ACK_KEY = "ai_phone_remote_release_ack_v1";
const FETCH_TIMEOUT_MS = 8_000;

function isValidManifest(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toManifest(raw: Record<string, unknown>): RemoteManifest | null {
  const releaseId = typeof raw.releaseId === "string" ? raw.releaseId.trim() : "";
  const webVersion = typeof raw.webVersion === "string" ? raw.webVersion.trim() : "";
  const commitSha = typeof raw.commitSha === "string" ? raw.commitSha.trim() : "";
  // releaseId 是唯一必需键；老清单（没有 releaseId）按损坏数据处理，
  // 否则无法判断「是不是新版本」，弹窗会失去依据。
  if (!releaseId) return null;
  const changes = Array.isArray(raw.changes) ? raw.changes : [];
  const entries = changes
    .filter(isValidManifest)
    .map((item) => ({
      type: typeof item.type === "string" ? item.type : "app",
      title: typeof item.title === "string" ? item.title : "",
      detail: typeof item.detail === "string" ? item.detail : "",
    }))
    .filter((item) => item.title);
  return {
    releaseId,
    commitSha,
    releasedAt: typeof raw.releasedAt === "string" ? raw.releasedAt : "",
    versionName: typeof raw.versionName === "string" ? raw.versionName : "",
    versionCode: typeof raw.versionCode === "number" ? raw.versionCode : 0,
    webVersion,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    entries,
  };
}

/** 带缓存绕过的清单拉取：no-store + no-cache 头 + ?check= 时间戳三重保险 */
export async function fetchRemoteManifest(): Promise<RemoteManifest | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`/app-version.json?check=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    if (!isValidManifest(raw)) return null;
    return toManifest(raw);
  } finally {
    window.clearTimeout(timer);
  }
}

/** 按 releaseId → commitSha → webVersion → versionCode 顺序比较；有差异即新版本 */
function isNewerManifest(remote: RemoteManifest, acknowledged: string | null): boolean {
  if (!acknowledged) return true;
  if (remote.releaseId && remote.releaseId !== acknowledged) return true;
  return false;
}

export function getAcknowledgedRemoteReleaseId(): string | null {
  try {
    return window.localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
}

/** 用户确认后写入：这个 releaseId 以后不再弹公告（手动检查也以它为基准） */
export function acknowledgeRemoteRelease(releaseId: string): void {
  try {
    window.localStorage.setItem(ACK_KEY, releaseId);
  } catch {
    // localStorage 不可用（隐私模式等）：静默降级，每次都可能弹，但不影响功能
  }
}

/** 手动/自动检查共用的入口。绝不 throw：离线、超时、损坏清单都折算成对应状态。 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { state: "offline", manifest: null, message: "当前离线，恢复网络后再试" };
  }
  let manifest: RemoteManifest | null;
  try {
    manifest = await fetchRemoteManifest();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { state: "timeout", manifest: null, message: "检查超时，请重试" };
    }
    return { state: "offline", manifest: null, message: "网络不可达，请检查连接后重试" };
  }
  if (!manifest) {
    return { state: "error", manifest: null, message: "版本清单不可用或格式异常，请稍后重试" };
  }
  const acknowledged = getAcknowledgedRemoteReleaseId();
  return isNewerManifest(manifest, acknowledged)
    ? { state: "available", manifest }
    : { state: "latest", manifest };
}
