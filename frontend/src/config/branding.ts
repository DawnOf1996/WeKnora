/**
 * 品牌定制配置 —— 所有定制规则的唯一来源。
 *
 * 设计约束（上游 WeKnora 升级时必须保持）：
 *  1. 本文件只放「规则」，不放「实现」。其它文件只做消费点过滤，
 *     绝不要从上游的定义数组里删除条目 —— 那样每次上游升级都会冲突。
 *  2. 隐藏入口不等于停用功能：路由、后端 API、页面代码全部保留，
 *     深链（?section=xxx）仍可访问。恢复某个入口只需改本文件一行。
 *  3. 上游新增集成项时，这里不需要改；只有确实要隐藏的新项才补进来。
 *
 * 基于 Tencent WeKnora (MIT License) 修改，保留原版权声明与许可声明。
 */

/** 隐藏的设置导航 section（只藏入口，路由与后端契约不动） */
export const HIDDEN_SETTINGS_SECTIONS = ['ollama', 'weknoracloud'] as const

/** 隐藏的发布集成 tab（对应 config/integrations.ts 的 IntegrationTab） */
export const HIDDEN_INTEGRATION_TABS = ['im', 'cli', 'chrome', 'claw'] as const

/** 隐藏的用户菜单项 */
export const HIDDEN_USER_MENU_ITEMS = ['docs', 'github'] as const

export interface BrandConfig {
  /** 产品显示名，用于登录页标题、欢迎语等 */
  name: string
  /** 是否显示 Logo 区域。false = 整个 logo_box 不渲染 */
  showLogo: boolean
  /** 自有 Logo 路径（放在 frontend/public/brand/ 下）。为空则回退到上游 Logo */
  logo: string
  /** Logo 点击跳转地址。空字符串 = 不跳转 */
  homepage: string
  /** 文档站地址。空字符串 = 隐藏「帮助与文档」入口 */
  docsUrl: string
  /** 官网地址。空字符串 = 隐藏登录页右上角官网链接 */
  websiteUrl: string
  /** 仓库地址。空字符串 = 隐藏 GitHub 入口 */
  githubUrl: string
}

export const BRAND: BrandConfig = {
  name: '知识库助手',
  showLogo: false,
  logo: '',
  homepage: '',
  docsUrl: '',
  websiteUrl: '',
  githubUrl: '',
}

export function isHiddenSettingsSection(key: string): boolean {
  return (HIDDEN_SETTINGS_SECTIONS as readonly string[]).includes(key)
}

export function isHiddenIntegrationTab(key: string): boolean {
  return (HIDDEN_INTEGRATION_TABS as readonly string[]).includes(key)
}

export function isHiddenUserMenuItem(key: string): boolean {
  return (HIDDEN_USER_MENU_ITEMS as readonly string[]).includes(key)
}

/** 品牌 Logo URL；未配置自有 Logo 时回退到上游 Logo */
export function brandLogo(fallback: string): string {
  return BRAND.logo || fallback
}

/** 是否渲染 Logo 区域：显式开启，或配置了自有 Logo */
export function shouldShowLogo(): boolean {
  return BRAND.showLogo || Boolean(BRAND.logo)
}
