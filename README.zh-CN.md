# codex-auto 是什么？

`codex-auto` 是 `codex` CLI 的包装器，会在当前账号的 token 额度耗尽时自动切换账号。你可以根据需要购买多个账号，让工作持续进行。凭据仅保存在你的本地机器上。

[English](./README.md) | 中文

## 前置要求

- 推荐 Node.js 20+。本包声明支持 Node.js 18+，但其 Commander 14 依赖要求 Node.js 20+。
- macOS 或 Linux 终端环境；Windows 用户请在 WSL 中运行，而不是原生 `cmd.exe` 或 PowerShell。
- 已安装可执行的 `codex` CLI。
- `codex login` 和 `codex resume` 能正常工作。

## 安装

通过 npm 全局安装：

```bash
npm install -g codex-auto
```

验证安装：

```bash
codex-auto --help
codex-auto --version
```

升级到最新版本：

```bash
npm install -g codex-auto@latest
```

卸载：

```bash
npm uninstall -g codex-auto
```

要从源码运行你的 fork，请参阅[构建并运行当前检出版本](#构建并运行当前检出版本)。

## 快速开始

直接启动受管会话：

```bash
codex-auto
```

首次运行时，如果源 `CODEX_HOME` 已有可用登录态，`codex-auto` 会自动将其导入为 `default` 账号。

添加更多账号：

```bash
codex-auto add a
codex-auto add b
```

查看账号列表：

```bash
codex-auto list
```

`codex-auto list` 用 `*` 标记当前账号。如果某个账号仍在等待额度恢复，列表会在该账号旁显示 Codex 提供的重试时间。

启动受管会话：

```bash
codex-auto
```

从指定账号启动：

```bash
codex-auto --account b
```

保存后续运行的默认起始账号：

```bash
codex-auto use b
```

将账号激活给原生 `codex` CLI 使用：

```bash
codex-auto activate b
```

`codex-auto activate <name>` 将该账号的 `auth.json` 写入源 `CODEX_HOME`，之后直接运行 `codex` 也会使用同一账号。不带账号名的 `codex-auto activate` 会重新同步列表中以 `*` 标记的账号。

使用自定义源 `CODEX_HOME` 启动：

```bash
codex-auto --codex-home /path/to/.codex
```

删除账号：

```bash
codex-auto remove b
```

查看已安装版本：

```bash
codex-auto --version
codex-auto version
```

源码构建会在版本输出中包含 Git 提交标识，例如 `0.3.0+git.abcdef123456`。`.dirty` 后缀表示构建时已跟踪的文件存在未提交更改。提交标识保存在安装快照中，因此离开源码目录后仍能识别该构建。没有 Git 元数据的构建显示基础包版本。

在交互式终端中，`codex-auto` 会定期检查 npm 上是否有新版本。发现新版本时，会提示立即更新、跳过该版本或稍后提醒。设置 `CODEX_AUTO_UPDATE_CHECK=0` 可关闭检查。

## 适用场景

- 你有多个可用的 Codex 账号。
- 不想手动编辑 `auth.json` 或 `config.toml`。
- 希望额度耗尽后自动切换账号并恢复会话。
- 希望保留原有 Codex 会话、插件和 MCP 配置。

## 功能

- 管理多套账号配置。
- 添加新账号时自动运行 `codex login`。
- 首次运行时从现有 Codex 配置导入 `default` 账号。
- 导入已有的 `auth.json` 和 `config.toml` 文件。
- 即使源 `CODEX_HOME` 尚未初始化，也能启动受管运行。
- 启动受管 `codex` 会话。
- 保持日常终端中的交互体验，并在自动切号或强制停止后恢复正常的 shell 输入。
- 保存后续运行的默认起始账号。
- 仅写入账号的 `auth.json`，将受管账号激活给原生 `codex` CLI 使用。
- 在交互式终端中提示更新，并提供立即更新、跳过和稍后提醒选项。
- 触发额度限制时自动切换到下一个账号。
- 识别当前 Codex 的额度提示，包括带重试时间的升级或购买提示。
- 显示仍在等待额度恢复的账号及其重试时间。
- 在同项目或跨项目并发运行时，为每个活跃受管会话绑定独立恢复目标。
- 只恢复当前运行已绑定的会话 ID，不根据最新会话猜测目标。
- 在放弃自动恢复前，给新运行一个短暂窗口来捕获自己的恢复目标。
- 在交互式额度提示阶段按 `Ctrl-C` 时干净退出，不强行进入账号耗尽处理流程。
- 无法确认原会话或其会话 ID 已失效时停止自动恢复。
- 自动恢复时，先通过受支持的 Codex 目标 API 恢复因额度中断的 `/goal` 执行，再发送 `Continue`。
- 记录本地会话事件和恢复状态。
- 透传所有 `codex` 参数和子命令，如 `exec`、`review`、`--model`、`--full-auto`。

## 透传 Codex 参数

除 `codex-auto` 自身命令（`activate`、`add`、`remove`、`list`、`use`、`version`）外，其余参数会直接转发给 `codex`：

```bash
# 传入提示词
codex-auto "fix the login bug"

# 指定模型
codex-auto --model o3 "refactor the auth module"

# 非交互式 exec 模式
codex-auto exec "add unit tests"

# 指定账号并使用 full-auto
codex-auto --account b --full-auto "migrate to TypeScript"

# 代码审查
codex-auto review
```

所有透传调用都保留多账号轮转能力：当前账号触发额度限制时，`codex-auto` 会自动切换到下一个账号并恢复会话。

`--account <name>` 仅覆盖本次运行的选择。`codex-auto use <name>` 会修改后续运行的默认起始账号。

## 导入已有配置

如果已有账号凭据，可以直接导入：

```bash
codex-auto add work --auth /path/to/auth.json --config /path/to/config.toml
```

规则：

- `--auth` 导入账号凭据。
- `--config` 导入账号配置。
- 未提供 `--auth` 时，会自动运行 `codex login`。
- `config.toml` 会确保包含 `cli_auth_credentials_store = "file"`。

## 工作方式

`codex-auto` 包装本机已安装的 `codex` CLI。对话、模型请求、工具和向所配置提供商的认证仍由 Codex 处理。包装器管理本地账号凭据，启动并监控 Codex 进程，从终端输出中检测额度错误，并在需要时使用其他账号重新启动同一会话。

### 共享配置，独立凭据

每次受管运行都会在 `~/.codex-auto/instances/<id>/` 下获得一个临时 Codex home。包装器启动 Codex 时将 `CODEX_HOME` 指向该目录，并将所选账号的 `auth.json` 实际副本放入其中。账号导入和切换均为本地文件操作；包装器不会上传凭据。启动后的 Codex 进程使用这些凭据完成正常的提供商认证。

其余配置来自现有 Codex home，通常是 `~/.codex`，也可以是通过 `CODEX_HOME` 指定的源目录。因此切换账号可以复用配置、MCP 设置、插件和已保存的会话，而不必为每个账号单独安装并维护对话历史。

`codex-auto` 维护自己的数据目录，默认位置为：

```bash
~/.codex-auto
```

目录结构：

```text
~/.codex/                  # 源 Codex home；activate 会替换 auth.json
├── auth.json
├── config.toml
├── sessions/
└── ...

~/.codex-auto/
├── accounts/
│   ├── a/
│   │   ├── auth.json
│   │   ├── config.toml
│   │   └── meta.json
│   └── b/
├── instances/
│   └── <timestamp-pid-uuid>/
│       ├── auth.json
│       ├── config.toml -> ~/.codex/config.toml
│       ├── session_index.jsonl -> ~/.codex/session_index.jsonl
│       ├── sessions -> ~/.codex/sessions
│       └── ...
├── logs/
├── runs/
│   └── <run-id>.json
└── state.json
```

- `accounts/<name>/`：各账号的凭据和配置。
- `instances/<id>/`：每次运行使用的覆盖目录，作为 `CODEX_HOME`，并在本次运行切换账号时持续复用。
- `runs/<run-id>.json`：当前受管进程的状态、已绑定会话 ID 和恢复状态。
- `state.json`：账号顺序、当前索引、默认起始账号、上次成功账号以及最近成功绑定的会话 ID。
- `logs/`：本地会话事件日志。

### 为什么使用符号链接？

包装器为源 Codex home 中的**每个已有顶层条目**创建符号链接，但有两个例外：`auth.json` 从所选账号复制，`models_cache.json` 则交给 Codex 为本次运行重新创建。创建链接前，还会确保 `sessions/`、`history.jsonl` 和 `session_index.jsonl` 已存在。

它不会遍历每个子目录并逐个创建链接。一个 `sessions -> ~/.codex/sessions` 链接就能访问整个目录树，避免复制可能很大的历史记录，并让受管运行与原生 Codex 使用相同的已保存会话。在源 home 中后来创建的顶层条目不会自动链接到已经运行的实例。

**这些链接共享的是实时数据，不是备份，也不是沙箱。** 通过链接目录写入会改变原始文件，使用同一源 home 的账号会共享配置和对话历史。如果某个程序通过原子重命名替换链接文件，则可能创建仅属于本次运行的文件；模型缓存因此被排除。受管运行使用源 `config.toml`，而不是保存的各账号配置。如果需要独立的历史或配置，请使用不同的源 home；包装器不强制实施账号隔离。

### 账号触发额度限制后会怎样？

包装器保留同一临时 home，仅替换其中的本地 `auth.json`，并为本次运行绑定的会话启动 `codex resume --no-daemon --no-alt-screen <session-id> Continue`。受管运行结束时会删除临时 home，源 home 中的共享文件则保留。正常受管运行不会替换源 home 的 `auth.json`。

`codex-auto activate <name>` 是显式将账号的 `auth.json` 写回源 `CODEX_HOME` 的命令，供原生 `codex` 使用。它不会复制账号的 `config.toml`。

交互式会话保持标准 Codex 终端体验，包括全屏和分屏工作流程；同时 `codex-auto` 在后台自动切换账号并恢复会话，在强制停止或额度触发切号后将控制权交还给输入状态正常的 shell。

### 每次运行使用新的本地服务器

包装器在交互式启动和自动恢复时强制添加 `--no-daemon`，重复参数只保留一次。无需手动指定。已运行的共享服务器不会自动读取外部替换的凭据，因此切号时必须启动新的服务器。Codex 必须支持此参数；不支持时会失败，不会退回共享服务器。

`--remote`（包括 `--remote=...`）、`--remote-auth-token-env` 和服务器命令（`agents`、`app-server`、`remote-control`） 与此模式不兼容，会在导入账号或启动前被拒绝。需要连接其他服务器或查看共享代理时，请直接使用 `codex`。`exec` 等非交互式命令保留原有参数。

### 在普通终端缓冲区中显示

`--no-alt-screen` 让 Codex 在普通终端缓冲区中绘制界面，而不是使用单独的全屏缓冲区。这会保留滚动历史，让你退出后仍能向上查看输出。它只改变显示行为，不影响凭据、守护进程使用、审批或沙箱策略。参阅 [Codex CLI 参考](https://developers.openai.com/codex/cli/reference)。

包装器默认在交互式启动和自动恢复时添加此参数。在恢复过程中，Codex 退出并重新启动时，普通缓冲区会将输出保留在滚动历史中。仓库也记录了终端重绘和分屏兼容性问题，但这些记录不能确定原作者选择此参数的确切原因。切换凭据并不需要此参数。

## 账号切换与会话恢复

包装器识别到额度错误时会触发切换。仅提示接近额度限制的警告不会触发切号。

触发额度限制后：

1. 记录当前账号的额度错误；若 Codex 提供重试时间，也一并记录。
2. 按当前本地账号顺序重新检查资格，并切换到下一个符合条件的账号。
3. 将当前运行覆盖目录中的 `auth.json` 替换为下一账号的凭据。
4. 仅恢复当前受管运行已经绑定的会话 ID。
5. 执行：

```bash
codex resume --no-daemon --no-alt-screen <session-id> Continue
```

记录的重试时间到达后，先前的账号会重新获得切换资格，即使受管运行已经持续很久。新的额度错误会替换该账号此前的重置依据。若重试时间缺失、无效或在错误发生时已过期，该账号在本次运行的剩余时间内仍会被排除，以免立即陷入重试循环。Codex 未提供时区时，重试时间按本地时区解析。切换资格不等于实时额度检查：包装器不会查询提供商的剩余额度百分比，也不保证符合条件的账号仍有可用额度。

恢复会保留显式指定的审批、沙箱、配置、配置档、模型和提供商设置。例如，使用以下命令启动时：

```sh
codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

额度触发切号后，`--no-daemon` 仍然生效：Codex 不使用共享后台服务器运行。审批和沙箱设置也会保留。原始提示词、图片附件和会话选择器的选择参数不会重放；恢复使用本次运行已绑定的会话 ID。这可以避免切号悄然改变启动策略，但不能据此确认外部 Codex 中所有过期额度或账号状态问题都已解决。

如果新运行已经触发额度处理，但其恢复目标尚未及时出现，`codex-auto` 会给本次运行一个短暂窗口来捕获自己的会话 ID，再报告恢复失败。如果仍无法安全捕获本次运行的会话 ID，或已绑定的 ID 不再可用，则停止自动恢复并报告失败，不会退回 `codex resume --last`。

如果屏幕上已经出现交互式额度提示，此时按 `Ctrl-C`，`codex-auto` 会将其视为用户取消本次运行。它会恢复终端状态并干净退出，不继续自动处理账号耗尽。

为避免旧终端记录干扰，启动或恢复到达最新的当前提示符后，额度检测只查看该提示符之后的新输出。

并发运行行为：

- 同项目下，不同终端中的多个 `codex-auto` 会话各自维护独立恢复绑定。
- 不同项目下，不同终端中的多个 `codex-auto` 会话也独立恢复。
- 恢复决策始终针对当前活跃受管进程，而不是项目级或全局的最新会话。

### 从不可用账号恢复

如果 Codex 的 `account/read` 启动错误报告工作区路由认证失败（401），包装器会在本次受管运行中排除该账号，并使用另一个符合条件的账号恢复同一已绑定会话。这不是额度错误。恢复不会登录或刷新凭据。如果没有符合条件的账号，或无法安全确认会话，包装器会停止。其他错误不会触发此重试；失败的启动不会被记录为成功。诊断信息通过 `authorization_switch` 和 `authorization_failed` 资格状态将认证失败与额度记录分开。

### 切换账号后继续执行 `/goal`

额度触发切号后，只有当 Codex 将已绑定会话的目标报告为 `usageLimited` 时，恢复流程才将该目标重新设为活跃。目标内容、token 预算和用量计数保持不变。已经活跃、手动暂停、受阻、完成或预算耗尽的目标不会被修改。

此功能需要原生 `thread/goal/get` 和 `thread/goal/set` 支持，已使用 Codex 0.161.0 和 0.162.1 验证。中断进程退出后，恢复流程使用独立的本地 Codex 服务器更新已保存的目标状态。它不会连接共享后台服务器、加载会话或启动工具，并在恢复后的会话启动前关闭。凭据仍保留在现有的本地账号覆盖目录中。恢复后的 Codex 进程负责正常的提供商认证和自主执行。

如果 API 不可用，包装器会警告此次仅恢复会话；需要时请手动使用 `/goal resume`。使用 `-p` / `--profile` 启动时也采用这一回退方式，因为 Codex 的 app-server 命令行不支持 TUI 的配置档选择参数；恢复流程不会擅自换用其他配置。如果 Codex 报告目标因额度受限，但无法验证恢复结果，恢复流程会停止，不会悄然在没有目标执行的情况下继续。诊断信息记录脱敏的 `goal_recovery` 结果，不记录目标内容或原始 API 错误。

恢复期间，每个会话应只有一个控制端。原生 API 不支持条件式状态更新，因此不支持其他客户端同时修改该目标。不同会话仍相互独立。

使用配置档案时的自动目标恢复暂缓支持。当前辅助服务器是短时运行的状态桥接，不是 TUI 的执行后端，也不是共享守护进程。拟议的隔离服务器研究及其额度错误、生命周期验收条件见[架构与未来方向](docs/architecture.md)。

## 环境变量

- `CODEX_AUTO_HOME`
  `codex-auto` 数据目录。默认：`~/.codex-auto`。

- `CODEX_HOME`
  作为覆盖目录基底的源 Codex home。默认：`~/.codex`。

- `CODEX_AUTO_CODEX_BIN`
  `codex` 可执行文件路径。默认：`codex`。

- `CODEX_AUTO_UPDATE_CHECK`
  设置为 `0` 可关闭交互式更新提示。

- `CODEX_AUTO_DEBUG`
  设为 `1` 可在 stderr 中实时显示脱敏的启动和恢复信息。自动事故采集始终启用。

- `CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS`
  生成报告的保留天数。默认 `30`；例如 `7` 表示未保留的报告最多保存一周。

示例：

```bash
CODEX_AUTO_HOME=/tmp/codex-auto \
CODEX_HOME=/Users/me/.codex \
CODEX_AUTO_CODEX_BIN=/opt/homebrew/bin/codex \
codex-auto --account a
```

## 命令参考

```bash
# 账号管理（codex-auto 自身命令）
codex-auto add <name>
codex-auto add <name> --auth /path/to/auth.json --config /path/to/config.toml
codex-auto list
codex-auto use <name>
codex-auto activate [name]
codex-auto remove <name>
codex-auto version
codex-auto --version
codex-auto diagnostics

# 受管会话（默认）
codex-auto
codex-auto --account <name>
codex-auto --codex-home /path/to/.codex

# 透传给 codex（所有其他参数）
codex-auto [any codex arguments...]
codex-auto --account <name> [any codex arguments...]
codex-auto --codex-home /path/to/.codex [any codex arguments...]
```

## 开发

### 构建并运行当前检出版本

使用 Node.js 20+，在你的 fork 目录中运行：

```sh
npm ci
npm run build
env CODEX_AUTO_UPDATE_CHECK=0 node ./dist/index.js --help
```

`npm ci` 安装 `package-lock.json` 中锁定的依赖，仍会从 npm 下载依赖。通过 `node ./dist/index.js` 运行的 CLI 来自**当前检出版本**，不受全局安装的 `codex-auto` 影响。安装会执行项目的构建钩子和依赖的初始化钩子，包括 `node-pty` 的内置二进制检查或原生编译回退。要在不执行生命周期钩子的情况下安装，可先运行 `npm ci --ignore-scripts`，再显式构建；交互式使用前，原生依赖可能仍需要执行经过审查的初始化步骤。

在希望 Codex 操作的项目目录中启动本地构建：

```sh
cd /path/to/project
env CODEX_AUTO_UPDATE_CHECK=0 node /path/to/your/fork/dist/index.js
```

工作目录决定 Codex 打开的项目。这些示例适用于 bash 和 fish。关闭更新检查可避免开发运行提示用上游 npm 发行版替换你的 fork。除非显式覆盖，否则运行仍使用已配置的账号和源 Codex home。

### 提交前测试改动

修改 `src/` 后，重新构建并启动 CLI：

```sh
npm run build
npm test
env CODEX_AUTO_UPDATE_CHECK=0 node ./dist/index.js --help
```

调试特定区域时，可以运行针对性测试：

```sh
npm test -- tests/session/session.test.ts
```

需要 JavaScript 调试器时，用 `node --inspect-brk ./dist/index.js` 启动构建后的入口，并像上面一样通过 `env CODEX_AUTO_UPDATE_CHECK=0` 关闭更新检查。调试器会在启动前暂停，方便连接支持 Node 的调试器。当前构建不生成源码映射，因此单步调试使用 `dist/` 中的编译文件。

影响交互行为的改动还必须按[真实终端回归清单](./docs/testing/real-terminal-regression.md)，在真实终端中使用刚构建的入口验证。仅自动化测试无法验证终端行为。暂存提交时，请将问题修复及其针对性测试与无关的工作区改动分开。

### 将本地构建用作命令

可选：在 fork 目录中运行：

```sh
npm link --ignore-scripts
command -v codex-auto
realpath (command -v codex-auto)
```

最后一条命令使用 fish 语法；bash 中请用 `realpath "$(command -v codex-auto)"`。解析后的路径应指向当前检出版本的 `dist/index.js`。`npm link` 将全局命令链接到本地检出目录（[npm link 参考](https://docs.npmjs.com/cli/v11/commands/npm-link/)），可能替换该 npm 前缀下的已有命令。修改源码后重新构建即可；链接仍有效，构建也会确保 CLI 入口文件具有执行权限。如果 `PATH` 中其他安装的位置更靠前，请使用显式的 `node /path/to/your/fork/dist/index.js` 命令。

### 将此分支安装为系统命令

在分支目录中运行：

```sh
npm run install:local
command -v codex-auto
codex-auto --version
```

这会构建当前检出版本，并将其快照安装到配置的 npm 全局前缀中。安装使用本地包，而不是已经发布的 `codex-auto` 版本。依赖仍从配置的 npm 注册表下载。安装会禁用生命周期脚本；如果平台没有合适的内置二进制文件，原生依赖可能需要执行经过审查的配置步骤。

修改源码后，再运行 `npm run install:local` 更新已安装的命令。仅运行 `npm run build` 只会更新检出目录，已安装的快照保持不变。`npm link` 是可选的实时开发链接方式。

使用所选 Codex 设置启动已安装的分支：

```sh
codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

运行分支时，可用 `env CODEX_AUTO_UPDATE_CHECK=0 codex-auto ...` 禁用上游更新提示。安装命令使用 [npm 的 `--install-links` 选项](https://docs.npmjs.com/cli/v11/commands/npm-install/)，安装副本而不是指向检出目录的链接。

## 自动诊断

包装器从每次运行开始就记录启动和恢复上下文。额度触发切号、所有账号耗尽、恢复失败或异常退出时，会自动保存经过脱敏的报告并显示保存位置，无需启用调试参数或在事故后执行命令。

报告保存在 `~/.codex-auto/diagnostics/`（或 `<CODEX_AUTO_HOME>/diagnostics/`）。内容包括包装器及构建标识、近期事件、会话绑定状态和显式启动策略摘要。每次切号及因无符合条件的账号而停止时，快照还会记录参与选择的账号列表、最近一次额度错误和重试时间戳，以及资格原因（`untried`、`cooldown`、`reset_elapsed`、`reset_unknown` 或 `reset_unusable`）。快照明确标注 `liveQuotaRefreshed: false`：这些是本地观察记录，不是提供商的实时用量。导出的快照最多包含 64 个账号，并标注是否被截断。账号和运行标识会匿名化。报告不包含凭据、配置内容、环境变量值、提示词、终端记录、工作区路径或原始会话 ID，也不会采集外部 Codex 守护进程的内部状态或网络流量。

报告问题时，可附上自动生成的 `incident-*.json` 文件。也可导出当前脱敏上下文：

```sh
codex-auto diagnostics > codex-auto-diagnostics.json
```

默认在 30 天后清理报告。如需保留 7 天，在启动包装器时设置以下环境变量：

```sh
env CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS=7 codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

调查期间保留最新报告，完成后解除保留：

```sh
codex-auto diagnostics --keep latest
codex-auto diagnostics --release latest
```

可使用报告文件名代替 `latest`。被保留的报告不会因时间或数量限制被清理。清理在会话启动和采集诊断时执行，不使用后台服务。未保留的报告数量还限制为 20 份。保留策略仅针对生成的报告，不清理底层事件日志或运行记录。

如需在 stderr 中实时查看脱敏的启动和切号信息，请在启动前启用可选调试输出：

```sh
env CODEX_AUTO_DEBUG=1 codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

强制终止或断电无法触发最终报告，但已经记录的事件仍可供手动导出。自动采集会尽力完成；即使无法写入报告，也不会阻止账号恢复。

## 故障排查

- **尚未配置账号：**运行 `codex-auto add <name>` 并完成登录，然后再次启动 `codex-auto`。
- **找不到 Codex 可执行文件：**确保 `codex` 在 `PATH` 中，或将 `CODEX_AUTO_CODEX_BIN` 设置为其可执行文件路径。
- **恢复时无法确认会话：**使用 Codex 的会话选择器选择目标会话。无法安全识别会话时，自动恢复会停止。
- **额度错误停留在屏幕上却没有切号：**对于已绑定会话 ID 的交互运行，即使提示符重绘使屏幕文本检测忽略了错误，Codex 新写入的结构化 `usage_limit_exceeded` 事件仍会触发切号。已有记录和其他会话不会触发这条事件检测路径。不提供该事件的 Codex 版本、尚未绑定的会话及 direct 传输模式仍不具备这项保护。更新或重新安装不会更新正在运行的包装进程；请在方便时退出并使用新构建恢复会话。
- **没有符合条件的账号：**检查事故报告中的选择快照，并查看 `codex-auto list` 中记录的重试时间。在 Codex 中确认账号身份和当前可用额度；这一停止状态并不能证明所有提供商账号都没有额度。重试时间已到且有效的账号可在同一次运行中再次被选中。缺少可用重置依据的账号需要启动新的受管运行才能重试。交互启动时，如果尚未识别到提示符，会等待五秒供历史记录回放完成后再处理额度错误；最新提示符之前的旧错误消息不会将恢复后的账号标记为额度耗尽。如果回放耗时超过五秒，这项基于时间的保护措施仍可能误判。

## 已知限制

- 已绑定的交互会话能够识别新的结构化额度错误；其他检测路径仍依赖已知终端消息，并存在历史回放误判风险。
- 如果底层 `codex` 会话 ID 丢失，`codex-auto` 会停止自动恢复，不会退回 `resume --last`。
- 账号轮转使用本地账号顺序和观察到的重试时间，不包含权重、优先级、实时用量刷新或提供商账号身份验证。

## 参考

- [真实终端回归清单](./docs/testing/real-terminal-regression.md)
- [安全审查与凭据流向](./docs/security-review.md)
- [更新日志](./CHANGELOG.md)

## 后续方向

共享守护进程和 ChatGPT 桌面应用兼容性暂不支持。未来可研究包装器独立管理的服务器，或通过本地 app-server API 更新配置与登录状态。独立服务器需要独立的凭据存储及明确的会话历史共享规则；不同连接地址本身不能实现隔离。

实施前需验证已保存 ChatGPT 账号能否无须重新浏览器登录便激活、凭据刷新、处理中请求、跨服务器恢复，以及对其他客户端的影响。当前包装器只切换自己启动的 Codex 会话，不管理桌面应用登录。参阅 [OpenAI 关于凭据更新的说明](https://github.com/openai/codex/issues/49651#issuecomment-5966427084)。

## 许可证

MIT
