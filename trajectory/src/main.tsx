import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'trajectory-viewer/style.css';
import './styles.css';
import App from './App';
import MarkdownPage from './MarkdownPage';
import { isMarkdownPath } from './markdown';

// ?file=obs://.../report.md 时进入独立 markdown 渲染页，其余仍是轨迹查看器
const fileParam = new URLSearchParams(window.location.search).get('file');
const standaloneMarkdown = fileParam && isMarkdownPath(fileParam) ? fileParam : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {standaloneMarkdown ? <MarkdownPage filePath={standaloneMarkdown} /> : <App />}
  </StrictMode>,
);
