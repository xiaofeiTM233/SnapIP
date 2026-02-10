# SnapIP | my-ip-manager

一个基于 [Next.js](https://nextjs.org/) 和 [Ant Design](https://ant.design/) 构建的 IP 地址管理工具。支持 IPv4/IPv6 网段的统一管理、批量导入导出、智能冲突检测和分组管理。

## ✨ 核心特性

- 🎨 **优雅用户界面**：深度集成 [Ant Design](https://ant.design/) v6 组件库，提供精致的视觉体验。
- ⚡ **现代化技术栈**：采用 [Next.js](https://nextjs.org/)、React 19 和 TypeScript，确保高性能和良好的开发体验。
- 🌐 **IPv4/IPv6 支持**：完整的 IPv4 和 IPv6 CIDR 格式支持，自动智能补全。
- 🔍 **智能 CIDR 补全**：输入部分 IP 自动补全为标准 CIDR 格式。
- 📦 **批量导入**：支持从文本批量导入 IP 网段，逐个处理冲突项。
- 💾 **灵活导出**：支持一行一个和逗号分隔两种导出格式。
- ⚠️ **冲突检测**：智能检测 IP 网段包含关系，支持覆盖确认或跳过操作。
- 🏷️ **分组管理**：自定义分组标签，支持按分组筛选和查询。
- 💾 **数据持久化**：基于 MongoDB 存储，数据安全可靠。

## 🛠️ 技术栈

- **框架**: [Next.js](https://nextjs.org/)
- **UI 库**: [Ant Design](https://ant.design/)
- **语言**: TypeScript
- **数据库**: [MongoDB](https://www.mongodb.com/)
- **IP 处理**: [ip-address](https://www.npmjs.com/package/ip-address)
- **React 版本**: React 19

## 📚 说明

本 README 文档由 AI 辅助生成。如有问题，请提交 Issue 或[与我联系](https://github.com/xiaofeiTM233)！
