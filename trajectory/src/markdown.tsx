import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components, ExtraProps } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { trajectoryFileUrl } from './api';

/**
 * workspace markdown 文件的富文本预览。
 *
 * react-markdown 默认不渲染内嵌 HTML、默认 URL 协议白名单会拦掉 javascript:，
 * 对 OBS 上来路不明的 markdown 是安全的；GFM 提供表格/任务列表，
 * rehype-highlight 给围栏代码块上色（配色在 styles.css 的 .traj-md 作用域里）。
 */

/** 判断对象路径是否为 markdown 文件（只看结尾扩展名，兼容 OBS key 中的特殊字符） */
export function isMarkdownPath(filePath: string): boolean {
  return /\.(md|markdown)$/i.test(String(filePath || '').replace(/\/+$/, ''));
}

/** markdown 独立查看页地址；由 main.tsx 读取 ?file= 渲染 */
export function markdownViewerUrl(objectPath: string): string {
  return `/trajectory/?file=${encodeURIComponent(objectPath)}`;
}

/**
 * 在浏览器里「打开」一个对象：markdown 走渲染页，其余仍是原始对象代理。
 * 用于「新标签」、交付物抽屉和 markdown 内的相对链接。
 */
export function openObjectUrl(objectPath: string): string {
  return isMarkdownPath(objectPath) ? markdownViewerUrl(objectPath) : trajectoryFileUrl(objectPath);
}

/** 解析 markdown 里的相对引用到它在 OBS 上的对象路径；非相对路径或越界返回 null */
export function resolveRelativeObjectPath(baseDir: string, reference: string): string | null {
  const clean = String(reference || '').split('#')[0].split('?')[0];
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//') || clean.startsWith('/')) {
    return null;
  }
  const segments = baseDir
    .replace(/^obs:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
  for (const segment of clean.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  // 至少要剩下 bucket + 一级路径
  if (segments.length < 2) return null;
  return `obs://${segments.join('/')}`;
}

type AnchorProps = ComponentPropsWithoutRef<'a'> & ExtraProps;
type ImageProps = ComponentPropsWithoutRef<'img'> & ExtraProps;

interface MarkdownPreviewProps {
  text: string;
  /** markdown 文件自身的 obs:// 路径，用于解析相对图片/链接 */
  basePath: string;
}

export function MarkdownPreview({ text, basePath }: MarkdownPreviewProps) {
  const baseDir = basePath.slice(0, basePath.lastIndexOf('/') + 1);

  const components: Components = {
    // 相对链接指向同目录下的 workspace 文件，走 /trajectory/files/ 代理；一律新标签打开，别打断预览
    a({ node, href, children, ...rest }: AnchorProps) {
      const resolved = href ? resolveRelativeObjectPath(baseDir, href) : null;
      // 指向 markdown 的相对链接也打开渲染页，避免又跳回原始源码
      const target = resolved ? openObjectUrl(resolved) : href || undefined;
      void node;
      return (
        <a {...rest} href={target} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    // 相对图片同样解析到同目录对象；解析不了的交给默认 URL 处理（渲染为失效图）
    img({ node, src, alt, ...rest }: ImageProps) {
      const resolved = typeof src === 'string' ? resolveRelativeObjectPath(baseDir, src) : null;
      void node;
      return (
        <img
          {...rest}
          src={resolved ? trajectoryFileUrl(resolved) : src || undefined}
          alt={alt ?? ''}
          loading="lazy"
        />
      );
    },
  };

  return (
    <div className="traj-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
