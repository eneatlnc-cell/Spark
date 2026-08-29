# 白名单收集后端 — 5 分钟部署指南

> **当前实际部署(2026-08-29 已上线)**
>
> | 项 | 值 |
> |---|---|
> | Worker 地址 | `https://spark-whitelist.spark-loop-eneatlnc.workers.dev` |
> | 提交接口(前端已接) | `/submit` |
> | 进度接口(前端已接) | `/progress` |
> | 挑战下发接口 | `/challenge?wallet=0x…` |
> | 所有权验证接口 | `/verify` |
> | KV 命名空间 | `WHITELIST`(`ddac5cd69ede4b1ea0653d5155b6bc43`) |
> | 部署命令 | 仓库根目录 `npx wrangler deploy`(配置见 `wrangler.toml`) |
> | ADMIN_TOKEN | 已设置(保存于运营方本地,勿入仓库;泄露后 `npx wrangler secret put ADMIN_TOKEN` 轮换) |
>
> 前端 `WL_WORKER` / `PP_ENDPOINT` 均已指向上述地址,无需再改。
> 以下为原始部署手册(重部署/换号时参考)。
>
> **当前生效模式（v2.4）**：双通道收集 + 钱包所有权验证 + 进度阈值门控。
>
> - **通道 1 · 邮件（主通道，原样保留）**：`WL_ENDPOINT` 指向 FormSubmit AJAX
>   端点 `https://formsubmit.co/ajax/eneatlnc@gmail.com` —— 每条白名单登记
>   仍会自动以邮件送达运营邮箱；`OPS_MAIL` 同时启用 mailto 兜底按钮。
> - **通道 2 · KV + 进度（可选）**：部署本文的 Worker 后，把 `assets/whitelist.js`
>   顶部的 `WL_WORKER` 指向 Worker 的 `/submit` —— 登记同时落进 KV 存储，
>   预售进度条按意向额度**自动聚合**（详见下文进度条一节）。留空 = 仅邮件
>   模式（v2.2 行为）。
> - 两通道完全独立：任一通道故障互不影响，未同步的记录按通道各自重试
>   （下次访问自动补传 / 运营台 SYNC）。
>
> - **一次性激活**：FormSubmit 已向该邮箱发送激活邮件，点击其中的 "Activate Form"
>   后通道正式生效；激活前的提交留在访客本地、下次访问自动补传，不丢数据。
> - **Referer 依赖**：FormSubmit 只接受来自 http(s) 页面的提交 —— file:// 直接
>   双击打开 HTML 时收不到邮件属正常现象；部署到 GitHub Pages 后即可。
> - 数据经 FormSubmit（第三方）中转，字段仅限登记所需（钱包/邮箱/档位/时间戳）。
>
> 想升级时按本文部署 Worker、填好 `WL_WORKER`（**不是**替换 `WL_ENDPOINT`），
> 邮件通道保持原样即可。

## 为什么需要这个

Spark 网站是纯静态站。改造前，白名单表单的数据**只存在访客自己的浏览器 localStorage 里**，
运营者永远收不到；页面上唯一的"发送确认"按钮指向一个保留死域（`whitelist@sparkloop.example`，
`.example` 是 IANA 保留 TLD，邮件永远无法送达）。也就是说：**预售漏斗的收集环节原本是断的** ——
100% 的登记都丢了。

现在的架构（`assets/whitelist.js` v2）：

```
访客提交表单
   │
   ├─ 1. localStorage 本地保存（永远先做 —— 端点再怎么挂，数据都不丢）
   │
   └─ 2. POST WL_ENDPOINT（text/plain JSON，无 CORS 预检）
          ├─ 成功 → 页面显示 "✓ 已登记"，记录标记 synced=1
          └─ 失败 → 页面显示 "⚠ 已本地保存"，下次访问自动补传；
                    运营台也可手动 SYNC
```

端点未配置时，一切行为退回旧的纯本地模式（不会坏），但状态行会如实提示
"运营方尚未配置收集端点"。

## 部署步骤（Cloudflare Workers，免费额度 10 万请求/天）

1. **安装 wrangler**（一次性）：`npm install -g wrangler`，然后 `wrangler login`

2. **创建 KV 命名空间**：
   ```bash
   wrangler kv:namespace create WHITELIST
   ```
   记下输出的 `id`。

3. **建 `wrangler.toml`**（放在 worker 代码同目录）：
   ```toml
   name = "spark-whitelist"
   main = "whitelist-worker.js"
   compatibility_date = "2024-01-01"

   [[kv_namespaces]]
   binding = "WHITELIST"
   id = "<上一步的 id>"
   ```

4. **设置管理令牌**：
   ```bash
   wrangler secret put ADMIN_TOKEN
   # 输入一段随机长字符串，例如: openssl rand -hex 32
   ```

5. **部署**：
   ```bash
   wrangler deploy
   # 得到 https://spark-whitelist.<你的子域>.workers.dev
   ```

6. **接通前端**：编辑 `assets/whitelist.js` 顶部，把**新增的第二通道**指向 Worker：
   ```js
   var WL_WORKER = "https://spark-whitelist.<你的子域>.workers.dev/submit";
   ```
   （`WL_ENDPOINT` 保持指向 FormSubmit —— 邮件照收，双通道并行。）
   同时把 `assets/presale-progress.js` 的 `PP_ENDPOINT` 指向 `/progress`。
   提交、push、发布网站。完成 —— 每条登记既进 KV（进度自动聚合），
   邮件也照常送达。

## 运营者日常使用

| 操作 | 方法 |
|------|------|
| 看总人数 + 意向总额 | `GET /count?t=<ADMIN_TOKEN>` |
| 导出全部（JSON） | `GET /list?t=<ADMIN_TOKEN>` |
| 浏览器内导出 CSV | 打开 `spark.html?export=1` → ↓ CSV |
| 补传漏网记录 | `spark.html?export=1` → ↻ SYNC |
| 合并邮件回传 | 同上 → 粘贴 JSON → MERGE |
| 重算聚合缓存 | `GET /progress?t=<ADMIN_TOKEN>&recount=1` |

## 预售进度条（`/progress` 端点 · 意向额度自动聚合）

首页与预售页的进度条由 `assets/presale-progress.js` 驱动，软顶 $500K / 硬顶 $1M。
**进度不再需要运营方手工申报**：`GET /progress` 返回的 `raised` 是全量白名单
登记的**意向额度之和** —— 每条登记的档位在服务端映射为金额
（Ember $50 · Flame $100 · Supernova $500，与预售页档位卡片一致），逐钱包累加：

```
每条白名单登记 POST /submit
   │
   ├─ 记录按钱包 upsert 进 KV（wl:0x…，含 tier）
   │
   └─ 聚合缓存同步增量更新：
        新钱包    → raised += 档位金额, count += 1
        改档位    → raised += (新档位 − 旧档位)     ← 重试/重复提交 delta=0，天然幂等
        GET /progress → 直接读缓存（2 次 KV 读），全站进度条实时跟随
```

要点：

1. **金额由服务端从档位推导**，客户端从不提交金额 —— 篡改请求无法虚抬进度条。
2. 超过硬顶的**超额认购如实上报**（例如累计意向 $1.2M 时返回 1,200,000），
   前端渲染时自行钳制在 $1M;`count` 恒为去重后的钱包数。
3. 聚合缓存放在 `agg:raised` / `agg:count`（与 `wl:` 记录前缀隔离，互不污染）。
   并发提交存在极小概率的读改写竞争导致漂移 —— 任何时候可一键对账重算：
   ```bash
   curl "https://spark-whitelist.<你的子域>.workers.dev/progress?t=<ADMIN_TOKEN>&recount=1"
   ```
   全量重扫 KV、重建缓存并把精确数字返回（带 `"recounted": true`）。
   缓存键不存在时（首次部署/清空），第一次 `GET /progress` 也会自动触发重算自愈。
4. 接通前端（部署 Worker 后，两行配置）：
   ```js
   /* assets/presale-progress.js 顶部 */
   var PP_ENDPOINT = "https://spark-whitelist.<你的子域>.workers.dev/progress";
   /* assets/whitelist.js 顶部 —— 新增的第二通道，邮件通道 WL_ENDPOINT 原样保留 */
   var WL_WORKER = "https://spark-whitelist.<你的子域>.workers.dev/submit";
   ```
   提交、push —— 此后每一条白名单登记都会同时：邮件送达运营邮箱（不变）+
   落进 Worker KV 并自动推进进度条（新增），无需任何人工更新。
   访客浏览器里尚未入 KV 的旧登记，会在其下次访问页面时自动补传。
5. 未部署 Worker 时的替代：直接改 `presale-progress.js` 里的 `PP_FALLBACK`
   静态快照（`{ raised: 0, count: null }`），同样能让进度条显示 —— 只是每次
   更新都要重新提交发布。
6. **种子期阈值门控（seed gating）**：`presale-progress.js` 顶部的
   `PP_MIN_COUNT`（默认 10）控制进度条的可见阈值。登记钱包数低于该值时，
   进度条与数字全部隐藏，只显示"白名单开放中"文案 —— 避免上线初期一条死
   死的 0% 条显得冷清。达到阈值后进度条自动淡入。设为 0 则始终显示。

## 钱包所有权验证（v2.4 新增 · `/challenge` + `/verify`）

**为什么要做**：白名单登记最怕手误抄错钱包地址（一个字母就打错币），以及
"代登记"导致的所有权争议。v2.4 加入可选的钱包验证路径，让用户能证明
"这个钱包是我的"，记录打上 `verified:1` 标记。

### 交互流程

```
用户在 spark.html 点 🔗 CONNECT WALLET
   │
   ├─ 浏览器检测到 injected provider（MetaMask / 币安 Web3 / Rabby …）
   │   弹出授权 → 用户确认 → 钱包地址自动填入（EIP-55 校验和形式，零手误）
   │
   └─ 出现 ✍ SIGN TO VERIFY 按钮（可选，不验证也能登记）
         │
         ▼
   前端 GET /challenge?wallet=0x…
         │  Worker 生成 16 字节随机 salt，存入 KV（ch:<wallet>，TTL 15 分钟）
         │  返回 { ok, salt, message } —— message 是待签文本
         │
         ▼
   钱包 personal_sign(message)  —— 用户在钱包弹窗点确认
      （免 Gas、不上链、不授权任何交易）
         │
         ▼
   前端 POST /verify { wallet, sig }
         │
         ├─ Worker 从 KV 读出该钱包的 salt，重建同样的 message
         ├─ 用 keccak-256 + secp256k1 从签名恢复出签名者公钥 → 地址
         └─ 若恢复地址 === 声明地址 → 通过
              · 写 v:<wallet> = timestamp（KV, TTL 7 天）—— 7 天所有权证明
              · 删除 ch:<wallet>（挑战单次有效）
              · 若该钱包已有 wl: 记录，回填 verified:1
              · 返回 { ok: true, verified: true, address }
```

### 提交时的行为

- **已通过验证的钱包** → 记录自动带 `verified:1`，成功面板显示
  "✓ 已验证钱包所有权"绿色行。
- **未验证的钱包** → 照常登记，只是没有验证标记。手动输入路径完全保留。
- **验证失败** → 不拦截登记，提示用户重试即可。

### 防手误的三道关卡

| 层级 | 机制 | 位置 |
|------|------|------|
| L1 | EIP-55 校验和：混合大小写地址必须与 keccak 哈希逐位匹配，否则拒绝 | 前端 `whitelist.js` + Worker `sanitize()` |
| L2 | 手动粘贴时弹出确认框，显示校验和地址 + 首尾 6 位，让用户肉眼核对 | 前端 `whitelist.js` |
| L3 | 连接钱包：地址直接从钱包读出，写入时已是校验和形式，零手误 | 前端 EIP-1193 provider |

### 安全说明

- **纯 JS 密码学**：Worker 里的 keccak-256 和 secp256k1 是零依赖的 BigInt 实现
  （约 200 行），没有引入任何外部 crypto 库，减少供应链风险。
- **挑战一次性**：验证成功后立即烧毁 challenge；失败则保留（可重试，不烧 KV 写配额）。
- **7 天有效期**：`v:<wallet>` 标记 TTL 7 天，足够覆盖预售窗口；过期后用户再次
  签名即可续期（钱包始终在用户手里，随时可重新证明）。
- **不上链、不授权**：`personal_sign` 只签一条文本消息，不涉及任何链上交易、
  不批准任何代币转移。

## 数据与隐私口径（对外可公示）

- 只收集三个字段：钱包地址、邮箱、意向档位（+ 时间戳与语言）。
- 无 cookie、无指纹、无第三方分析脚本；本 Worker 不存 IP。
- `/progress` 只输出聚合数字（意向额度合计、白名单人数），不含任何个人数据。
- 推荐短码 `SL-XXXXXX` 由钱包地址确定性推导（FNV-1a），服务端重新推导校验，
  客户端报什么码都不影响树的形状 —— 防推荐关系伪造。
- 提交以钱包地址为键幂等 upsert：重复提交 / 网络重试不会产生重复记录。

## 备用通道（可选）

设置 `assets/whitelist.js` 中的 `OPS_MAIL` 为真实邮箱后，成功页会出现
"发送确认邮件"按钮（mailto 携带 JSON 载荷），作为端点故障时的最后兜底。
留空或仍是 `.example` 占位时，按钮自动隐藏。

## 自定义域名时别忘了

`index.html` 等 9 个页面的 `<link rel="canonical">` 与 `og:image` 都指向
`https://eneatlnc-cell.github.io/Spark/...`。换域名时全局替换该前缀
（`sitemap.xml` 同理，其头部注释已有说明）。
