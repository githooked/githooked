import './style.css';
import './icons.css';
import './pages.css';
import {
  ArrowRight, Bot, Check, Coffee, Copy, createIcons, ExternalLink, FileCode2, LibraryBig,
  LockKeyhole, Menu, ShieldCheck, Terminal, TriangleAlert, Zap,
} from 'lucide';
import { bindCopyButtons, bindNavigation } from './site';

const renderIcons = (): void => createIcons({
  icons: {
    ArrowRight, Bot, Check, Coffee, Copy, ExternalLink, FileCode2, LibraryBig,
    LockKeyhole, Menu, ShieldCheck, Terminal, TriangleAlert, Zap,
  },
});

renderIcons();
bindNavigation();
bindCopyButtons(renderIcons);
