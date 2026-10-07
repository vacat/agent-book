# 附录 E 三库的编译、打包与跨语言协作

> 附录 B 对照的是**概念**（同一个概念三家怎么写）；本附录对照的是**工程**：
> 项目怎么组织、用什么语言写、编译成什么、怎么发出去、跨语言边界放在哪。
> 路径与命令基于 pi `b7dfc049e`、dsh `49120665f`、codex `823ea830c`。

## 1. 项目组织

| | pi | dsh | codex |
|---|---|---|---|
| 布局 | `packages/*` 单层，14 个包 | `packages/<组>/<包>` 两层，54 组 / 328 个包 | `codex-rs/*` 单层，112 个 crate |
| 包命名 | `@earendil-works/pi-*` | `@deepseek-ai/dsh-*` | `codex-*` |
| 应用层 | `packages/coding-agent` | `apps/{cli,web,desktop,desktop-host}` | `codex-rs/cli` + `codex-cli/` |
| 其他顶层目录 | `scripts/`、`nix/`、`.github/` | `native/`、`python/`、`vendor/`、`snapshots/`、`benchmarks/`、`docs/`、`website/`、`scripts/`、`.agents/` | `sdk/{python,python-runtime,typescript}`、`bazel/`、`third_party/`、`patches/`、`tools/`、`docs/` |

**三种组织哲学**：

- **pi 少而平**：14 个包全部平铺，靠包名和依赖方向表达分层；
- **dsh 目录即架构**：`packages/` 的分组名就是子系统名（`core`、`api`、`llm`、
  `shell`、`subprocess`、`sandbox`、`fs`、`session`、`bundle`、`preset`……），
  与 `docs/architecture.md` 的子系统清单一一对应；
- **codex 多而平**：112 个 crate 平铺在 `codex-rs/` 下，分层完全由 Cargo
  依赖图表达。

规模差了两个数量级：pi 14 个包、codex 112 个 crate、dsh 328 个包
（分布在 54 个组里）。

**两条 dsh 特有的组织规则**：

- 只有 `dsh` profile 能启动受支持的 Node 应用——package 的 `bin`、示例、
  公共 SDK 的 argv 逃生口都被禁止（`docs/architecture.md#application-launch`）；
- `docs/` 与代码同仓，中英成对（`*.md` / `*.zh.md` / `*.i18n.yaml`），
  再由 `website/`（VitePress）投影成站点。

**codex 的"双份组织信息"**：每个 crate 同时有 `Cargo.toml` 和 `BUILD.bazel`
（全仓 187 个 `BUILD.bazel`）。

## 2. 开发语言构成

按仓库跟踪的文件数统计：

| 语言 | pi | dsh | codex |
|---|---|---|---|
| 主语言 | TypeScript 1579 `.ts` | TypeScript 4704 `.ts` + 611 `.tsx` | Rust 5143 `.rs` |
| 次语言 | Rust 14、C 5、`.mjs` 40 | Python 31、C 9、`.mjs` 149、CSS 215 | TypeScript 764、Python 196、Starlark 207、SQL 74、Shell 36 |
| 文档/数据 | Markdown 128、JSON 57、YAML 17 | Markdown 4104、YAML 1788、JSONL 528 | `.snap` 1483、JSON 370、TOML 183 |
| 运行时前提 | Node ≥ 22.19；可选 Bun | Node `^22.19 \|\| >=24` | 无（原生二进制）；npm 启动器需 Node ≥ 16 |

三家都有一个"不那么显眼的第三语言"：

- **pi 的第三语言是 Rust**——`packages/env/daemon` 是一个 Rust 程序；
- **dsh 的第三语言是 Markdown/YAML**——4104 篇 Markdown 与 1788 份 YAML，
  因为文档与配置本身就是它的产品面；
- **codex 的第三语言是 Starlark**——207 个 Bazel 文件（190 `.bazel` +
  17 `.bzl`）是一等公民，不是附属脚本。

## 3. 跨语言协作放在哪

三家都把跨语言协作**放在核心之外**：核心用一种语言写，跨语言部分做成
**独立进程 + 明确协议 + 预编译产物**。差别在于协议由谁定义。

**三家跨的是不同性质的边界**：

| 边界性质 | 解决什么问题 | pi | dsh | codex |
|---|---|---|---|---|
| 操作系统/内核 | 语言运行时够不到的核接口 | C（tui 剪贴板）、WASM（隔离执行） | C（Landlock 约束、flock 写锁） | — |
| 目标机缺运行时 | 让没有 Node 的机器也能跑 | Rust daemon（远端执行） | `pkg --sea` 单文件可执行（Python 侧免装 Node） | — |
| 分发形态 | npm 装不了原生二进制 | Bun `--compile` | 平台原生包 + `optionalDependencies` | JS 启动器 + 平台包 |
| 消费方语言 | 让用户用自己的语言驱动 | — | Python SDK | TypeScript / Python SDK |
| 构建 DSL | 可复现的跨平台构建 | — | — | Starlark（Bazel） |

下面按项目展开。

### 3.1 pi：Rust daemon / C 扩展 / WASM

| 边界 | 位置 | 机制 |
|---|---|---|
| TS ↔ Rust | `packages/env/daemon/`（Rust）+ `packages/env/src/`（TS 侧 `RemoteExecutionEnv`、`Connection`） | 远端执行 daemon：在远端机器上执行文件操作与命令，用 **stdin/stdout 上的帧协议**通信（`packages/env/docs/protocol.md`）。daemon 按平台预编译放进 `bin/`，**每次启动前按 SHA-256 校验**，经 SSH 部署。构建：`cargo build --manifest-path daemon/Cargo.toml --locked` |
| TS ↔ C | `packages/tui/native/{darwin,linux,win32}` | N-API 剪贴板/平台扩展（`napi.h`、`prebuilds/`），脚本 `build:native:{darwin,linux,win32}` |
| TS ↔ WASM | `quickjs-wasi`（codemode 沙箱）、`@silvia-odwyer/photon-node`（图片缩放） | `.wasm` 作为资产拷进 `dist/`（`copy-binary-assets`） |

pi 还有一条**同语言跨运行时**的边界：`build:binary` 用 `bun build --compile`
把 TypeScript 直接编成原生可执行文件。

### 3.2 dsh：C 原生原语 / Python SDK

| 边界 | 位置 | 机制 |
|---|---|---|
| TS ↔ C | `native/system/`（`@deepseek-ai/node-addon-system`）：`packages/entry/src/{main.c,flock.c}` | Linux **landlock-run 可执行** + POSIX flock 的 N-API 绑定。平台包 `{darwin,linux}-{arm64,x64}` 装预编译二进制，**consumer 永不编译原生代码**；入口包用 npm `optionalDependencies` 按 OS/CPU 分发 |
| TS ↔ Python | `packages/sdk/{protocol,server,client}` ↔ `python/sdk` | Python 侧用 `subprocess.Popen` 起 runtime，走 **stdio JSON-RPC 2.0**（`python/sdk/src/deepseek_harness/client.py`） |
| TS → Python 打包 | `python/sdk-runtime`（`deepseek-harness-runtime-bin`） | 用 `@yao-pkg/pkg --sea` 把 `dsh` CLI 与闭合的 Node 依赖树编成**原生可执行**，Python 侧无需系统 Node |

另有 `apps/desktop/installer/*.c`（Windows 安装器）与
`apps/desktop/cli/link-entry.c`；以及 `vendor/`——同语言但独立命名空间的
Cordis。

### 3.3 codex：Rust 核心 + TS/Python SDK

| 边界 | 位置 | 机制 |
|---|---|---|
| Rust ↔ TypeScript（启动器） | `codex-cli/bin/codex.js` | 纯 JS 启动器：platform+arch → target triple → 解析平台包 → `spawn` 原生二进制并转发信号。**JS 层不做任何编译** |
| Rust ↔ TypeScript（SDK） | `sdk/typescript`（`@openai/codex-sdk`） | spawn `codex` CLI，用 **stdin/stdout 交换 JSONL 事件** |
| Rust ↔ Python（SDK） | `sdk/python`（`openai-codex`）+ `sdk/python-runtime` | 走 **app-server** 协议；schema **由 Rust 单侧生成**（`just write-app-server-schema` → `app-server-protocol/scripts/write_schema_fixtures.py`，并派生 `sdk/python` 的 `generated/`）。runtime 包 wheel-only，发布时按平台暂存固定版本的 CLI 二进制 |
| Rust ↔ Starlark | `defs.bzl`、`rbe.bzl`、`bazel/platforms/release_binaries.bzl`、187 个 `BUILD.bazel` | 构建层的跨语言协作 |

另有 Rust ↔ SQL（`codex-rs/state/*_migrations/*.sql`：goals / logs / memory
迁移）与 Rust ↔ zsh（`codex-zsh` 独立发布物）。

**关键差异**：codex 的跨语言协议是 **schema-first 单侧生成**（Rust 定义、
向下游下发），pi 与 dsh 是**双端手写**。

## 4. 构建与编译命令：从命令看工具链与产出

三家都能用一条命令概括构建入口，但**命令背后调的编译器和最终产物完全不同**。
本节按"命令 → 工具链 → 产出"展开。

### 4.1 pi：npm scripts 编排，tsc 打底 → esbuild 收口

| 命令 | 工具链 | 产出 |
|---|---|---|
| `npm run build`（根） | 依次 `cd` 进 chord → tui → telemetry → codemode → mcp → ai → durable → env → agent → protocol → client → server → coding-agent，各跑一次 `npm run build` | 13 个包的 `dist/` |
| 每个包的 `npm run build` | `tsc -p tsconfig.build.json` | `dist/*.js` + `dist/*.d.ts` |
| coding-agent 的第二步 `scripts/build-coding-agent-bundle.mjs` | **esbuild** | `dist/bundle/cli.js`——就是 `pi` 命令的 `bin` |
| `npm run build:binary`（coding-agent） | `tsc` + `bun build --compile` | `dist/pi` 单文件原生可执行 |
| `npm run build:daemon`（env 包） | **cargo** | `packages/env/daemon/` 的 Rust daemon |
| `npm run build:native:{darwin,linux,win32}`（tui 包） | 平台原生构建脚本 | N-API 扩展与 prebuilds |
| `npm run build:offline`（根） | 同上，但 ai 包走 `build:offline` | 离线可复现的构建（供 Nix 用） |
| `npm run check` | biome + 自研检查脚本 | 门禁结果（含 `check:entry-graphs`） |
| `npm run publish` | 逐包 `npm pack --dry-run` 校验后再发布 | 14 个 npm 包 |

**从命令读出的三件事**：

1. **根构建是"串行编排"，不是并行图**——`npm run build` 用 `cd` 硬编码了
   13 个包的顺序，顺序即依赖顺序；
2. **esbuild 只用在最外层的 CLI**：内层包仍由 tsc 产出可被消费的 ESM + 声明，
   只有 `coding-agent` 需要"单文件可执行"这个形态。它的
   `allowedExternalPackages` 白名单（`@earendil-works/chord`、
   `@silvia-odwyer/photon-node`、`jiti`、`bufferutil`、`kerberos`……）
   说明 esbuild 只打包纯 JS，原生与可选依赖一律留成 external；
3. **`check:entry-graphs` 把"入口点是成本契约"变成编译期门禁**：它遍历每个包
   `exports` 声明的入口点，沿 value-import 图（`import type` 不算）计算被拉起
   的模块量并设预算，超预算就红。

### 4.2 dsh：一条 `pnpm run build` 选构建面，tsc 出声明、tsdown 出运行时代码

| 命令 | 工具链 | 产出 |
|---|---|---|
| `pnpm run build` | `tsx scripts/build.ts`，按 `--profile` / `DSH_BUILD_CLIENT_PROFILE` 选 **Host / Client 构建面** | 见下两行 |
| `pnpm run build:lib:host` | `tsc -b tsconfig.host.json` → `tsdown --config-loader native --env.DSH_BUILD_FACE host` → desktop 的 `bundle` | 各包 `lib/types/*.js` + `.d.ts`，再打成 `lib/*.js` |
| `pnpm run build:native-system` | `tsx native/system/scripts/build.ts --host-addon-only`（编译 C） | 平台原生包二进制 |
| `pnpm run build:web` | `pnpm --filter @deepseek-ai/dsh-web-frontend run build`（**Vite**） | `apps/web/dist/`（`index.html`、`assets/`、`manifest.webmanifest`） |
| `pnpm run build:desktop` | desktop 包的 `tsc -b` + `tsdown` | `apps/desktop/lib/` |
| `pnpm run package:desktop:mac:arm64` | **electron-builder** | macOS 安装包（另有 win x64 等 target） |
| `tsx scripts/build-exe-for-python-sdk.ts` | **`@yao-pkg/pkg --sea`** | `dist-exe/` 下的单文件可执行 |
| `pnpm dsh --profile headless "…"` | `node --import tsx/esm apps/cli/src/bin.ts` | 源码直跑，不产出构建物 |

**从命令读出的三件事**：

1. **两段式编译**：`tsc` 只负责类型与声明（`lib/types/*.js` + `.d.ts`），
   运行时代码由 **tsdown** 再打一遍到 `lib/*.js`（`dts: false`，声明只由 tsc
   产出）。全仓共 **130 个 `tsdown.config.ts`**，每包一份；
2. **构建面是一等参数**：`--profile` / `DSH_BUILD_CLIENT_PROFILE` 决定这次构建
   是 Host 还是 Client，并把结果写进客户端构建记录，绑定到公开环境；
3. **门禁也是命令**：`pnpm run typecheck`、`lint`、`test`、`test:coverage`、
   `doc-sync`、`hygiene`、`duplication` 是并列的顶层入口，
   `tsx scripts/run-gates.ts` 是它们的共同后端。

tsdown 的配置加载依赖 Node 的类型擦除（`--config-loader native`），所以
`scripts/build.ts` 在开跑前先检查 `process.features.typescript`，给出可读报错，
而不是让 tsdown 抛原始错误。

### 4.3 codex：Cargo 与 Bazel 双轨，justfile 做统一入口

| 命令 | 工具链 | 产出 |
|---|---|---|
| `just codex …` | `cargo run --bin codex -- …` | 从 `codex-rs/target/debug/` 直接运行 |
| `just build-for-release` | `bazel build //codex-rs/cli:release_binaries` | `bazel-bin/` 下的多平台 release 二进制 |
| `just bazel-test` / `just bazel-clippy` | Bazel（clippy 走 `--config=clippy`） | 测试与检查结果 |
| `just test` | `cargo nextest run --no-fail-fast` | 测试结果（`RUST_MIN_STACK=8 MiB`） |
| `just clippy` / `just fmt` / `just fmt-check` | cargo clippy / `scripts/format.py` | 检查与格式化 |
| `just write-config-schema` | `cargo run -p codex-config-schema` | `config.toml` 的 JSON schema |
| `just write-app-server-schema` | `python3 app-server-protocol/scripts/write_schema_fixtures.py` | 协议 fixtures + 派生的 Python SDK |
| `just write-hooks-schema` | `cargo run -p codex-hooks` | hooks schema fixtures |
| `just assemble-codex-package` | `scripts/build_codex_package.py` | 本地组装的 Codex 包 |

发布工作流里的产物形态：`codex-rs/target/<target-triple>/release/codex-<target-triple>`
（原生二进制）、`codex-<target>.dmg`（macOS）、`codex-package-<target>.tar.gz`
或 `.tar.zst`（通用归档）。

**从命令读出的四件事**：

1. **Cargo 是源，Bazel 是产物层**：`justfile` 开头就把工作目录固定到
   `codex-rs`；日常开发用 cargo（`just codex`、`just test`、`just clippy`），
   发布与跨平台才切到 Bazel（`just build-for-release`）；
2. **Bazel 复用 Cargo 的真相**：`rules_rs` 从 `Cargo.toml` / `Cargo.lock`
   导入第三方 crate 到 `@crates`，两套构建不会各自维护一份依赖表；
3. **schema 是"编译前置产物"**：三条 `write-*-schema` 命令把 Rust 类型反向导出
   成 JSON schema、协议 fixtures 与 Python SDK——**跨语言契约由构建命令生成**；
4. **工具链被锁死**：`rust-toolchain.toml` 固定 1.95.0（含 clippy / rustfmt /
   rust-src），另有 `deny.toml`、`clippy.toml`、`rustfmt.toml`；
   `codex-rs/features` 把特性开关集中注册，`Stage` 分
   `UnderDevelopment` / `Experimental` / `Stable` / `Deprecated`。

### 4.4 三条命令链的对照

| | pi | dsh | codex |
|---|---|---|---|
| 统一入口 | `npm run build` | `pnpm run build` | `just` + `cargo` / `bazel` |
| 编排者 | npm workspaces | `tsx scripts/build.ts` | justfile |
| 类型/声明 | `tsc` | `tsc -b` | Rust 编译器 |
| 打包器 | esbuild（仅 CLI） | tsdown（每包） | Bazel |
| 前端 | — | Vite | — |
| 单文件可执行 | Bun `--compile` | `pkg --sea` | 原生编译（不需要打包器） |
| 中间产物 | `dist/` | `lib/types/` → `lib/` | `target/` |
| 最终产物 | `dist/bundle/cli.js`、`dist/pi` | `lib/`、`apps/web/dist/`、安装包、`dist-exe/` | `bazel-bin/` 下的多平台二进制 |

## 5. 打包与分发

| | pi | dsh | codex |
|---|---|---|---|
| 主渠道 | npm（14 个包，版本 1.0.3） | npm（`@deepseek-ai/dsh-*`） | npm（`@openai/codex` + 6 个平台包） |
| 二进制/安装包 | `dist/pi`（Bun compile）+ 平台安装器 | Electron 安装包（mac arm64/x64、win x64） | 每个 target triple 的原生二进制 |
| 其他渠道 | Nix flake（4 个 system，离线）、Docker / Sandboxes / OpenShell / Gondolin | Python wheel（内含 SEA 单文件）、npm 原生平台包 | Cloudflare R2、Homebrew cask、Python / TypeScript SDK |
| 发布校验 | `publish.mjs` 逐包 `npm pack --dry-run` 校验后再发布 | `release:{bump,verify,pack}` + `verify-npm-install-layout` | tag 必须等于 `Cargo.toml` 的 version |

**值得单独记的四个设计**：

1. **codex 的平台包转发**：`@openai/codex` 只是 JS 启动器，真身在
   `@openai/codex-{linux,darwin,win32}-{x64,arm64}`；启动器找
   `vendor/<target-triple>/bin/codex`，找不到就报错并给出重装命令。
   macOS 发布走受保护的 `codesigning` 环境 + Azure Key Vault 签名/公证，
   并用 `CARGO_PROFILE_RELEASE_SPLIT_DEBUGINFO=packed` 先归档 dSYM 再 strip。
2. **dsh 的 profile / bundle 层叠**：bundle 包声明 `dsh.bundle.patch`，启动器
   把多层 patch 叠成命名 profile（`base` → `web` / `headless` / `acp` /
   `sdk-app`；`sdk-minimal` 自带完整树）；用户的 `cordis.patch.yml` 与
   `--patch` 覆盖层再叠上去，**按行 id last-write-wins**，且 patch 会整体替换
   该行的 `config`。之上还有 preset（`web-app` 带 standard / minimal / ptc 三份）。
3. **dsh 的原生分发**：入口包用 `optionalDependencies` 按 OS/CPU 选平台包，
   consumer 永不编译原生代码；有独立的 `Node Addon System` 与
   `Node Addon System Release` 工作流。
4. **pi 的离线可复现**：Nix 从源码构建且离线，模型目录由
   `nix/model-catalog.json` 固定，运行时再叠加 pi.dev 的新目录。

## 6. 一页总结

| 维度 | pi | dsh | codex |
|---|---|---|---|
| 组织哲学 | 少而平，可读优先 | 目录即架构，一切皆插件 | 多而平，靠依赖图分层 |
| 构建入口 | `npm run build` | `pnpm run build` | `just` + `cargo` / `bazel` |
| 编译 | tsc → esbuild 单文件（可选 Bun 原生） | tsc 声明 → tsdown ESM（+ Vite / pkg SEA） | Cargo → Bazel hermetic / 远程 |
| 跨语言 | Rust daemon / C 扩展 / WASM | C 原生原语 / Python SDK | Rust 核心 + TS/Python SDK（schema 单侧生成） |
| 打包 | npm + Nix + 容器 | npm + Electron + wheel | npm 平台包 + R2 + Homebrew |

一句话：**pi 用"打包器收口"降低运行时复杂度；dsh 用"patch 层叠"把分发变成
配置问题；codex 用"Bazel + 平台包"把编译和分发都变成可复现的工程问题。**
