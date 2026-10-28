// 「一起听」内置能力的动作名、参数结构与用法说明（无依赖，供能力注册与执行共用）。
export const LISTENING_RANK_TOOL = "查看一起听排名";
export const LISTENING_PLAYLIST_TOOL = "管理一起听歌单";
export const LISTENING_TOOL_NAMES = new Set([LISTENING_RANK_TOOL, LISTENING_PLAYLIST_TOOL]);

export const LISTENING_RANK_SCHEMA = JSON.stringify({ type: "object", properties: {}, additionalProperties: false });

export const LISTENING_PLAYLIST_SCHEMA = JSON.stringify({
    type: "object",
    properties: {
        action: { type: "string", enum: ["list", "create", "rename", "add_song", "add_current", "remove"], description: "list查看歌单；create新建；rename改名；add_song搜索指定歌曲入单；add_current收藏当前播放；remove移除" },
        playlistId: { type: "string", description: "list或create返回的真实歌单ID；rename/add_song/add_current/remove必填" },
        name: { type: "string", description: "create/rename时填写歌单名称" },
        title: { type: "string", description: "add_song必填，准确歌名，保留版本信息" },
        artist: { type: "string", description: "add_song必填，实际歌手" },
        songId: { type: "string", description: "remove必填，从list指定playlistId返回的歌曲中取得" },
    },
    required: ["action"],
    additionalProperties: false,
});

export const LISTENING_USAGE_GUIDE = [
    "一起听是可选的互动方式，按人设与意愿决定，不必每轮使用。",
    "发起一起听不用动作：本轮独立一行输出[一起听邀请:准确歌名|歌手]（或[一起听邀请]），由用户决定是否接受。",
    `「${LISTENING_RANK_TOOL}」只看你自己与用户累计一起听的有效时长和名次，不返回其他角色；是否提起由你决定。`,
    `「${LISTENING_PLAYLIST_TOOL}」实际管理当前聊天的共同歌单（共享歌单 / 一起听歌单）；音乐分享卡不会入单，也不改网易云账号歌单。`,
    "先 action=list 取得真实歌单ID；没有歌单可 create，目标有歧义先问。",
    "add_song：playlistId、准确 title、实际 artist 必填，系统真实搜索匹配后入单，无需先播放；add_current 仅收藏一起听正在播放的歌；remove 需要 list 返回的 songId。",
    "多首歌逐首调用，以工具结果为准报告成功或失败，不虚构已添加的歌曲。",
    `示例：[执行动作:${LISTENING_PLAYLIST_TOOL}({"action":"list"})]`,
    `示例：[执行动作:${LISTENING_PLAYLIST_TOOL}({"action":"add_song","playlistId":"list返回的ID","title":"准确歌名","artist":"实际歌手"})]`,
].join("\n");

export const LISTENING_SUBTOOLS = [
    {
        name: LISTENING_RANK_TOOL,
        description: "仅查看你自己与当前用户的累计一起听有效时长与排名；不返回其他角色信息。",
        parameterSchema: LISTENING_RANK_SCHEMA,
    },
    {
        name: LISTENING_PLAYLIST_TOOL,
        description: "管理当前聊天的共同歌单：新建、重命名、按歌名找歌入单、收藏当前歌曲或移除。",
        parameterSchema: LISTENING_PLAYLIST_SCHEMA,
    },
];
