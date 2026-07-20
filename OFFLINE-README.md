# 408 MindMap 离线包使用说明

## Windows

1. 安装 Node.js 20 或更高版本。
2. 解压整个压缩包，不要只复制 `index.html`。
3. 双击 `start-offline.cmd`。
4. 浏览器将打开 `http://127.0.0.1:4173/`。
5. 使用期间保持命令窗口开启；关闭窗口即停止本地服务。

## macOS / Linux

在解压目录运行：

```bash
node scripts/serve-offline.mjs
```

然后打开 `http://127.0.0.1:4173/`。

`127.0.0.1` 仅限本机使用。若要把网站分享给他人，请使用公开 HTTPS 托管地址，而不是分享这个本地地址。
