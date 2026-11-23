#!/usr/bin/env python3
"""生成全站搜索用的知识点索引 shared/search-index.json 和关联表用到的知识点名称
shared/link-names.json，并检查关联表 shared/links.json。

用法（在仓库根目录）：
    python3 tools/build-index.py            # 生成索引 + 检查关联表
    python3 tools/build-index.py --check    # 只检查，不写文件

需要 Playwright（pip install playwright && playwright install chromium）。
四张导图的知识点是页面脚本渲染出来的，所以用无头浏览器打开页面再读取：
  物理、化学  article.kp[id]、各节 li[id^=toc-ch]（物理）、必做实验 .exp[id]、高中衔接 .b-item[id]
  数学        li.ok[data-key]
  生物        li.ok[data-kid]
索引里每条：s 学科、k 知识点键（与学习状态、错题本用的键相同）、a 页面锚点 id、
n 名称、c 所在章、x 摘要、t 类型（kp 知识点 / sec 节 / exp 必做实验 / hs 高中衔接）。

检查关联表：每条关联指向的知识点必须在索引里，指向的实验模块或任务必须在实验页里存在；
有问题时列出来并以非 0 退出，避免导图改版后链接悄悄失效。
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAPS = {
    "physics": "physics/knowledge-map.html",
    "chemistry": "chemistry/knowledge-map.html",
    "math": "math/knowledge-map.html",
    "biology": "biology/knowledge-map.html",
}

EXTRACT_JS = r"""
(subject) => {
  const T = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  const strip = (el, sel) => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll(sel).forEach(x => x.remove()); return T(c); };
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  // 公式排版拍平成一行文字：分数写成 a/b，化学方程式的等号写成「=」
  const TX = el => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('.frac').forEach(f => { const s = [...f.children].map(T); f.replaceWith(s.length === 2 ? s[0] + '/' + s[1] : T(f)); });
    c.querySelectorAll('.eqs').forEach(e => e.replaceWith(' = '));
    return T(c);
  };
  const out = [];
  if (subject === 'physics' || subject === 'chemistry') {
    const chapOf = el => {
      if (subject === 'physics') { const ch = window.CH17; return ch ? '第十七章 ' + ch.name : ''; }
      const u = el.closest('section.unit'); return u ? T(u.querySelector('.unit-head h2')) : '';
    };
    document.querySelectorAll('article.kp[id]').forEach(el => {
      const name = strip(el.querySelector('.kp-head h4'), '.st,.mk-kp');
      out.push({ k: el.id, a: el.id, n: name, c: chapOf(el), x: cut(TX(el.querySelector('.core')), 60), t: 'kp' });
    });
    document.querySelectorAll('.exp[id]').forEach(el => {
      out.push({ k: el.id, a: el.id, n: strip(el.querySelector('h4'), '.tag,.lk-row'), c: chapOf(el), x: '课本必做实验', t: 'exp' });
    });
    document.querySelectorAll('.b-item[id]').forEach(el => {
      const dd = [...el.querySelectorAll('dt')].reduce((m, dt) => { m[T(dt)] = T(dt.nextElementSibling); return m; }, {});
      const sec = el.closest('section.unit');
      out.push({ k: el.id, a: el.id, n: cut(dd['高中怎么深化'] || '', 40), c: dd['对应教材'] || '', x: cut('初中：' + (dd['初中怎么说'] || '').replace(/高中会修正.*$/, ''), 60), t: 'hs',
                 u: sec ? T(sec.querySelector('.unit-head h2')) : '' });
    });
    if (subject === 'physics') {
      document.querySelectorAll('li[id^="toc-ch"]').forEach(el => {
        if (!/^toc-ch\d+-s\d+$/.test(el.id)) return;
        const chap = el.closest('details[id^="toc-ch"]');
        const name = T(el.querySelector(':scope > details > summary')) || strip(el, 'ul,.lk-row,.st');
        out.push({ k: el.id, a: el.id, n: name, c: chap ? T(chap.querySelector('summary .chap')) : '', x: '', t: 'sec' });
      });
    }
  } else {
    const keyAttr = subject === 'math' ? 'data-key' : 'data-kid';
    document.querySelectorAll('li.ok[' + keyAttr + ']').forEach(el => {
      const oc = el.closest('li.oc'), os = el.closest('li.os');
      const chap = oc ? T(oc.querySelector('summary .chap')) : '';
      const sec = os ? T(os.querySelector(':scope > details > summary')) : '';
      let name, x;
      if (subject === 'math') { name = T(el.querySelector('.kn')); x = TX(el.querySelector('.kt')); }
      else { name = T(el.querySelector('.okt b')); x = strip(el.querySelector('.okt'), 'b'); }
      out.push({ k: el.getAttribute(keyAttr), a: el.id, n: name, c: chap, sc: sec, x: cut(x, 60), t: 'kp' });
    });
  }
  return out;
}
"""


def extract():
    from playwright.sync_api import sync_playwright

    items = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for subject, rel in MAPS.items():
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto((ROOT / rel).as_uri())
            page.wait_for_timeout(1200)
            rows = page.evaluate(EXTRACT_JS, subject)
            page.close()
            for r in rows:
                r = {k: v for k, v in r.items() if v not in ("", None)}
                r["s"] = subject
                items.append(r)
            print(f"  {subject}: {len(rows)} 条", file=sys.stderr)
        browser.close()
    return items


def experiment_anchors():
    """实验页里实际存在的模块和任务。"""
    found = {}
    cl = (ROOT / "physics/circuits-lab.html").read_text(encoding="utf8")
    found["physics/circuits-lab.html"] = set(re.findall(r'<section[^>]*\bid="(m\d+)"', cl))
    for rel in ["physics/hs-electricity.html", "chemistry/neutralization.html", "biology/microscope.html"]:
        s = (ROOT / rel).read_text(encoding="utf8")
        found[rel] = set(re.findall(r'data-task="([a-z_]+)"', s))
    return found


def check(items):
    links = json.loads((ROOT / "shared/links.json").read_text(encoding="utf8"))
    keys = {(it["s"], it["k"]) for it in items}
    anchors = experiment_anchors()
    problems = []
    targets = links.get("targets", {})
    for tid, t in targets.items():
        page = t.get("page")
        if page not in anchors:
            problems.append(f"实验 {tid}：页面 {page} 不在检查范围内")
            continue
        anchor = t.get("module") or t.get("task")
        if anchor not in anchors[page]:
            problems.append(f"实验 {tid}：{page} 里找不到 {anchor}")
        if t.get("level") not in ("junior", "senior", "mixed"):
            problems.append(f"实验 {tid}：level 应为 junior / senior / mixed")

    def kp_ok(ref):
        if ":" not in ref:
            return False
        s, k = ref.split(":", 1)
        return (s, k) in keys

    for i, l in enumerate(links.get("links", [])):
        where = f"第 {i + 1} 条关联（{l.get('kp')} → {l.get('to')}）"
        if not kp_ok(l.get("kp", "")):
            problems.append(where + "：知识点不存在")
        to = l.get("to", "")
        if to not in targets and not kp_ok(to):
            problems.append(where + "：去处既不是实验也不是知识点")
        if l.get("level") and l["level"] not in ("junior", "senior"):
            problems.append(where + "：level 应为 junior 或 senior")
    return links, problems


def main():
    only_check = "--check" in sys.argv
    print("读取四张导图……", file=sys.stderr)
    items = extract()
    links, problems = check(items)
    n_links = len(links.get("links", []))
    n_targets = len(links.get("targets", {}))
    if problems:
        print(f"关联表有 {len(problems)} 处问题：", file=sys.stderr)
        for p in problems:
            print("  - " + p, file=sys.stderr)
    else:
        print(f"关联表检查通过：{n_targets} 个实验模块/任务，{n_links} 条关联。", file=sys.stderr)
    if not only_check:
        out = {"v": 1, "built": date.today().isoformat(), "items": items}
        path = ROOT / "shared/search-index.json"
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
        print(f"已写入 {path.relative_to(ROOT)}（{len(items)} 条，{path.stat().st_size // 1024} KB）", file=sys.stderr)
        # 关联表里用到的知识点：名称、所在章、摘要。导图和实验页只读这个小文件，不必下载整份索引
        refs = set()
        for l in links.get("links", []):
            refs.add(l.get("kp", ""))
            if l.get("to", "") not in links.get("targets", {}):
                refs.add(l.get("to", ""))
        names = {}
        for it in items:
            ref = it["s"] + ":" + it["k"]
            if ref in refs:
                names[ref] = {k: it[k] for k in ("n", "c", "sc", "x", "t", "a") if k in it}
        npath = ROOT / "shared/link-names.json"
        npath.write_text(json.dumps({"v": 1, "built": out["built"], "kps": names}, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
        print(f"已写入 {npath.relative_to(ROOT)}（{len(names)} 个知识点）", file=sys.stderr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
