// lib/qa-tool-docs.ts — 工坊工具教程的补充说明（第三轮任务 7）。
//
// 工具的「名字 + 一句话说明」真身在 lib/qa-agent-tools.ts 的 QA_TOOLS 定义里，
// 教程页运行时从 getQaTools() 读取生成——以后新增工具，教程卡片自动同步。
// 这里只补 QA_TOOLS 里没有的三样：什么时候用、一个具体例子、只读还是会改东西。

export type QaToolKind = "read" | "write-local" | "write-repo" | "write-workspace";

export const QA_TOOL_KIND_LABEL: Record<QaToolKind, string> = {
    read: "只读",
    "write-local": "会改本机内容",
    "write-repo": "会改 GitHub 仓库",
    "write-workspace": "会改工作机文件",
};

export type QaToolDoc = {
    /** 什么时候用（一句话） */
    use?: string;
    /** 具体例子：我输入什么，它会做什么 */
    example?: string;
    /** 只读还是会改东西 */
    kind?: QaToolKind;
};

export const QA_TOOL_DOCS: Record<string, QaToolDoc> = {
    清单: {
        use: "想看看现在装了哪些 APP、游戏、剧场，或者仓库里有哪些文件时。",
        example: "输入「帮我看看现在有什么本机应用」→ 克克列出你装过的 APP 名单和简介。",
        kind: "read",
    },
    读取: {
        use: "想看某个东西的具体内容：本机 APP/游戏/剧场的源码，或已连接仓库里的某个文件。",
        example: "输入「看看 XX 小游戏是怎么计分的」→ 克克读出对应源码并讲解。",
        kind: "read",
    },
    写入: {
        use: "让克克写新内容：新 APP/游戏的文件，或往仓库暂存区写文件。",
        example: "输入「做一个贪吃蛇小游戏」→ 克克先读创作指南，再把游戏文件写进暂存区。",
        kind: "write-local",
    },
    编辑: {
        use: "改已有内容时。只替换指定片段，不会整篇重写，改之前会先读原文核对。",
        example: "输入「把贪吃蛇的速度调慢一点」→ 克克找到计速的那几行，只改那几行。",
        kind: "write-local",
    },
    发布: {
        use: "写完/改完之后让它生效：本机内容「发布」后装进手机；仓库改动「发布」后生成提交提案。",
        example: "输入「装上吧」→ 克克把暂存的游戏发布安装，你回桌面就能看到新图标。",
        kind: "write-local",
    },
    创作指南: {
        use: "做新东西之前克克会自己先读，你不用主动喊它；这是它写 APP/游戏/剧场时的说明书。",
        example: "做游戏时克克自动分页读指南，按规范生成文件，你只需要描述想要什么。",
        kind: "read",
    },
    答疑文档: {
        use: "问「这个功能怎么用」「设置在哪」这类产品问题时，克克先查文档再回答。",
        example: "输入「横幅提示音在哪里设置」→ 克克查文档后告诉你具体路径。",
        kind: "read",
    },
    读取本机内容: {
        use: "导出某个已装内容的完整源码，用于备份、检查或搬走。",
        example: "输入「把 XX 剧场的档案导出来看看」→ 克克给出完整内容（长内容会分页）。",
        kind: "read",
    },
    对比官方版本: {
        use: "想看看你的改动和官方最新版差在哪，或者准备给官方提贡献时。",
        example: "输入「我改的和官方差多少」→ 克克列出白名单内有差异的文件清单。",
        kind: "read",
    },
    读取贡献差异: {
        use: "配合「对比官方版本」用：确认某个文件具体改了哪几行。",
        example: "输入「看看 lib/xxx.ts 的差异」→ 克克给出逐行对比。",
        kind: "read",
    },
    提交共同建设贡献: {
        use: "想把自己的改动分享给官方仓库时。第一次调用只出预览，你明确同意后才真正提交。",
        example: "输入「把这个修复贡献给官方」→ 克克先展示提交预览，你同意后它才提交（管理员审核后合并）。",
        kind: "write-repo",
    },
    环境体检: {
        use: "整个页面连不上、报错、存储满、想知道设备环境时。分四项：api / storage / errors / device。",
        example: "输入「API 是不是挂了」→ 克克逐个真实测试你配置的接口并报告耗时和错误。",
        kind: "read",
    },
    记录反馈: {
        use: "让克克把你的意见或遇到的问题记下来，方便之后回顾或提交。",
        example: "输入「记一下：这里按钮太小」→ 克克记录一条反馈。",
        kind: "read",
    },
    仓库查询: {
        use: "已连接仓库后，看提交历史、分支、PR、Issue 的状态。",
        example: "输入「看看仓库最近提交了什么」→ 克克列出最近提交（可看某次提交的改动详情）。",
        kind: "read",
    },
    搜索仓库代码: {
        use: "想在仓库里找某段代码或某个文件时。",
        example: "输入「仓库里哪里处理了锁屏」→ 克克搜出相关文件和位置。",
        kind: "read",
    },
    分支管理: {
        use: "改仓库前先开一条新分支（推荐），或删掉不要的分支。默认分支受保护删不掉。",
        example: "输入「开个 feature/dark-mode 分支」→ 克克新建分支，之后的提交都走这条分支。",
        kind: "write-repo",
    },
    创建PR: {
        use: "把分支上的改动整理成一个 Pull Request，方便在 GitHub 上审阅合并。",
        example: "输入「把这些改动提个 PR」→ 克克创建 PR 并给你链接。",
        kind: "write-repo",
    },
    合并PR: {
        use: "确认 PR 没问题后合并进主分支。克克合并前会建议你先用「仓库查询」看一眼。",
        example: "输入「把 #12 合了」→ 克克先核对无冲突，再执行合并。",
        kind: "write-repo",
    },
    更新Issue: {
        use: "给 Issue 补充说明、关闭或重新打开。",
        example: "输入「在 #8 里说一声已修复，然后关掉」→ 克克评论并关闭该 Issue。",
        kind: "write-repo",
    },
    同步官方更新: {
        use: "你的仓库是从官方 fork 来的，官方更新后用它把最新改动拉过来。",
        example: "输入「同步一下官方的最新更新」→ 克克把上游新提交合进你的仓库。",
        kind: "write-repo",
    },
    电脑文件: {
        use: "连接了角色电脑后，在它的工作区里列目录、读写文件、传消息。",
        example: "输入「在我的电脑上建个 notes.md」→ 克克写文件并回给你路径。",
        kind: "write-workspace",
    },
    电脑执行命令: {
        use: "在工作机上跑 shell 命令：跑脚本、装工具、批量处理文件（能力取决于电脑模式）。",
        example: "输入「帮我在电脑上看看 python 版本」→ 克克执行命令并回显输出。",
        kind: "write-workspace",
    },
};

/** 兜底分类：说明里带明显写动作关键词的按「会改」处理，其余当只读。 */
export function inferQaToolKind(name: string, description: string): QaToolKind {
    const doc = QA_TOOL_DOCS[name];
    if (doc?.kind) return doc.kind;
    const text = `${name}\n${description}`;
    if (/(提交|推送|创建|新建|删除|合并|安装|上架|写回|写入|覆盖)/.test(text)) {
        return /(仓库|PR|Issue|官方)/.test(text) ? "write-repo" : "write-local";
    }
    return "read";
}

export type QaToolGroupDef = {
    id: string;
    title: string;
    subtitle: string;
    /** 成员工具中文名；没匹配上的工具自动落进「其他工具」组 */
    members: string[];
};

export const QA_TOOL_GROUP_DEFS: QaToolGroupDef[] = [
    {
        id: "creative",
        title: "本机内容创作",
        subtitle: "做 APP、小游戏、剧场，装到手机上",
        members: ["清单", "读取", "写入", "编辑", "发布", "创作指南", "读取本机内容"],
    },
    {
        id: "diagnose",
        title: "问答与体检",
        subtitle: "答疑、查环境、记反馈",
        members: ["答疑文档", "环境体检", "记录反馈"],
    },
    {
        id: "repo-read",
        title: "仓库查阅",
        subtitle: "需要先在工坊里连接 GitHub 仓库",
        members: ["仓库查询", "搜索仓库代码"],
    },
    {
        id: "repo-write",
        title: "仓库修改",
        subtitle: "需要填写有写权限的 PAT；确认模式下每次提交前都会先给你看改动",
        members: ["分支管理", "创建PR", "合并PR", "更新Issue", "同步官方更新", "提交共同建设贡献"],
    },
    {
        id: "co-build",
        title: "共同建设",
        subtitle: "把自己的改动分享给官方仓库",
        members: ["对比官方版本", "读取贡献差异"],
    },
    {
        id: "computer",
        title: "角色电脑",
        subtitle: "需要先在设置里连接角色电脑",
        members: ["电脑文件", "电脑执行命令"],
    },
];

export type QaToolGroup = QaToolGroupDef & { tools: Array<{ name: string; description: string }> };

/** 按组整理当前可用工具；没匹配上任何组的落进「其他工具」。 */
export function groupQaTools(tools: Array<{ name: string; description: string }>): QaToolGroup[] {
    const placed = new Set<string>();
    const groups: QaToolGroup[] = QA_TOOL_GROUP_DEFS.map(def => ({
        ...def,
        tools: def.members
            .filter(name => tools.some(tool => tool.name === name))
            .map(name => {
                placed.add(name);
                const tool = tools.find(item => item.name === name);
                return { name, description: tool?.description ?? "" };
            }),
    })).filter(group => group.tools.length > 0);

    const rest = tools.filter(tool => !placed.has(tool.name));
    if (rest.length > 0) {
        groups.push({
            id: "others",
            title: "其他工具",
            subtitle: "自动收录的新工具，说明以定义为准",
            members: [],
            tools: rest.map(tool => ({ name: tool.name, description: tool.description })),
        });
    }
    return groups;
}
