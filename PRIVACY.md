# 隐私声明

Keeby 重视你的隐私。以下是本应用对数据处理的完整说明。

## Accessibility 权限的用途

Keeby 使用 macOS Accessibility 权限**仅用于检测按键事件**（keycode + 按下/抬起状态）。

**不会读取、存储或传输**：
- 按键内容或输入的文字
- 密码、表单数据或剪贴板内容
- 任何应用的文本输入

## 完全离线运行

- 应用 **100% 离线运行**，不发起任何网络请求
- 无遥测（telemetry）
- 无数据分析（analytics）
- 无任何形式的数据收集

## 音效播放

所有音效播放完全在进程内完成，不涉及外部服务或网络通信。

## 开源可验证

Keeby 是开源软件。你可以直接审阅源代码来验证以上所有声明：

- 键盘监听逻辑：`src/main/keyboard.ts`
- IPC 通信：`src/main/ipc-handlers.ts`
- 预加载脚本：`src/main/preload.ts`

如有任何隐私相关疑问，欢迎在 [GitHub Issues](https://github.com/UltiSpike/pekko/issues) 中提出。
