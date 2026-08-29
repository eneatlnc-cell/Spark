# 白名单收集后端 — 5 分钟部署指南

> **当前生效模式（v2.2）**：`WL_ENDPOINT` 已指向 FormSubmit AJAX 端点
> `https://formsubmit.co/ajax/eneatlnc@gmail.com` —— 无需注册、无需部署服务器，
> 每条白名单登记会自动以邮件送达运营邮箱；`OPS_MAIL` 同时启用 mailto 兜底按钮。
>
> - **一次性激活**：FormSubmit 已向该邮箱发送激活邮件，点击其中的 "Activate Form"
>   后通道正式生效；激活前的提交留在访客本地、下次访问自动补传，不丢数据。
> - **Referer 依赖**：FormSubmit 只接受来自 http(s) 页面的提交 —— file:// 直接
>   双击打开 HTML 时收不到邮件属正常现象；部署到 GitHub Pages 后即可。
> - 数据经 FormSubmit（第三方）中转，字段仅限登记所需（钱包/邮箱/档位/时间戳）。
>
> 想升级为数据完全自持（KV 存储 + `/count`、`/list` 运营接口）时，按本文部署
> Worker 并把 `WL_ENDPOINT` 换成 Worker URL 即可，前端无需其他改动。

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

6. **接通前端**：编辑 `assets/whitelist.js` 顶部：
   ```js
   var WL_ENDPOINT = "https://spark-whitelist.<你的子域>.workers.dev/submit";
   ```
   提交、push、发布网站。完成 —— 此后每一条白名单登记都会落进 KV。

## 运营者日常使用

| 操作 | 方法 |
|------|------|
| 看总人数 | `GET /count?t=<ADMIN_TOKEN>` |
| 导出全部（JSON） | `GET /list?t=<ADMIN_TOKEN>` |
| 浏览器内导出 CSV | 打开 `spark.html?export=1` → ↓ CSV |
| 补传漏网记录 | `spark.html?export=1` → ↻ SYNC |
| 合并邮件回传 | 同上 → 粘贴 JSON → MERGE |

## 预售进度条（`/progress` 端点）

首页与预售页的认购进度条由 `assets/presale-progress.js` 驱动，软顶 $500K /
硬顶 $1M。上线前它如实显示 0%（白名单阶段文案）；要让进度条动起来：

1. 部署本 Worker 后，编辑 `assets/presale-progress.js` 顶部：
   ```js
   var PP_ENDPOINT = "https://spark-whitelist.<你的子域>.workers.dev/progress";
   ```
   提交、push —— 进度条即接通实时数据（`GET /progress` 为公开端点，只返回
   聚合数字：已认购金额 / 软硬顶 / 白名单人数，无任何个人信息）。

2. 预售进行中，运营方更新认购额（USD）：
   ```bash
   curl -X POST "https://spark-whitelist.<你的子域>.workers.dev/progress?t=<ADMIN_TOKEN>" \
        -H "Content-Type: application/json" \
        -d '{"raised": 505000}'
   ```
   数值钳制在 `[0, 1000000]`；写入后全站进度条自动跟随（金额上链前由运营方
   申报，接入链上数据源后可改为合约直读）。

3. 未部署 Worker 时的替代：直接改 `presale-progress.js` 里的 `PP_FALLBACK`
   静态快照（`{ raised: 0, count: null }`），同样能让进度条显示 —— 只是每次
   更新都要重新提交发布。

## 数据与隐私口径（对外可公示）

- 只收集三个字段：钱包地址、邮箱、意向档位（+ 时间戳与语言）。
- 无 cookie、无指纹、无第三方分析脚本；本 Worker 不存 IP。
- `/progress` 只输出聚合数字（已认购金额、白名单人数），不含任何个人数据。
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
