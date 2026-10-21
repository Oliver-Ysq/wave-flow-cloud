# Wave Flow Cloud 协作约定

- 当前仓库是 wave-flow 的服务端仓库（云端 harness 服务），独立于 Wave Flow 主仓库。设计规格见 `docs/cloud-agent/server-design.md`（本文归属本仓库）；客户端设计与协议镜像见 `docs/cloud-agent/client-design.md`，两者以共享 zod 包 `@wave-flow/protocol` 为最终契约。
- 研发中遇到的问题、疑问与解答过程统一整理到 `docs/handbook.md`：遇到值得记录的问题（概念澄清、设计取舍、踩坑）先记录再继续；条目保持"问题 → 背景 → 解答 → 结论/取舍"的结构，同一问题不重复记录。
