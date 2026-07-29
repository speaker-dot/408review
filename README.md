# 408 MindMap PWA

面向 408 计算机学科专业基础综合的知识图谱学习网站，包含数据结构、计算机组成原理、操作系统和计算机网络四门课程，共 355 个结构化节点与按考法精选的练习。

项目使用 Vite 5、Vue 3、TypeScript、Vue Router、Pinia、Dexie.js、ECharts 和 vite-plugin-pwa 构建，采用 MIT 许可证开源。

## 功能

- 四科知识图谱导航与全局搜索
- 2020—2025 年 408 真题与参考解析在线阅读
- 原卷、解析、左右对照三种阅读模式，以及题号到知识点的关联跳转
- 面向初学者的定义、结构、步骤、公式、例题推演和考情讲解
- 结构化易错点：错法、原因、纠正方法和例题支撑
- 题量随考法变化：每个节点保留 1～4 道差异化选择题，只有适合考大题的节点才配置综合分析题
- 可追溯的真题年份、题号与公开来源链接
- IndexedDB 本地内容缓存
- Service Worker 预缓存应用及全部知识 JSON
- 真题 PDF 按年份主动下载后可离线阅读
- 支持安装为桌面或移动端 PWA
- 支持 GitHub Pages 子路径部署

## 本地开发

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

打开终端输出的地址。`127.0.0.1` 只供当前电脑使用，关闭终端后服务也会停止，不能将该地址分享给其他人。

## 构建与离线启动

```bash
npm run build
npm run start:offline
```

Windows 用户也可以双击 `start-offline.cmd`。离线服务器默认使用：

```text
http://127.0.0.1:4173/
```

浏览器不允许 `file://` 页面注册 Service Worker，因此不要直接双击 `dist/index.html`。请使用上述本地服务器，或先从公开 HTTPS 网站安装 PWA。

## PWA 离线使用

1. 第一次在联网状态下打开已部署的 HTTPS 网站。
2. 等待页面加载完成，在浏览器菜单中选择“安装应用”或“添加到主屏幕”。
3. 安装完成后，应用外壳、字体和全部知识节点均可在断网状态下访问。

第一次从未访问过该网站的设备无法凭空获得离线资源；必须先在线加载一次，或获取包含 `dist` 的离线压缩包并运行本地服务器。

## 发布到 GitHub Pages

1. 在 GitHub 创建一个公开仓库，例如 `cs408-mindmap-pwa`。
2. 将本项目内容推送到仓库的 `main` 分支。
3. 打开仓库 `Settings → Pages`，将 Source 设为 **GitHub Actions**。
4. 推送后，`.github/workflows/deploy-pages.yml` 会自动校验、构建并发布。
5. 发布地址通常为 `https://你的用户名.github.io/仓库名/`。

公开仓库提供源码，GitHub Pages 提供可分享网站，两者职责不同。代码更新后再次推送，网站会自动重新部署。

## 内容维护

```bash
npm run content:validate
npm run content:generate
```

知识文件位于 `src/content/{ds,cs,os,net}`。运行生成命令会依据 `scripts/generate-content.mjs` 重新生成全部节点，请先提交或备份人工修改。

在线状态下详情页会优先获取带哈希的最新 JSON，并回写 Dexie 供离线访问。若未来发布无法兼容旧本地数据的全量内容升级，应在 `src/db/db.ts` 新增数据库版本与一次性迁移，避免已访问节点长期命中旧缓存。

内容校验会强制检查讲解章节、最低详尽度、4 个结构化易错项、差异化题量、重复题干以及真题来源元数据。标注“真题改编”的题目仅保留考点、年份和题号映射，题干会重新表述，解析由本项目独立编写；未核验到明确题源的题目会如实标注为原创模拟题。

公开题源索引：[厦门工学院 2009—2025 年 408 真题与解析汇总](https://www.xit.edu.cn/yjsfk/kyzykwtkw/list.htm)。

## 许可证

项目源代码采用 [MIT](./LICENSE) 许可证开源。

`public/papers` 中的真题与参考解析来自 README 所列公开资料来源，仅用于学习、研究与题目索引展示，不属于本项目原创内容，也不纳入 MIT 许可证授权范围；相关权利归原权利人所有。如权利人认为收录不妥，请提交 Issue 联系移除。
