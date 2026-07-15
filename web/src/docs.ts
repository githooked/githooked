import './style.css';
import './icons.css';
import './pages.css';
import './header.css';
import {
  ArrowRight, Bot, Check, Copy, createIcons, ExternalLink, FileCode2, LibraryBig,
  LockKeyhole, Menu, ShieldCheck, Terminal, TriangleAlert, Zap,
} from 'lucide';
import { bindCopyButtons, bindNavigation } from './site';
import { mountSiteHeader } from './header';

const renderIcons = (): void => createIcons({
  icons: {
    ArrowRight, Bot, Check, Copy, ExternalLink, FileCode2, LibraryBig,
    LockKeyhole, Menu, ShieldCheck, Terminal, TriangleAlert, Zap,
  },
});

mountSiteHeader('docs');
renderIcons();
bindNavigation();
bindCopyButtons(renderIcons);
