#!/usr/bin/env python3
"""把项目里的知识导图同步到网站（公开版）。

用法：
    python3 tools/sync-maps.py --src <放原始导图的文件夹>          # 生成并写入四个 knowledge-map.html
    python3 tools/sync-maps.py --src <文件夹> --only math            # 只同步一科
    python3 tools/sync-maps.py --src <文件夹> --dry-run              # 只检查，不写文件

原始导图（项目文档）的文件名：
    初中物理知识体系_第十七章样板.html
    初中化学知识体系_全书知识点清单.html
    初中数学知识导图.html
    初中生物知识导图.html

做三件事：
1. 公开版处理：去掉个人考试信息（阶段考试的日期、题号、分数、薄弱标记）和课堂进度。
   个人的错题改由登录后的「错题本」记录（shared/mistakes.js，仅本人可见）。
   每条替换都写明应该命中几次；导图改版后对不上，脚本会停下来报错，不会悄悄漏掉。
2. 接入网站：加站点顶栏、登录与进度同步、错题本，三处各插一行，导图正文不改。
3. 检查：输出里不能再有个人考试信息的字样。

注意：仓库是公开的，原始导图（含个人信息）不要放进仓库。
"""
import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 只要命中这些就说明还有个人考试信息，拒绝写入
FORBIDDEN = [
    (r"阶段考试", "阶段考试"),
    (r"错题分析", "错题分析文档"),
    (r"她的", "第三人称指代学生"),
    (r"\d{2,3}\s*/\s*120\b", "试卷分数"),
    (r"课堂进度", "课堂进度"),
    (r"接下来学", "课堂进度"),
]


def rx(pattern, repl, count, flags=0, note=""):
    """count: 精确次数（int）或至少次数（'>=n'）"""
    return (re.compile(pattern, flags), repl, count, note)


M = re.MULTILINE
S = re.DOTALL

MISTAKE_HELP = "登录后，每个知识点旁有「＋错题」，可以把自己做错的题记在这个知识点下，只有自己能看到；左下角「我的错题」查看全部"

SUBJECTS = {
    "physics": {
        "src": "初中物理知识体系_第十七章样板.html",
        "out": "physics/knowledge-map.html",
        "page": "knowledge-map",
        "rules": [
            rx(r"^[ \t]*weak:'[^'\n]*',?[ \t]*\n", "", ">=1", M, "知识点上的薄弱标记"),
            rx(r"^[ \t]*'[^'\n]*薄弱点[^'\n]*',?[ \t]*\n", "", 1, M, "依据列表里的薄弱点来源"),
            rx(r",\s*\[LG\.weak\(\),LG\.txt\('[^'\n]*'\)\]", "", ">=1", 0, "导图图例：薄弱"),
            rx(r"<span><span class=\"vm-weak\">薄弱</span>[^<]*</span>", "", 1, 0, "竖版图例：薄弱"),
            rx(r"<label><input type=\"checkbox\" id=\"fWeak\"> 只看薄弱</label>",
               "<label data-mk-filter hidden><input type=\"checkbox\" id=\"fWeak\"> 只看有错题的</label>", 1, 0, "筛选：只看薄弱"),
            rx(r"<li>红字「<span class=\"weak\">薄弱</span>」：[^<]*</li>", "<li>" + MISTAKE_HELP + "。</li>", 1, 0, "指南：薄弱"),
            rx(r"，勾「只看薄弱」，", "，登录后可勾「只看有错题的」，", 1, 0, "指南：筛选"),
            rx(r"，带「<span class=\"weak\">薄弱</span>」的优先", "，自己记过错题的优先", 1, 0, "指南：读法"),
            rx(r"；勾「只看薄弱」专门补弱项", "；登录后勾「只看有错题的」专门补弱项", 1, 0, "指南：复习"),
        ],
    },
    "chemistry": {
        "src": "初中化学知识体系_全书知识点清单.html",
        "out": "chemistry/knowledge-map.html",
        "page": "chem-map",
        "rules": [],
    },
    "math": {
        "src": "初中数学知识导图.html",
        "out": "math/knowledge-map.html",
        "page": "math-map",
        "rules": [
            # 知识点数组 [名称, 内容, 题号] 的第三项是阶段考试题号；前一个字符必须是中文（不碰 hard:['10','15',...] 这类数组）
            rx(r"(?<=[^\x00-\x7f])','[0-9][0-9、()（）]*'\]", "']", ">=10", 0, "知识点上的阶段考试题号"),
            rx(r"<a href=\"#weak\">[^<]*</a>", "<a href=\"#weak\">我的错题</a>", 1, 0, "顶栏导航"),
            rx(r"(<button class=\"btn weakbtn\" id=\"weakBtn\" type=\"button\" aria-pressed=\"false\") title=\"[^\"]*\">[^<]*</button>",
               r"\1 title=\"文字版里只显示自己记过错题的知识点\" data-mk-filter hidden>只看有错题的</button>", 1, 0, "按钮：只看薄弱"),
            rx(r"<li>章名后的“七上……九下”是所在册；[^<]*?带 <span class=\"i\">ⓘ</span>",
               "<li>章名后的“七上……九下”是所在册。带 <span class=\"i\">ⓘ</span>", 1, 0, "说明：课堂进度"),
            rx(r"<li><b>薄弱</b>：[^\n]*?</li>", "<li><b>我的错题</b>：" + MISTAKE_HELP + "。登录后，“只看有错题的”可以只留下这些知识点。</li>", 1, 0, "说明：薄弱"),
            rx(r"^/\* 课堂进度[^\n]*\*/\n", "", 2, M, "注释：课堂进度（样式和数据各一处）"),
            rx(r"(/\* 小标记（SVG）：[^*\n]*?)、课堂进度、薄弱", r"\1", 1, 0, "注释：小标记"),
            rx(r"\(n\.wk\?`｜阶段考试[^`]*`:''\)", "('')", 1, 0, "章节点提示：薄弱"),
            rx(r"\(kp\[2\]\?`（阶段考试[^`]*`:''\)", "('')", 1, 0, "知识点提示：薄弱"),
            rx(r"const PROG=\{[^}]*\};", "const PROG={'七上':0,'七下':0,'八上':0,'八下':0,'九上':0,'九下':0};", 1, 0, "课堂进度数据"),
            rx(r"const PROG_NAME=\[[^\]]*\];", "const PROG_NAME=['','',''];", 1, 0, "课堂进度名称"),
            rx(r"'（'\+c\.book\+'，课堂进度：'\+PROG_NAME\[p\]\+'）'", "'（'+c.book+'）'", 1, 0, "章节点提示"),
            rx(r"esc\(c\.book\+'　课堂进度：'\+PROG_NAME\[p\]\)", "esc(c.book)", 1, 0, "本章导图中心"),
            rx(r"\$\{c\.book\}　课堂进度：\$\{PROG_NAME\[p\]\}", "${c.book}", 1, 0, "竖版本章导图"),
            rx(r"\[LG\.txt\('课堂进度：'[^\n]*?LG\.txt\('[^'\n]*',13\.5,INK2\)\],", "", 1, 0, "导图图例：课堂进度"),
            rx(r"\[LG\.weak\(\),LG\.txt\('[^'\n]*'\)\],", "", 2, 0, "导图图例：薄弱"),
            rx(r"<span><span class=\"prog\" data-p=\"1\">[^<]*</span> [^<]*</span>", "", 1, 0, "竖版图例：课堂进度"),
            rx(r"<span><span class=\"vm-wk\">薄弱</span> [^<]*</span>", "", 1, 0, "竖版图例：薄弱"),
            rx(r"const weakTag=w=>`[^`]*`;", "const weakTag=w=>'';", 1, 0, "薄弱标签"),
            rx(r"，其中 \$\{nWeak\} 个带“薄弱”标记", "", 1, 0, "文字版说明"),
            rx(r"function renderWeak\(\)\{.*?\n\}\n(?=function renderAbout)",
               "function renderWeak(){\n  return `<h2 id=\"weakTitle\">我的错题</h2><p class=\"note\">" + MISTAKE_HELP +
               "。错题保存在自己的账号里，换电脑、手机登录同一个账号也能看到。</p><p><button class=\"btn primary\" type=\"button\" data-open-mistakes>打开我的错题本</button></p>`;\n}\n",
               1, S, "薄弱点一节改为错题本入口"),
            rx(r"<li>薄弱标记：[^<]*</li>", "<li>我的错题：登录后自己记录，只保存在自己的账号里，别人看不到。</li>", 1, 0, "依据：薄弱"),
            rx(r"；本项目《[^》]*错题分析》", "", 1, 0, "目录来源"),
            rx(r"\n<li>薄弱点：[^<]*</li>", "", 1, 0, "资料来源：薄弱"),
            rx(r"；课堂进度改为中性标记（[^）]*）", "", 1, 0, "修改记录：课堂进度"),
            rx(r"、阶段考试薄弱标记 \$\{nWeak\} 处", "", 1, 0, "修改记录：薄弱"),
            rx(r"（默认第二十一章 四边形：[^）]*）", "（默认第二十一章 四边形）", 1, 0, "注释：默认章"),
        ],
    },
    "biology": {
        "src": "初中生物知识导图.html",
        "out": "biology/knowledge-map.html",
        "page": "bio-map",
        "rules": [],
    },
}

BANNER = "<!-- 网站公开版：由 tools/sync-maps.py 从项目里的导图生成（已去掉个人考试信息）。要改内容请改原始导图后重新同步，不要直接改这个文件。 -->\n"


def apply_rules(name, html, rules):
    for pat, repl, count, note in rules:
        new, n = pat.subn(repl, html)
        ok = n >= int(count[2:]) if isinstance(count, str) else n == count
        if not ok:
            raise SystemExit(f"[{name}] 替换「{note}」应命中 {count} 次，实际 {n} 次。导图可能改版了，请更新 tools/sync-maps.py 里的规则。")
        print(f"  [{name}] {note}：{n} 处")
        html = new
    return html


def integrate(name, html, page):
    def once(pattern, repl, what):
        nonlocal html
        new, n = re.subn(pattern, repl, html, count=1)
        if n != 1:
            raise SystemExit(f"[{name}] 找不到 {what}，无法接入网站。")
        html = new

    if "shared/topbar.js" in html or "shared/mistakes.js" in html:
        raise SystemExit(f"[{name}] 原始导图里已经有网站接入代码，请用项目里的原文件。")
    once(r"(<!DOCTYPE html>\n?)", r"\1" + BANNER.replace("\\", "\\\\"), "<!DOCTYPE html>")
    once(r"</head>", '<script src="../shared/auth.js"></script>\n</head>', "</head>")
    once(r"<body>\n?", '<body>\n<script src="../shared/topbar.js" data-root=".." data-page="%s" data-mode="compact"></script>\n' % page, "<body>")
    # </body> 只换最后一个
    idx = html.rfind("</body>")
    if idx < 0:
        raise SystemExit(f"[{name}] 找不到 </body>")
    html = html[:idx] + '<script src="../shared/mistakes.js" data-subject="%s"></script>\n' % name + html[idx:]
    return html


def check(name, html):
    bad = []
    for pat, what in FORBIDDEN:
        for m in re.finditer(pat, html):
            line = html.count("\n", 0, m.start()) + 1
            bad.append(f"第 {line} 行：{what}")
    if bad:
        raise SystemExit(f"[{name}] 还有个人信息，没有写入：\n  " + "\n  ".join(bad[:20]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="放原始导图的文件夹")
    ap.add_argument("--only", choices=sorted(SUBJECTS), action="append", help="只同步某一科，可写多次")
    ap.add_argument("--dry-run", action="store_true", help="只检查，不写文件")
    args = ap.parse_args()
    src = pathlib.Path(args.src)
    todo = args.only or list(SUBJECTS)
    for name in todo:
        cfg = SUBJECTS[name]
        path = src / cfg["src"]
        if not path.exists():
            print(f"[{name}] 跳过：没有找到 {path}")
            continue
        html = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        print(f"[{name}] {path.name}（{len(html.encode())} 字节）")
        html = apply_rules(name, html, cfg["rules"])
        html = integrate(name, html, cfg["page"])
        check(name, html)
        out = ROOT / cfg["out"]
        if args.dry_run:
            print(f"  → 检查通过（未写入 {cfg['out']}）")
        else:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(html, encoding="utf-8")
            print(f"  → 写入 {cfg['out']}（{len(html.encode())} 字节）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
