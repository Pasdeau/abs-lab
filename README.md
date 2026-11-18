# ABS Lab · 数理化生互动实验平台

独立于主博客的数理化生可视化学习与实验平台，托管于 `https://github.com/Pasdeau/abs-lab`，上线后挂载在 `https://wenzheng.eu/abs-lab/`。

## 目录结构

```text
abs-lab/
├── index.html                    # 统一门户首页（数·理·化·生入口 + 学习进度总览）
├── vercel.json                   # Vercel 静态部署配置
├── shared/
│   ├── theme.css                 # 统一视觉样式与双语控制
│   ├── auth.js                   # 用户注册/登录、按用户隔离保存学习进度、JSON 导出/导入
│   └── topbar.js                 # 全站统一顶栏与账号弹窗（一行 script 即可接入新页面）
├── physics/
│   ├── knowledge-map.html        # 物理知识体系与导图（原样集成，自动桥接账号进度）
│   ├── circuits-lab.html         # 21 合 1 电学与磁学实验台（原样集成，自动桥接进度）
│   ├── hs-electricity.html       # 高中双语电学：电流形成与自由电子漂移
│   └── js/hs-electricity.js
├── chemistry/
│   ├── neutralization.html       # 高中双语化学：酸碱中和滴定与微观离子视图
│   └── js/neutralization.js
├── math/
│   └── index.html                # 数学模块路线图
└── biology/
    └── index.html                # 生物模块路线图
```

## 本地预览

- **双击打开**：直接用浏览器打开 `index.html` 即可完全离线运行（所有路径均为相对路径）。
- **本地 HTTP 服务**：
  ```bash
  python3 -m http.server 8080
  ```
  浏览器访问 `http://localhost:8080`。

## 协作开发规范

1. **所有链接与资源必须使用相对路径**（如 `../shared/theme.css`、`physics/knowledge-map.html`），不要以 `/` 开头，确保在 `https://wenzheng.eu/abs-lab/` 子路径下正常运行。
2. **新增实验**：在对应学科目录（`physics/`、`chemistry/`、`math/`、`biology/`）新建独立 HTML/JS 文件，在 `<head>` 引入 `../shared/auth.js`，在 `<body>` 顶部引入 `../shared/topbar.js`，然后在 `index.html` 加一张入口卡片即可。
3. **Git 分支协作**：
   ```bash
   git checkout main && git pull origin main
   git checkout -b feat/your-experiment
   # 开发并测试后提交
   git add .
   git commit -m "feat: add new experiment"
   git push -u origin feat/your-experiment
   ```
   在 GitHub 提交 Pull Request 审核后合并上线。

## 关于学习进度保存与跨设备云同步

- **当前版本（零后端即开即用）**：用户在顶栏用「用户名 + 简单密码」注册/登录后，系统按用户名独立隔离保存进度（含知识导图标记、电学实验台上次章节、高中物理与化学探究任务）。**网站代码更新部署到 Vercel 不会清空用户的 `localStorage` 记录**；如需更换设备，可在账号弹窗内一键「导出进度备份 / 导入恢复进度」。
- **未来升级跨设备自动云同步（可选）**：在 Vercel 项目里绑定免费的 Upstash Redis / Vercel KV 或 Supabase，并添加 `api/auth.js` 与 `api/progress.js` 即可无缝接入云端同步，无需改动页面 UI。
