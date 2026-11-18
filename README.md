# ABS-LAB · 数理化生互动实验平台

作者：Wenzheng Wang · Hang Li

## 目录结构

```text
abs-lab/
├── index.html                    # 统一门户首页
├── vercel.json                   # Vercel 静态与 Serverless 路由配置
├── api/                          # Vercel Serverless API（绑定 Upstash Redis 后自动启用跨设备云同步）
│   ├── _redis.js                 # Upstash Redis REST 客户端、密码哈希与签名 Token
│   ├── auth.js                   # POST /api/auth（注册/登录）与 GET /api/auth（探测云同步状态）
│   └── progress.js               # GET/POST /api/progress（跨设备同步学习进度）
├── shared/
│   ├── theme.css                 # 统一视觉样式与双语控制
│   ├── auth.js                   # 账号认证（支持 Remember Me + 云端/本地双模式无缝切换）
│   └── topbar.js                 # 全站统一顶栏与账号弹窗
├── physics/
│   ├── knowledge-map.html        # 物理知识体系与导图
│   ├── circuits-lab.html         # 21 合 1 电学与磁学实验台
│   ├── hs-electricity.html       # 高中双语电学：电流形成与自由电子漂移
│   └── js/hs-electricity.js
├── chemistry/
│   ├── neutralization.html       # 高中双语化学：酸碱中和滴定与微观离子视图
│   └── js/neutralization.js
├── biology/
│   ├── index.html                # 生物目录
│   ├── microscope.html           # 光学显微镜实操实验台（4 种真实标本）
│   ├── js/microscope.js
│   └── specimens/                # 洋葱表皮、人口腔上皮、黑藻叶片、人血涂片显微图
└── math/
    └── index.html                # 数学模块路线图
```

## 如何在 Vercel 绑定 Upstash Redis 实现跨设备云同步（约 2 分钟）

代码层已经完整写好 `api/auth.js` 和 `api/progress.js`，无需任何 `npm` 依赖，也无需改一行代码：

1. 在 Vercel 打开你的 `abs-lab` 项目 → 点击顶部 **Storage** 标签页。
2. 点击 **Create Database** → 选择 **Upstash** → **Upstash for Redis**（选择 Free 免费套餐，区域选离用户较近的如 Singapore / Frankfurt / US-East）。
3. 创建完成后，点击 **Connect Project**，勾选你的 `abs-lab` 项目（Environment 勾选 Production / Preview / Development）。
4. Vercel 会自动向项目注入 `UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN`（或 `KV_REST_API_URL` / `KV_REST_API_TOKEN`，后端已同时兼容两种变量名）。
5. 回到 Vercel 项目的 **Deployments**，对最新一次部署点右侧 `...` → **Redeploy**，让环境变量生效即可！
6. 生效后，打开网站登录账号弹窗右上角会显示绿色「云端已连接」，之后在手机、iPad、电脑上用同一账号密码登录，所有进度都会跨设备自动同步。

## 本地预览

- 直接双击打开 `index.html`，或在目录内执行 `python3 -m http.server 8080` 访问 `http://localhost:8080`。
