Wispbyte Node.js + Sing-Box 原生节点部署教程
本教程介绍如何在 Wispbyte 面板中直接部署免域、开箱即用的原生 VLESS 节点。整个过程无需复杂的域名绑定与 CDN 配置，复制即用。

许可证与商业限制
开源协议：本项目采用 CC BY-NC 4.0（署名-非商业性使用） 协议发布。

商业限制：严禁任何个人或组织将本教程、相关配置文件及代码用于任何形式的商业盈利、收费机场搭建、商业售卖或引流牟利。仅限个人技术研究与交流使用。

部署准备工作
登录 Wispbyte 控制面板，进入对应服务器的 Files（文件管理器） 页面。

确保容器支持 Node.js 运行环境。

核心步骤详解
第一步：创建服务端配置文件
在文件管理器根目录下新建或编辑名为 config.json 的文件，将节点监听配置写入其中：

关键参数说明：

协议类型：vless

本地监听端口：10086（由后端程序进行转发）

UUID：用户凭证身份 ID（可自行修改）

传输路径：/api/v2/telemetry/stream_8f91a

第二步：创建主控与转发脚本
在根目录下新建或编辑名为 index.js 的文件。该脚本会自动在线下载适配的 sing-box 内核、自动解压赋予权限，并建立安全的双向 WebSocket 流量转发通道，同时包含内部服务保活机制。

第三步：启动与状态检查
所有的配置文件准备就绪后，切换至控制台 Console 页面。

点击 Restart（重启） 按钮重新加载容器。

检查控制台日志，确认出现以下提示即代表后台伪装进程已成功接管端口并正常运行：

[+] Web 伪装服务已监听端口 14028

[★] 伪装内核解压成功！

[+] 启动后台伪装进程 (npm-system-worker)...

客户端导入与连接参数
在本地代理客户端（如 v2rayN 等）中新建 VLESS 节点，填入以下原生直连参数即可开始使用：

别名备注：Wispbyte-VLESS

服务器地址：78.154.103.35

服务端口：14028

用户 ID (UUID)：b4f7fd9e-a092-490f-8532-74a756cbbf89（需与 config.json 保持一致）

传输协议：ws (WebSocket)

伪装路径：/api/v2/telemetry/stream_8f91a

传输层安全 (TLS)：关闭 (none)

# 节点快捷格式：
vless://uuid@IP和端口?encryption=none&security=none&type=ws&path=%2Fapi%2Fv2%2Ftelemetry%2Fstream_8f91a#Wispbyte-VLESS
