# 贡献指南

感谢你对 Keeby 的关注！以下是参与贡献的流程。

## 开发环境搭建

```bash
# 前置要求：Node.js >= 18, macOS
git clone https://github.com/UltiSpike/pekko.git
cd keeby
npm install
npm run dev          # 同时启动 Vite + Electron
```

> Keeby 使用 Accessibility 权限监听键盘事件，首次运行时系统会弹出授权弹窗。

## 添加音效配置（Sound Profile）

1. 在 `assets/sounds-hq/<profile-id>/` 下放置音频文件和 `config.json`
2. 支持两种格式：
   - **Sprite**（`key_define_type: "single"`）：单个 `.ogg` 文件 + 时间片定义
   - **Multi**（`key_define_type: "multi"`）：每个按键独立 `.wav`/`.mp3`/`.ogg`
3. 在 `profiles/index.json` 中注册新 profile 的 `id`、`name`、`description`、`type`
4. 运行 `npm run dev` 验证加载正常

## 代码风格

- TypeScript strict mode
- 使用 ES Module 风格导入
- 文件命名：`kebab-case.ts`
- 不引入不必要的第三方依赖——能用 Node.js / Electron 原生 API 解决的优先
- 注释使用英文

## PR 流程

1. Fork 并创建功能分支（`feat/xxx` 或 `fix/xxx`）
2. 确保 `npm run build` 通过
3. PR 描述清楚改了什么、为什么改
4. 一个 PR 只做一件事，保持 diff 精简
