// lib/app-uninstall-data.ts — 每个内置应用「专属数据」的归属表（纯数据，便于审计）。
//
// 依据：lib/data-management/modules.ts（项目声明的数据归属契约）+ 全仓库键位盘点。
// 这里把它按「单个应用」重新切分，只登记该应用真正独占的数据。
//
// 铁律：
// - 共享数据一律不登记：角色卡、全局账号、API 配置/预设/世界书/正则、记忆、钱包、
//   桌面与主题、自定义 APP 注册表、媒体缓存、便签墙事件、角色世界、群聊存储。
// - 拿不准就不登记（宁可少删）。noOwnData=true 表示该应用本身没有独占数据。

export type AppDataSpec = {
  /** 完整 kv 键 */
  kvKeys?: string[];
  /** kv 键前缀（删除全部匹配键） */
  kvPrefixes?: string[];
  /** 需要整体删除的 IndexedDB 数据库 */
  databases?: string[];
  /** 删除数据库前需要断开的 Dexie 连接 */
  closers?: Array<"reading" | "checkphone" | "dwelling" | "map" | "story" | "vn" | "moments">;
  /** 卸载时需要停止的后台服务 */
  stopServices?: Array<"diary" | "moments">;
  /** 特殊清理 */
  special?: "chat-sessions-except-coread-and-group" | "coread-sessions";
  /** 面向用户：会删掉什么 */
  dataLabel: string;
  /** true = 该应用没有独占数据（数据是共享的），卸载只移除入口 */
  noOwnData?: boolean;
  /** 附加说明（共享内容、需要留意的风险等） */
  note?: string;
};

export const APP_DATA_SPEC: Record<string, AppDataSpec> = {
  chat: {
    // 聊天设置、待办定时、已移除联系人、状态地区、联系人、群聊会话都与「群聊」共用，
    // 属于共享数据，一律不删；这里只删私聊会话本身与聊天独占的插件/特效/离线数据。
    kvKeys: [
      "chat-screen-effect-rules",
      "chat-screen-effect-builtins",
      "chat_plugins_v3",
      "chat_plugin_vars_v2",
      "chat_plugin_fragments_v2",
      "chat_plugin_errors_v1",
    ],
    kvPrefixes: [
      "chat-generating:",
      "pending_reply_",
      "pending_friend_reply_",
      "ai_phone_chat_offline_turns:",
      "chat-offline-mode:",
      "chat-theater-mode:",
      "chat_plugin_data_v1:",
    ],
    special: "chat-sessions-except-coread-and-group",
    dataLabel: "私聊会话与消息、聊天插件、离线回复与聊天特效设置",
    note: "群聊、联系人、角色与发送设置为共享，保留；书房的共读会话也保留",
  },

  diary: {
    kvKeys: [
      "ai_phone_diary_entries_v1",
      "ai_phone_diary_entry_timer_settings_v1",
      "ai_phone_diary_entry_font_asset_v1",
      "ai_phone_diary_entry_font_scale_v1",
      "ai_phone_note_wall_local_user_v1",
      "ai_phone_note_wall_timer_settings_v1",
    ],
    stopServices: ["diary"],
    dataLabel: "日记条目、定时设置、字体素材与便签墙本地设置",
  },

  music: {
    kvKeys: [
      "ai_phone_music_api_v1",
      "ai_phone_netease_cookie_v1",
      "ai_phone_music_queue_v1",
      "ai_phone_track_playlist_map_v1",
      "music_api_config_v1",
      "netease_cookie_v1",
      "music_queue_v1",
      "music_track_playlist_map_v1",
      "music-playlists-cache",
      "music-recommend-daily",
      "music-recommend-fm",
      "music-recommend-playlists",
      "music-recommend-hot-search",
      "music-recommend-toplists",
      "music-user-recent",
      "music-custom-css",
      "music-custom-bg-v1",
    ],
    kvPrefixes: ["music-search-cache:", "music-playlist-tracks-", "music-playlist-detail-"],
    databases: ["ai_phone_music_db_v1"],
    dataLabel: "本地音乐、播放列表、网易云登录与推荐缓存",
    note: "音乐同步标记与聊天共用，保留",
  },

  studyroom: {
    kvKeys: [
      "ai_phone_reading_interaction_config_v1",
      "ai_phone_reading_appearance_v1",
      "ai_phone_studyroom_coread_sessions_v1",
      "reading-import-diagnostic-v1",
      "reading_import_diag_v1",
    ],
    databases: ["reading-db", "reading-raw-files", "reading-appearance-assets"],
    closers: ["reading"],
    special: "coread-sessions",
    dataLabel: "书籍、阅读进度、书签、书摘、批注、共读记录与阅读设置",
  },

  cocreate: {
    kvKeys: ["ai_phone_cocreate_session_v1", "ai_phone_cocreate_library_v1"],
    kvPrefixes: ["ai_phone_cocreate_events_"],
    dataLabel: "共创会话、作品库与共创记忆事件",
  },

  story: {
    databases: ["AiPhoneStoryDB"],
    closers: ["story"],
    dataLabel: "剧情故事数据",
  },

  game: {
    kvKeys: ["ai_phone_game_state_v1", "ai_phone_game_hall_drafts_v1"],
    dataLabel: "游戏进度与游戏大厅草稿",
  },

  xiaohongshu: {
    kvKeys: ["ai_phone_xiaohongshu_state_v1"],
    kvPrefixes: ["ai_phone_xiaohongshu_events_", "xiaohongshu_events_", "checkphone:xiaohongshu:readThreads"],
    dataLabel: "小红书状态与角色动态记忆",
  },

  dwelling: {
    databases: ["AiPhoneDwellingDB"],
    closers: ["dwelling"],
    dataLabel: "栖所（住宅）数据",
  },

  checkphone: {
    kvKeys: ["checkphone-settings"],
    kvPrefixes: ["ai_phone_checkphone_events_"],
    databases: ["AiPhoneCheckPhoneDB"],
    closers: ["checkphone"],
    dataLabel: "查手机快照、设置与记忆事件",
  },

  shopping: {
    kvKeys: [
      "ai_phone_shopping_state_v1",
      "ai_phone_black_market_state_v1",
      "ai_phone_black_market_scene_sessions_v1",
      "ai_phone_black_market_user_id_v1",
    ],
    kvPrefixes: ["ai_phone_black_market_theater_events_"],
    dataLabel: "购物记录、黑市状态与黑市剧场事件",
    note: "余额（钱包）为全局数据，保留；黑市创作草稿与工坊共用，保留",
  },

  calendar: {
    // 经期记录属独立的经期数据，不随日历卸载删除（见 SHARED_NEVER_DELETE 说明）
    kvKeys: [
      "ai_phone_calendar_plans_v1",
      "ai_phone_calendar_config_v1",
    ],
    dataLabel: "日程与日历设置",
    note: "经期记录为独立数据，保留",
  },

  interview_magazine: {
    kvKeys: [
      "ai_phone_interview_magazine_issues_v1",
      "ai_phone_interview_magazine_drafts_v1",
      "ai_phone_interview_magazine_host_prompt_v1",
      "ai_phone_interview_magazine_memory_prompt_v1",
    ],
    kvPrefixes: ["ai_phone_interview_magazine_events_"],
    dataLabel: "在场刊物、草稿、提示词与记忆事件",
  },

  vnmode: {
    kvKeys: ["ai_phone_vn_scenes_v1", "ai_phone_vn_sprites_v1"],
    databases: ["AiPhoneVnDB"],
    closers: ["vn"],
    dataLabel: "漫卷场景、立绘与剧本数据",
  },

  mapmode: {
    kvKeys: [
      "map_adventure_interaction_config_v1",
      "map_dm_prompts",
      "map_dm_token_config",
      "map_adventure_summary_config",
    ],
    kvPrefixes: ["map_world_theme_", "map_adventure_summary_"],
    databases: ["AiPhoneMapDB"],
    closers: ["map"],
    dataLabel: "冒险世界、存档、主题与摘要",
  },

  moments: {
    kvKeys: [
      "ai_phone_moments_ai_schedule_v1",
      "ai_phone_moments_pending_reactions_v1",
      "ai_phone_moments_config_v1",
      "ai_phone_moments_last_seen_v1",
      "moments_cover_asset_v1",
      "moments_cover_asset_id",
      "moments_signature",
    ],
    databases: ["AiPhoneMomentsDB"],
    closers: ["moments"],
    stopServices: ["moments"],
    dataLabel: "朋友圈动态、评论、封面与设置",
  },

  worldbuilder: {
    kvKeys: ["wb-settings", "wb-tripo-api-key"],
    databases: ["world-builder-scenes", "world-builder-models"],
    dataLabel: "3D 场景、模型与筑境设置（含 Tripo 密钥）",
  },

  realitybridge: {
    kvKeys: [
      "ai_phone_reality_bridge_rules_v1",
      "ai_phone_reality_bridge_feed_v1",
      "ai_phone_reality_bridge_settings_v1",
      "ai_phone_reality_bridge_data_items_v1",
      "ai_phone_reality_bridge_shortcut_actions_v1",
      "ai_phone_reality_bridge_rule_runs_v1",
      "ai_phone_reality_bridge_email_ready_v1",
      "ai_phone_reality_bridge_screen_chat_v1",
    ],
    dataLabel: "现实桥规则、数据项、快捷动作、屏幕速聊与运行记录",
  },

  qa: {
    kvKeys: [
      "ai_phone_qa_feedback_v1",
      "ai_phone_qa_github_v1",
      "ai_phone_qa_app_staging_v1",
      "ai_phone_qa_commit_staging_v1",
      "ai_phone_qa_context_budget_chars",
      "ai_phone_qa_max_output_tokens",
      "ai_phone_qa_max_rounds",
      "ai_phone_qa_page_chars",
      "ai_phone_qa_stream_idle_ms",
    ],
    databases: ["AiPhoneQaDB"],
    dataLabel: "工坊会话、暂存、偏好、反馈与 GitHub 配置",
  },

  mixology: {
    kvKeys: [
      "mixology_cabinet_v1",
      "mixology_recipes_v1",
      "mixology_sessions_v1",
      "mixology_builtin_version_v1",
      "mixology_profile_v1",
    ],
    dataLabel: "酒柜、配方、对局与个人资料",
  },

  resource_hub: {
    // 摊主身份钥匙（含备份）不随卸载删除：删了就无法再管理已发布的资源
    kvKeys: [
      "ai_phone_resource_hub_my_uploads_v1",
      "ai_phone_resource_hub_profile_v1",
      "ai_phone_resource_hub_upload_cfg_v1",
      "ai_phone_resource_hub_source_v1",
      "ai_phone_resource_hub_flowers_sent_v1",
      "ai_phone_resource_hub_flowers_seen_v1",
      "ai_phone_resource_hub_notice_v2",
    ],
    dataLabel: "我的发布、昵称头像与集市设置",
    note: "摊主身份钥匙保留，便于日后继续管理已发布的资源",
  },

  // ── 没有独占数据的应用：数据是共享的，卸载只移除入口 ──

  appmarket: { noOwnData: true, dataLabel: "", note: "已安装的自定义 APP 属于桌面级数据，不随应用市场一起删除" },
  settings: { noOwnData: true, dataLabel: "", note: "API、预设、世界书等全局配置需保留" },
  theme: { noOwnData: true, dataLabel: "", note: "主题与桌面外观为全局数据，需保留" },
  characters: { noOwnData: true, dataLabel: "", note: "角色卡为全局共享数据，需保留" },
  resources: { noOwnData: true, dataLabel: "", note: "资源库没有独占数据" },
  group_chat: { noOwnData: true, dataLabel: "", note: "群聊与私聊共用聊天存储，不能单独删除" },
  vnplay: { noOwnData: true, dataLabel: "", note: "漫卷的子入口，数据归「漫卷」" },
  vnchapters: { noOwnData: true, dataLabel: "", note: "漫卷的子入口，数据归「漫卷」" },
};

/**
 * 绝不能被单个应用卸载触碰的共享键 / 前缀 / 数据库。
 * 自动化审计会断言 APP_DATA_SPEC 里没有出现这里的任何一项。
 */
export const SHARED_NEVER_DELETE = {
  keys: [
    "ai_phone_characters_v1",
    "ai_phone_bg_items_v1",
    "ai_phone_character_versions_v1",
    "ai_phone_character_worlds_v1",
    "ai_phone_character_world_layout_v1",
    "ai_phone_api_configs_v1",
    "ai_phone_voice_configs_v1",
    "ai_phone_bindings_v1",
    "ai_phone_user_identities_v1",
    "ai_phone_char_settings_v1",
    "ai_phone_chat_send_config_v1",
    "ai_phone_memory_config_v1",
    "ai_phone_wallet_state_v1",
    "ai_phone_custom_apps_v1",
    "ai_phone_custom_app_icon_styles_v1",
    "ai_phone_chat_settings_v1",
    "ai_phone_chat_status_region_v1",
    "ai_phone_removed_contacts_v1",
    "ai_phone_followup_schedules_v1",
    "ai_phone_timed_wake_schedules_v1",
    "ai_phone_friend_requests_v1",
    "ai_phone_music_sync_v1",
    "ai_phone_black_market_studio_drafts_v1",
    "ai_phone_icon_layout_v2",
    "ai_phone_icon_layout_v1",
    "ai_phone_dock_layout_v1",
    "ai_phone_desktop_folders_v1",
    "ai_phone_widgets_v1",
    "ai_phone_diy_templates_v1",
    "ai_phone_theme_profile_v1",
    "ai_phone_canvas_pan_v2",
    "ai_phone_sticker_packs_v1",
    "ai_phone_sticker_assign_v1",
    "ai_phone_css_assets_v1",
    "ai_phone_mascot_settings_v1",
    "ai_phone_uninstalled_apps_v1",
    "ai_phone_settings_idb_migrated_v1",
    "ai_phone_idb_migrated_v1",
    // 用户明确要求保留：经期记录属独立数据；摊主身份钥匙删了就无法再管理已发布资源
    "ai_phone_menstrual_config_v1",
    "ai_phone_menstrual_records_v1",
    "ai_phone_menstrual_period_care_triggers_v1",
    "ai_phone_resource_hub_identity_v1",
    "ai_phone_resource_hub_key_backup_v1",
  ],
  prefixes: [
    "ai_phone_mem_evt_count_",
    "ai_phone_mem_last_sum_",
    "ai_phone_mem_core_count_",
    "ai_phone_mem_last_core_sum_",
    "ai_phone_notewall_events_",
    "note_wall_events_",
    "ai_phone_custom_app_data_v1:",
    "ai_phone_custom_app_timeline_v1:",
  ],
  databases: [
    "AiPhoneKvDB",
    "AiPhoneMediaCacheDB",
    "AiPhoneSettingsDB",
    "ai_phone_memory_db_v1",
    "ai_phone_theme_db_v1",
    "AiPhoneMascotDB",
    "AiPhoneChatDB", // 与书房共读会话、群聊共用
  ],
} as const;
