# codex-auto

[English](./README.md) | 中文

`codex-auto` 是 `codex` CLI 的多账号切换器。

它将账号凭据保存在 `~/.codex-auto/accounts/`，基于现有配置启动受管 Codex 会话，并在当前账号触发额度限制时自动切换到下一个账号。

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
- 恢复时自动发送 `Continue`。
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

包装器保留同一临时 home，仅替换其中的本地 `auth.json`，并为本次运行绑定的会话启动 `codex resume --no-alt-screen <session-id> Continue`。受管运行结束时会删除临时 home，源 home 中的共享文件则保留。正常受管运行不会替换源 home 的 `auth.json`。

`codex-auto activate <name>` 是显式将账号的 `auth.json` 写回源 `CODEX_HOME` 的命令，供原生 `codex` 使用。它不会复制账号的 `config.toml`。

交互式会话保持标准 Codex 终端体验，包括全屏和分屏工作流程；同时 `codex-auto` 在后台自动切换账号并恢复会话，在强制停止或额度触发切号后将控制权交还给输入状态正常的 shell。

### 在普通终端缓冲区中显示

`--no-alt-screen` 让 Codex 在普通终端缓冲区中绘制界面，而不是使用单独的全屏缓冲区。这会保留滚动历史，让你退出后仍能向上查看输出。它只改变显示行为，不影响凭据、守护进程使用、审批或沙箱策略。参阅 [Codex CLI 参考](https://developers.openai.com/codex/cli/reference)。

包装器默认在交互式启动和自动恢复时添加此参数。在恢复过程中，Codex 退出并重新启动时，普通缓冲区会将输出保留在滚动历史中。仓库也记录了终端重绘和分屏兼容性问题，但这些记录不能确定原作者选择此参数的确切原因。切换凭据并不需要此参数。

## 账号切换与会话恢复

当前版本仅在检测到真实额度限制消息时触发切换，避免将警告类输出误判为失败。

触发额度限制后：

1. 将当前账号标记为额度已耗尽。
2. 切换到下一个可用账号。
3. 将当前运行覆盖目录中的 `auth.json` 替换为下一账号的凭据。
4. 仅恢复当前受管运行已经绑定的会话 ID。
5. 执行：

```bash
codex resume --no-alt-screen <session-id> Continue
```

恢复会保留显式指定的守护进程、审批、沙箱、配置、配置档、模型和提供商设置。例如，使用以下命令启动时：

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

报告保存在 `~/.codex-auto/diagnostics/`（或 `<CODEX_AUTO_HOME>/diagnostics/`）。内容包括包装器及构建标识、近期事件、会话绑定状态和显式启动策略摘要。账号和运行标识会匿名化。报告不包含凭据、配置内容、环境变量值、提示词、终端记录、工作区路径或原始会话 ID，也不会采集外部 Codex 守护进程的内部状态或网络流量。

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
- **所有账号额度已耗尽：**查看 `codex-auto list` 中记录的重试时间，并等待额度恢复。

## 已知限制

- 额度检测依赖终端输出中已知的失败消息，而不是官方结构化事件。
- 如果底层 `codex` 会话 ID 丢失，`codex-auto` 会停止自动恢复，不会退回 `resume --last`。
- 账号轮转基于本地状态顺序，不包含权重、优先级或健康检查。

## 参考

- [真实终端回归清单](./docs/testing/real-terminal-regression.md)
- [安全审查与凭据流向](./docs/security-review.md)

## 许可证

MIT
