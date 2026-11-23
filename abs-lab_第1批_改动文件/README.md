# ABS-LAB · 数理化生互动实验平台

> 源于课本，高于课本——在线可视化原理探索与互动实验平台

- **在线访问**：`https://www.wenzheng.eu/abs-lab/`
- **GitHub 仓库**：`https://github.com/Pasdeau/abs-lab`
- **Authors**：Wenzheng Wang · Hang Li

---

## 一、如何加入这个仓库（首次接入，只需做一次）

### 1. 接受协作者邀请
1. 登录你的 GitHub 账号。
2. 打开注册邮箱里的邀请邮件，或直接访问 `https://github.com/Pasdeau/abs-lab/invitations`。
3. 点击 **Accept invitation** 接受邀请，即可获得本仓库的贡献权限。

### 2. 配置本地 Git 环境
如果你电脑上还没有 Git，先安装 Git（macOS 在终端运行 `xcode-select --install` 或用 Homebrew；Windows 下载 [Git for Windows](https://git-scm.com/)；不习惯命令行也可以直接安装 [GitHub Desktop](https://desktop.github.com/)）。

首次使用 Git 需设置姓名和邮箱（与你的 GitHub 账号一致）：
```bash
git config --global user.name "你的名字"
git config --global user.email "你的GitHub邮箱"
```

> **登录认证方式（二选一）**：
> - **方式 A（推荐，最省事）**：安装 **GitHub Desktop** 或 **VS Code**，登录 GitHub 账号后即可自动完成授权。
> - **方式 B（命令行 SSH）**：执行 `ssh-keygen -t ed25519` 生成密钥，将 `~/.ssh/id_ed25519.pub` 的内容粘贴到 GitHub 的 **Settings → SSH and GPG keys**。

### 3. 把仓库克隆（Clone）到本地电脑
在终端进入你想存放代码的目录（例如桌面或个人项目文件夹），执行：
```bash
# HTTPS 方式
git clone https://github.com/Pasdeau/abs-lab.git

# 如果配置了 SSH 密钥，也可以用：
# git clone git@github.com:Pasdeau/abs-lab.git

cd abs-lab
```

### 4. 本地预览网站
本仓库为纯静态前端 + Vercel Serverless API，无需安装 `node_modules`：
- **最简单**：直接用浏览器双击打开 `index.html` 即可离线浏览所有实验。
- **推荐（本地 HTTP 服务）**：在 `abs-lab` 目录下运行：
  ```bash
  python3 -m http.server 8080
  ```
  浏览器打开 `http://localhost:8080`。

---

## 二、在自己电脑上更新后，如何上传贡献代码（日常流程）

推荐采用 **「同步最新代码 → 切独立分支修改 → 推送分支 → 发 Pull Request (PR)」** 的标准协作流程，这样即使两人同时开发也不会互相覆盖，而且每次 PR 都会自动生成 Vercel 在线预览链接。

### 第 1 步：开始修改前，先同步最新代码
每次动手写新内容前，先把远程 `main` 分支的最新改动拉下来：
```bash
cd abs-lab
git checkout main
git pull origin main
```

### 第 2 步：新建一个本次修改的分支
根据你要做的内容起一个简短的英文分支名（例如新增光学实验或修改物理导图）：
```bash
git checkout -b feat/physics-optics
```
（常见前缀：`feat/` 新增实验或功能，`fix/` 修复问题，`docs/` 修改文档。）

### 第 3 步：在本地修改并自测
按学科目录编辑或新增文件（详见下方「项目结构与开发规范」），改完后在浏览器打开测试功能是否正常。

### 第 4 步：查看改动、提交并推送到 GitHub
```bash
# 1. 检查自己修改或新增了哪些文件
git status

# 2. 暂存所有改动（也可以只写具体文件名，如 git add physics/）
git add .

# 3. 写一句简明的提交说明
git commit -m "feat(physics): add optics refraction experiment"

# 4. 推送你的分支到 GitHub 远程仓库
git push -u origin feat/physics-optics
```

### 第 5 步：在 GitHub 发起 Pull Request (PR) 并上线
1. 推送成功后，打开 `https://github.com/Pasdeau/abs-lab`。
2. 页面上方会出现绿/黄色的 **Compare & pull request** 按钮，点击它。
3. 填写标题和简短说明（例如“新增高中物理光的折射实验”），点击 **Create pull request**。
4. 等待几秒后，PR 页面下方会自动出现 **Vercel Preview** 预览链接，可先在线核对效果。
5. 确认无误后点击 **Merge pull request** 合并进 `main` 分支，Vercel 会在约 10 秒内自动部署上线到 `https://www.wenzheng.eu/abs-lab/`。

> **合并后的清理**：下次再做新改动时，回到第 1 步执行 `git checkout main && git pull origin main` 再开新分支即可。

### 补充：使用 GitHub Desktop（纯图形界面，免记命令）
1. 打开 GitHub Desktop → **File → Clone Repository**，选择 `Pasdeau/abs-lab`。
2. 每次改动前点顶部 **Fetch origin / Pull origin** 同步最新代码。
3. 点左上角 **Current Branch → New Branch** 新建一个分支。
4. 在本地文件夹改好代码后，回到 GitHub Desktop，在左下角填写提交说明 → 点 **Commit to <分支名>** → 点右上角 **Publish branch / Push origin**。
5. 点击提示的 **Create Pull Request** 跳转到网页完成合并。

---

## 三、项目结构与开发规范

```text
abs-lab/
├── index.html                    # 平台总门户（按物理、化学、数学、生物四科分类）
├── vercel.json                   # Vercel 部署配置
├── api/                          # 云端登录与进度同步接口（Upstash Redis）
│   ├── _redis.js
│   ├── auth.js
│   ├── progress.js
│   └── mistakes.js               # 错题本（按账号保存，仅本人可读写）
├── shared/
│   ├── theme.css                 # 公共样式与中英双语切换
│   ├── auth.js                   # 用户认证、记住我、跨设备进度同步
│   ├── topbar.js                 # 全站统一顶栏与账号弹窗
│   └── mistakes.js               # 知识导图页面上的「我的错题」
├── physics/                      # ⚡ 物理（知识导图、21合1电学、高中双语电学）
├── chemistry/                    # 🧪 化学（知识导图、酸碱中和滴定等）
├── math/                         # 📐 数学（知识导图）
├── biology/                      # 🧬 生物（知识导图、光学显微镜实操实验台与标本图）
├── tools/
│   ├── sync-maps.py              # 把项目里的知识导图同步成网站公开版
│   └── dev-server.js             # 本地预览（含登录、进度同步、错题本，数据库用内存模拟）
└── docs/操作日志.md               # 每次改动的记录
```

### 贡献代码时的 3 条关键约定
1. **所有链接与资源必须使用相对路径**
   - 正确写法：`../shared/theme.css`、`../index.html`、`specimens/onion-epidermis.jpg`
   - **禁止**以 `/` 开头的根路径（如 `/shared/theme.css`），否则通过 `https://www.wenzheng.eu/abs-lab/` 访问时会找不到资源。
2. **新页面接入统一顶栏与账号进度**
   - 在新 HTML 的 `<head>` 中加入：
     ```html
     <link rel="stylesheet" href="../shared/theme.css" />
     <script src="../shared/auth.js"></script>
     ```
   - 在 `<body>` 第一行加入：
     ```html
     <script src="../shared/topbar.js" data-root=".." data-page="你的模块名" data-bilingual="true"></script>
     ```
   - 如果是独立单文件整页集成（如知识导图），给 `topbar.js` 加上 `data-mode="compact"` 即可。
3. **尽量一实验一文件，减少冲突**
   - 新增实验放在对应学科文件夹下，并在 `index.html` 对应学科板块中增加入口卡片。

---

## 四、知识导图与错题本

- 四科知识导图（`*/knowledge-map.html`）**不要直接改**：它们由 `tools/sync-maps.py` 从项目里的原始导图生成。改内容时先改原始导图，再运行：
  ```bash
  python3 tools/sync-maps.py --src <放原始导图的文件夹>          # 四科都同步
  python3 tools/sync-maps.py --src <文件夹> --only math            # 只同步一科
  ```
  脚本会去掉个人考试信息（阶段考试的日期、题号、分数、薄弱标记）和课堂进度，再插入站点顶栏、登录同步和错题本三行接入代码；对不上会报错停下。**原始导图含个人信息，不要放进仓库**（仓库是公开的）。
- 学习状态：四科分别存在浏览器的 `wlzs.` / `hxzs.` / `sxzs.` / `swzs.` 键里，已加入 `shared/auth.js` 的同步名单，登录后跨设备同步。
- 错题本：登录云端账号后，知识点旁出现「＋错题」，左下角「我的错题」查看、编辑、导出、导入。数据存在 Redis 的 `abslab:mistakes:<用户名>`，一条一个字段，只有本人的登录令牌能读写；游客和本地账号不能用。
- 本地预览（含登录和错题本）：`node tools/dev-server.js`，打开 `http://localhost:8080/abs-lab/`。

---

## 五、常见问题快速排查

- **`git push` 提示 `rejected (fetch first / non-fast-forward)`**
  说明远程 `main` 有别人新合并的更新，先同步再推：
  ```bash
  git pull --rebase origin main
  git push
  ```
- **想放弃本地改乱的某个文件**
  ```bash
  git checkout -- 文件路径
  ```
- **如何测试跨设备登录与进度同步？**
  本地双击 `file://` 打开时自动走浏览器本地存储模式；推送合并上线后访问 `https://www.wenzheng.eu/abs-lab/`，登录弹窗右上角显示绿色「云端已连接」，即可在电脑和手机间实时同步进度。
