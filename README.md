# Binance Short Grid Bot

币安 USDT 永续合约 · 超买筛选 → 网格做空建仓 → 分档止盈 + 硬止损

## 项目进度

### Phase 1 — 基础框架 ✅
| Step | 内容 | 状态 |
|------|------|------|
| 1 | 项目结构初始化（FastAPI + Next.js 14 + Docker） | ✅ 完成 |
| 2 | 数据库模型定义 + Alembic 迁移（SQLite/PostgreSQL 双兼容） | ✅ 完成 |
| 3 | 策略配置 CRUD API + Web 配置表单（含实时校验） | ✅ 完成 |

### Phase 2 — 核心策略引擎 ✅
| Step | 内容 | 状态 |
|------|------|------|
| 4 | 币安 API 封装层（限流/重试/指数退避） | ✅ 完成 |
| 5 | RSI 计算 + 标的扫描引擎（市值/成交额/深度/RSI/冷却期） | ✅ 完成 |
| 6 | 网格做空建仓引擎（分档限价单） | ✅ 完成 |
| 7 | 止盈止损引擎（分档止盈/移动止盈/硬止损/时间止损） | ✅ 完成 |

### Phase 3 — 实时交互 ✅
| Step | 内容 | 状态 |
|------|------|------|
| 8 | WebSocket 推送服务 | ✅ 完成 |
| 9 | 仪表盘 + 持仓管理前端页面 | ✅ 完成 |
| 10 | 交易日志页面 + CSV 导出 | ✅ 完成 |

### Phase 4 — 风控与通知 ✅
| Step | 内容 | 状态 |
|------|------|------|
| 11 | 账户级风控规则（总仓位/日亏损/连续亏损暂停） | ✅ 完成 |
| 12 | Telegram 通知集成 | ✅ 完成 |
| 13 | 异常处理 + 断线重连（指数退避） | ✅ 完成 |

### Phase 5 — 部署与测试 🔄
| Step | 内容 | 状态 |
|------|------|------|
| 14 | Docker Compose 编排 + Nginx 配置 | ✅ 完成 |
| 15 | 本地联调测试（23 API + 12 单元测试全部通过） | ✅ 完成 |
| 16 | 币安 Testnet 实盘联调 | ⏳ 待配置 API Key |

## 技术栈

```
后端:  Python 3.11+ / FastAPI / SQLAlchemy (async) / Pydantic v2
前端:  React 18 / Next.js 14 / TypeScript / TailwindCSS / Recharts
数据库: PostgreSQL 15 (prod) / SQLite (dev) + Redis 7
部署:  Docker Compose + Nginx + HTTPS
交易所: python-binance (Binance Futures API)
```

## 项目结构

```
binance-short-grid-bot/
├── backend/
│   ├── app/
│   │   ├── api/            # 23 个 REST API 端点
│   │   │   ├── config.py       # 策略配置 CRUD + 模板
│   │   │   ├── positions.py    # 持仓查询/平仓/修改TP-SL
│   │   │   ├── scanner.py      # 扫描状态 + 手动触发
│   │   │   ├── system.py       # 暂停/恢复/模式切换
│   │   │   ├── logs.py         # 交易日志 + CSV 导出
│   │   │   └── account.py      # 余额 + PnL 曲线
│   │   ├── services/       # 核心业务引擎
│   │   │   ├── exchange.py     # 币安 API 封装 (限流+重试)
│   │   │   ├── scanner.py      # 标的扫描引擎
│   │   │   ├── grid_engine.py  # 网格做空建仓
│   │   │   ├── tp_sl_engine.py # 止盈止损监控
│   │   │   └── notifier.py     # Telegram + WS 通知
│   │   ├── models/          # 数据模型
│   │   ├── core/            # DB/Redis/WebSocket
│   │   └── utils/           # RSI 等技术指标
│   └── tests/               # 12 个单元测试
├── frontend/
│   └── src/
│       ├── app/             # 6 个页面
│       │   ├── page.tsx         # 仪表盘 (PnL图+持仓表)
│       │   ├── config/          # 策略配置 (滑块+表格+模板)
│       │   ├── scanner/         # 扫描监控
│       │   ├── positions/       # 持仓管理 (网格进度条)
│       │   ├── logs/            # 交易日志 + CSV
│       │   └── system/          # 系统设置
│       ├── components/      # Sidebar + TopBar
│       └── lib/api.ts       # API 客户端 + WebSocket
├── docker-compose.yml       # 5 服务编排
└── nginx/nginx.conf         # 反向代理 + WS
```

## 快速启动（本地开发）

```bash
# 1. 后端
cd backend
cp .env.example .env
# 编辑 .env 设置 BINANCE_API_KEY 和 BINANCE_API_SECRET
python -m venv ../venv && source ../venv/bin/activate
pip install -r requirements.txt
pip install aiosqlite  # 本地用 SQLite
# 修改 .env: DATABASE_URL=sqlite+aiosqlite:///./trading_bot.db
uvicorn app.main:app --port 8888

# 2. 前端
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8888/api" > .env.local
npm run dev

# 3. 访问
# API 文档: http://localhost:8888/api/docs
# 前端界面: http://localhost:3000
```

## Docker 部署

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env 配置真实 API Key
docker-compose up -d
# 访问 http://localhost
```

## 测试验证记录

- 后端启动: ✅ FastAPI + SQLite 正常
- 23 个 API 端点: ✅ 全部注册、返回正确格式
- 策略配置 CRUD: ✅ PUT/PATCH/GET + 模板
- 输入校验: ✅ 越界/非法值拦截
- 系统控制: ✅ 暂停/恢复/模式切换
- WebSocket: ✅ 连接+保活
- 前端构建: ✅ Next.js build 无错误
- 单元测试: ✅ 12/12 通过 (RSI + Schema)

## 版本历史

- **v0.1.0** (2026-03-28) — 全功能初版，Phase 1~5 代码完成，待 Testnet API Key 联调
