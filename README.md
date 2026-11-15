# dsh-memory

给助手积累与查询知识的 DSH 插件，两类「记忆」，都只补上下文、不碰人格。

## 包含

- **experience-memory**：按鲜活度/重要度/情绪打分，只在命中时注入，会淡忘
- **memewiki**：梗/黑话词库，自动查梗并注入，支持下载社区词库与提交新梗

前者是「我自己经历的」，后者是「外部世界的」，互补。

## 关于词库数据

`memewiki/data/memes.db` **不在本仓库里**。

那份词库的版权归原项目（astrbot_plugin_memewiki，作者 in1t1a1）与 [cnmeme.wiki](https://cnmeme.wiki) 所有，本项目只做格式适配与读取，不主张其版权、也不随仓库分发。

想用的话，插件里有「更新词库」，点一下从 cnmeme.wiki 拉取到本地。代码是 MIT，数据不是我们的。

## 安装

每个子目录都是独立的 DSH bundle，分别安装：

    plugin_manager install_bundle "<path>\<subdir>"

## 说明

本仓库是归档：源码的活体在工作区，这里随发版同步。