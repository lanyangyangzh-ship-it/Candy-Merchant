[README.md](https://github.com/user-attachments/files/33942932/README.md)
# 宝石商人 · 四人版

一个移动端优先的《璀璨宝石》(Splendor) 风格小游戏，现在是 **4 人局**：

- **单机**：你 + 3 位 AI（罗伦佐、碧翠丝、马可）
- **联机**：2–4 位真人，空位由 AI 补足，房主先手
- **4 人设置**：银行每色 **10 枚** + 黄金 5 枚；**5 位贵族**；手牌上限 **10 枚**；15 分最后一轮
- **90 张卡牌，90 个独立场景**：矿脉 / 工坊 / 商路三阶
- **10 枚贵族纹章 + 4 枚商人徽记**，全部内联 SVG
- **12 页 A4 规则书**：四人规则、贵宾纹章、90 张卡牌图鉴

先到 15 分，补完本轮，分高者胜；同分时已购卡牌少者胜。

> 当前是**网页版**（手机浏览器/电脑都能玩）。原生微信小游戏需要用 Canvas 重写并注册小游戏 AppID，暂未包含；小程序 web-view 也需要已备案域名。详见文末。

---

## 一、文件与分享

```
index.html         单文件游戏（约 251 KB，打开即玩）
rulebook.html      12 页 A4 规则书（含 90 张图鉴）
server.mjs         4 人联机服务器（HTTP + WebSocket）
README.md          本文件
src/               引擎 / 美术 / 界面 / 规则书源文件
test/              规则、联机、服务器测试
render.yaml        Render 部署配置
preview-cards.png  卡牌美术预览
preview-nobles.png 贵族纹章预览
```

- **单机**：发 `index.html` 即可，对方用 Chrome / Safari 打开。
- **联机**：发服务器地址或邀请链接，不能只发 HTML。
- **规则书**：发 `rulebook.html`，或打印成 PDF。
- **完整包**：根目录的 `gem-merchant.zip`。

微信/iPhone 对本地 HTML 不友好；最稳的是把 `index.html` 挂到静态托管，发网页链接（见下）。

---

## 二、规则书 / 打印

- **[rulebook.html](rulebook.html)**，约 1.3 MB，12 页，静态无 JS。
- 包含：故事与目标、4 人设置、四种行动、卡牌解剖、5 位贵族、全 10 枚纹章、联机速查、90 张卡牌图鉴。
- 打印 PDF：Chrome / Edge 打开 → `Ctrl/Cmd + P` → 另存为 PDF；A4、边距无、勾选背景图形。
- 服务器部署后 `/rulebook.html` 也能直接打开。
- 卡牌图鉴按 20 / 20 / 30 / 20 分成 4 页；每张卡有完整名称、分数、费用。

### 美术

- 90 张卡牌由 `src/art.js` 按“等级 × 宝石色 × 费用模板 × 固定种子”生成，每张构图不同。
- 贵族是家族纹章（中心宝石=家族色，冠冕=家族徽记）；4 枚商人徽记为白钻/红宝石/蓝宝石/黄金。
- 所有 SVG 内联，无外部图片、字体或 CDN。
- 预览：`preview-cards.png`（12 张样例）、`preview-nobles.png`（10 枚纹章）。

---

## 三、本机 / 局域网联机

需要 Node.js 18+。

```bash
cd gem-merchant
npm install
npm start
```

终端会打印本机、局域网和规则书地址。同一 Wi-Fi 下：

1. 一方打开本机地址，点「联机对战 → 创建新房间」
2. 把 4 位房间码/邀请链接发给朋友（最多 3 位）
3. 朋友加入后，房主点「开始对局」；空位 AI 补足到 4 人
4. 房主先手，按座位轮流

> 联机房间最多 4 人；任何一位离开当前房间会关闭，需重新建房。刷新/断线不会重连。

---

## 四、公网部署（推荐 Render）

项目自带 `render.yaml`，也可以手动建 Web Service：

1. 把 `gem-merchant/` 推到 GitHub（不要提交 `node_modules/`）
2. Render → New → Web Service → 选仓库
3. Build：`npm install`；Start：`npm start`；Health：`/health`
4. 打开 `https://你的服务.onrender.com`
5. 房主创建房间，把邀请链接发给朋友；朋友手机点链接加入
6. 规则书：`https://你的服务.onrender.com/rulebook.html`

客户端自动使用同源 `wss://.../ws`。免费实例会休眠，第一次打开可能慢十几秒。

### 临时公网

```bash
cloudflared tunnel --url http://localhost:8787
# 或 ngrok http 8787
```

把隧道给出的 https 地址发给朋友。服务器需保持运行。

---

## 五、联机怎么工作

- **房主权威**：房主浏览器运行 4 人规则引擎；访客只发送动作（拿宝石/购买/预订/弃牌/选贵族）。
- 房主按座位给每位访客生成**自己的视角**：把该访客旋转到玩家 0，隐藏其他人的预订卡和牌堆，保留自己的预订。
- 房主校验后广播；访客的 UI 始终以自己为「你」。
- 房间码 4 位，最多 4 人；服务端只做配对/路由，不做账号/数据库。
- 房主可以「再来一局」；任意一方离开会关闭房间。v1 暂不支持断线重连/观战。
- 默认同源 `/ws`；静态托管时在「联机对战 → 服务器设置」填 `wss://.../ws`，或 URL 参数 `?server=...`。

---

## 六、项目结构

```
gem-merchant/
├── index.html              # 构建产物：4 人单文件游戏
├── rulebook.html           # 构建产物：12 页 A4 四人规则书
├── server.mjs              # 4 人房间服务器 + /rulebook.html
├── package.json            # ws 依赖、start/build/test
├── render.yaml             # Render 部署
├── build.mjs               # 构建游戏
├── build-rulebook.mjs      # 构建规则书
├── src/
│   ├── engine.js           # 4 人规则 + 3 AI
│   ├── art.js              # 90 卡 + 10 纹章 + 4 徽记 + 主视觉
│   ├── net.js              # 4 人视角/脱敏/WebSocket
│   ├── ui.js               # 4 人界面、AI 调度、联机大厅
│   ├── style.css           # 视觉与响应式
│   ├── index.html          # 游戏模板
│   ├── rulebook.html       # 规则书模板
│   └── rulebook.css        # 规则书 A4 样式
└── test/
    ├── engine.test.mjs     # 4 人规则 + 200 局 4AI 自对弈
    ├── net.test.mjs        # 4 人视角/脱敏/URL
    ├── server.test.mjs     # 4 座房间/路由/规则书
    └── art-check.mjs       # 90 张卡美术检查（开发用）
```

## 七、开发与测试

```bash
npm install
npm run build              # 构建 index.html + rulebook.html
npm test                   # 规则 + 4 人视角 + 4 座服务器
npm run build:game
npm run build:rulebook
```

单机存档在 `localStorage`；联机不写单机存档。引擎/4 人自对弈已跑通；4 人联机用 4 个浏览器页签实测过拿取、轮转和视角。

## 八、关于微信小程序 / 原生小游戏

当前交付是**网页版**，手机浏览器/微信内打开链接即可玩。要变成“微信里直接分享的小程序/小游戏”还需要：

- 注册小游戏 **AppID** 并通过审核（游戏类目可能还要版号/资质）
- 原生小游戏需把 Web 界面用 Canvas 重写；本次未包含
- 若用 web-view 壳，还需要**已备案的 HTTPS 业务域名**，并配置业务域名
- 联机还需要公网 WSS 服务器

没有以上账号/域名时，原生小游戏只能在本机开发者工具预览，不能公开分享。当前网页版不受这个限制。

## 九、说明

玩法源自 Marc André 的桌游《璀璨宝石》(Splendor)。本项目是学习交流用的同人小游戏，无商业用途；卡牌数值遵循基础版，界面、AI、联机、插画与规则书为原创实现。

祝你买到最好的那颗宝石。
