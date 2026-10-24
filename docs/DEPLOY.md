# 部署到 dcb-server

本项目沿用 dailyclawbench 的 **本地推流（Push）模式**：本地把代码推送到服务器上的裸仓库，`post-receive` 钩子自动检出到运行目录并重启 systemd 服务。不依赖 GitHub 的部署功能，服务器上也不需要保存任何 GitHub Token。

## 1. 环境取值

| 占位符 | 当前取值 |
|---|---|
| 本地仓库 | `~/Repositories/obs-explorer` |
| GitHub 仓库 | `https://github.com/General-Agent-123/obs-browser.git` |
| SSH 别名 | `dcb-server`（`root@1.95.183.19`，默认 22 端口） |
| 裸仓库 | `/data2/panjiacheng/obs-browser.git` |
| 工作区 | `/data2/panjiacheng/obs-browser` |
| 访问地址 | `http://1.95.183.19:4318` |
| systemd 服务 | `obs-explorer` |

服务器环境：Ubuntu（kernel 6.8）、`git 2.43`、`obsutil 5.4.11`（`/usr/local/bin/obsutil`，配置在 `~/.obsutilconfig`）。
系统自带 `node` 只有 18，而项目要求 Node 20+，因此单独安装了 `/opt/node20`（`node v20.19.0`）。

## 2. 架构

```
[ 本地 obs-explorer ]
      │ git push server main
      ▼
[ dcb-server ]
  裸仓库 /data2/panjiacheng/obs-browser.git   ← 只存提交历史
      │ post-receive（软链到工作区 deploy/post-receive）
      ▼
  工作区 /data2/panjiacheng/obs-browser        ← 实际运行代码
      │ systemctl restart obs-explorer
      ▼
  systemd 服务 obs-explorer → node server.mjs → 127.0.0.1:4318 ... 对外 0.0.0.0:4318
```

## 3. 首次配置（已完成，供重建参考）

### 3.1 服务器：Node 20

```bash
mkdir -p /opt/node20
curl -fsSL -o /tmp/node20.tar.xz \
  https://registry.npmmirror.com/-/binary/node/v20.19.0/node-v20.19.0-linux-x64.tar.xz
tar -xJf /tmp/node20.tar.xz -C /opt/node20 --strip-components=1
/opt/node20/bin/node -v   # v20.19.0
```

> `nodejs.org` 在这台机器上下载极慢，用 npmmirror 镜像。

### 3.2 服务器：裸仓库

```bash
git init --bare /data2/panjiacheng/obs-browser.git
git --git-dir=/data2/panjiacheng/obs-browser.git symbolic-ref HEAD refs/heads/main
```

### 3.3 本地：远程源

```bash
git remote add server dcb-server:/data2/panjiacheng/obs-browser.git
git push server main
```

### 3.4 服务器：工作区 + 钩子

```bash
git clone /data2/panjiacheng/obs-browser.git /data2/panjiacheng/obs-browser
git --git-dir=/data2/panjiacheng/obs-browser.git config deploy.worktree /data2/panjiacheng/obs-browser
git --git-dir=/data2/panjiacheng/obs-browser.git config deploy.service obs-explorer
ln -sf /data2/panjiacheng/obs-browser/deploy/post-receive \
       /data2/panjiacheng/obs-browser.git/hooks/post-receive
chmod +x /data2/panjiacheng/obs-browser/deploy/post-receive
```

### 3.5 服务器：`.env`

`.env` 在 `.gitignore` 里，不会被部署覆盖，需要手工创建一次：

```bash
cat > /data2/panjiacheng/obs-browser/.env <<'EOF'
PORT=4318
HOST=0.0.0.0
OBS_AUTH_TOKEN=<自行生成的长随机串>
OBS_DEFAULT_PATH=obs://s3-asset-b-hd-cce-aifm-nlp-exp/task_data/261018/1018_frontend_scientific_mechanism_oc/task_configs/
EOF
chmod 600 /data2/panjiacheng/obs-browser/.env
```

生成口令：`openssl rand -base64 24`

### 3.6 服务器：systemd

```bash
cp /data2/panjiacheng/obs-browser/deploy/obs-explorer.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now obs-explorer
systemctl status obs-explorer --no-pager
```

## 4. 日常部署

```bash
git add -A
git commit -m "feat: xxx"
git push origin main     # 备份到 GitHub
git push server main     # 部署：钩子检出 + 自动重启服务
```

推送输出末尾应看到：

```
==========================================
  部署成功: 代码已自动更新至 /data2/panjiacheng/obs-browser
==========================================
  服务已重启: obs-explorer
```

前端是原生静态文件（`public/`），钩子检出后浏览器刷新即可，无需构建。
`public/trajectory/` 是已构建产物，同样随仓库分发，服务器上不需要 `npm install` / `npm run build`。

### 钩子未生效时手动部署

```bash
ssh dcb-server
git -C /data2/panjiacheng/obs-browser pull
systemctl restart obs-explorer
```

## 5. 登录鉴权

服务默认无鉴权（本地模式）。设置 `OBS_AUTH_TOKEN` 后开启共享口令登录：

- 未登录访问任意页面 → 跳转 `/login`；未登录调用 `/api/*` → `401`。
- 登录成功后下发 `HttpOnly; SameSite=Lax` 会话 cookie，有效期 30 天。
- cookie 值是口令的 HMAC，不是口令本身；改口令后旧 cookie 立即失效。
- 首次访问可用 `http://<host>:4318/?token=<口令>` 免表单登录，随后地址栏自动去掉口令。
- 登录失败 10 分钟内超过 8 次会被临时限流（按来源 IP）。
- 页面右上角「退出登录」按钮 → `/logout` 清除 cookie。

> 口令通过明文 HTTP 传输，公网部署建议前置 HTTPS（Nginx/Caddy 反代，并透传 `Host` 与 `X-Forwarded-Proto`）。

## 6. 运维

```bash
systemctl status obs-explorer        # 状态
journalctl -u obs-explorer -f        # 实时日志
systemctl restart obs-explorer       # 重启
ss -tlnp | grep 4318                 # 端口占用
```

`obsutil` 凭据仍在服务器 `~/.obsutilconfig`，服务启动时复制到 `0700` 临时目录使用，不落库、不进前端。

## 7. 常见问题

### 端口被占用（`EADDRINUSE`）

`systemctl status obs-explorer` 显示 `listen EADDRINUSE: 0.0.0.0:4318` 时，先确认占用进程：

```bash
ss -tlnp | grep 4318
```

要么停掉占用进程，要么改 `.env` 里的 `PORT`（同时更新安全组/防火墙放行端口），然后 `systemctl restart obs-explorer`。

### 页面能打开但接口 401

说明未登录或 cookie 过期。重新打开 `http://<host>:4318/?token=<口令>`，或到 `/login` 输入口令。

### 钩子推送后页面没变化

```bash
journalctl -u obs-explorer -n 30 --no-pager   # 看服务是否重启
git -C /data2/panjiacheng/obs-browser log --oneline -1
```

若工作区没更新，手动执行 `git -C /data2/panjiacheng/obs-browser pull && systemctl restart obs-explorer`。

## 8. 性能：为什么这台机器上偏慢

`obsutil` 是独立 CLI，每个 API 请求都会新起进程并重新和 OBS 建 TLS 连接，因此**链路抖动会直接体现在每次点击上**。当前环境的实测：

| 链路 | 实测 |
|---|---|
| 操作机 → OBS（cn-east-4） | RTT ≈ 0.7 ms（同地域，近似内网） |
| 操作机 → dcb-server（贵阳） | RTT ≈ 80 ms |
| dcb-server → OBS（跨地域公网） | TCP 握手 0.09 s ~ 7.2 s，抖动极大 |

同一份 `obsutil ls`：操作机 ≈ 1.24 s（稳定），dcb-server ≈ 2.1 s，偶发 6 s 以上。

**根因是地域错配**：桶在 `cn-east-4`（上海），dcb-server 在贵阳，所有 OBS 访问都跨地域走公网；再加上浏览器 → 贵阳这一段，文件内容实际是「OBS → 贵阳 → 你」的双跳。

### 已做的缓解

- 目录列表缓存 `OBS_LIST_CACHE_MS`（默认 30 s）：重复翻同一目录、返回/前进、刷新页面不再触发 `obsutil`。
- 对象元数据缓存 `OBS_STAT_CACHE_MS`（默认 120 s）：`/api/list` 会把列表里的 size/mtime/etag 喂给 `stat` 缓存，打开预览不再多跑一次 `obsutil stat`。
- 桶列表缓存 `OBS_BUCKET_CACHE_MS`（默认 300 s）：首屏侧边栏不再每次都等桶列表。
- 写操作（上传/删除/移动/拷贝/新建目录）会清空上述缓存，避免看到旧数据。
- 工具栏刷新按钮会带 `refresh=1` 强制绕过目录缓存。

### 根治方案

把服务放到与桶同地域（`cn-east-4` / 上海）的机器上，所有调用会回到 ~1.2 s 的稳定水平，下载也变成单跳。若该机器在外网，再配一层隧道/反向代理对外访问。
