// Zentrale Icon-Bibliothek: 100 % der UI-Icons stammen aus dem Paket
// `iconoir` (https://iconoir.com). Die SVG-Dateien werden zur Build-Zeit
// als Rohtext importiert und inline gerendert, damit e2e-Tests weiterhin
// echte <svg>-Elemente im DOM finden.
import { formatIcon, innerMarkup } from './icon-svg';
import arrowDown from 'iconoir/icons/regular/arrow-down.svg?raw';
import arrowLeft from 'iconoir/icons/regular/arrow-left.svg?raw';
import arrowRight from 'iconoir/icons/regular/arrow-right.svg?raw';
import arrowUp from 'iconoir/icons/regular/arrow-up.svg?raw';
import bell from 'iconoir/icons/regular/bell.svg?raw';
import calendar from 'iconoir/icons/regular/calendar.svg?raw';
import dataTransferBoth from 'iconoir/icons/regular/data-transfer-both.svg?raw';
import dotArrowRight from 'iconoir/icons/regular/dot-arrow-right.svg?raw';
import clock from 'iconoir/icons/regular/clock.svg?raw';
import coins from 'iconoir/icons/regular/coins.svg?raw';
import editPencil from 'iconoir/icons/regular/edit-pencil.svg?raw';
import emptyPage from 'iconoir/icons/regular/empty-page.svg?raw';
import eye from 'iconoir/icons/regular/eye.svg?raw';
import eyeClosed from 'iconoir/icons/regular/eye-closed.svg?raw';
import group from 'iconoir/icons/regular/group.svg?raw';
import halfMoon from 'iconoir/icons/regular/half-moon.svg?raw';
import hourglass from 'iconoir/icons/regular/hourglass.svg?raw';
import infoCircle from 'iconoir/icons/regular/info-circle.svg?raw';
import journal from 'iconoir/icons/regular/journal.svg?raw';
import label from 'iconoir/icons/regular/label.svg?raw';
import lock from 'iconoir/icons/regular/lock.svg?raw';
import mail from 'iconoir/icons/regular/mail.svg?raw';
import mapPin from 'iconoir/icons/regular/map-pin.svg?raw';
import mediaImage from 'iconoir/icons/regular/media-image.svg?raw';
import menu from 'iconoir/icons/regular/menu.svg?raw';
import message from 'iconoir/icons/regular/message.svg?raw';
import microphone from 'iconoir/icons/regular/microphone.svg?raw';
import moreHoriz from 'iconoir/icons/regular/more-horiz.svg?raw';
import navArrowDown from 'iconoir/icons/regular/nav-arrow-down.svg?raw';
import openInBrowser from 'iconoir/icons/regular/open-in-browser.svg?raw';
import page from 'iconoir/icons/regular/page.svg?raw';
import pharmacyCrossCircle from 'iconoir/icons/regular/pharmacy-cross-circle.svg?raw';
import plus from 'iconoir/icons/regular/plus.svg?raw';
import refresh from 'iconoir/icons/regular/refresh.svg?raw';
import reply from 'iconoir/icons/regular/reply.svg?raw';
import ruler from 'iconoir/icons/regular/ruler.svg?raw';
import search from 'iconoir/icons/regular/search.svg?raw';
import shield from 'iconoir/icons/regular/shield.svg?raw';
import shirt from 'iconoir/icons/regular/shirt.svg?raw';
import sidebarCollapse from 'iconoir/icons/regular/sidebar-collapse.svg?raw';
import sidebarExpand from 'iconoir/icons/regular/sidebar-expand.svg?raw';
import soccerBall from 'iconoir/icons/regular/soccer-ball.svg?raw';
import star from 'iconoir/icons/regular/star.svg?raw';
import statsReport from 'iconoir/icons/regular/stats-report.svg?raw';
import sunLight from 'iconoir/icons/regular/sun-light.svg?raw';
import trash from 'iconoir/icons/regular/trash.svg?raw';
import user from 'iconoir/icons/regular/user.svg?raw';
import whiteFlag from 'iconoir/icons/regular/white-flag.svg?raw';
import heart from 'iconoir/icons/solid/heart.svg?raw';

// Eigenes Geist-Icon (iconoir liefert keines): neutrales Platzhalterbild für
// den Geistermodus im Forum.
const ghostSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6.5 6.5 0 0 0-6.5 6.5V20a.6.6 0 0 0 .98.46l1.27-1.23 1.25 1.21a.6.6 0 0 0 .85 0l1.25-1.21 1.25 1.21a.6.6 0 0 0 .85 0l1.27-1.23a.6.6 0 0 0 .98-.46V9.5A6.5 6.5 0 0 0 12 3Z"/><circle cx="9.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10" r="1" fill="currentColor" stroke="none"/></svg>';

export type IconName =
  | 'medical'
  | 'article'
  | 'users'
  | 'external-link'
  | 'tag'
  | 'report'
  | 'news'
  | 'press'
  | 'transfer'
  | 'more'
  | 'plus'
  | 'moon'
  | 'sun'
  | 'calendar'
  | 'clock'
  | 'height'
  | 'boot'
  | 'flag'
  | 'shield'
  | 'file'
  | 'coins'
  | 'shirt'
  | 'map-pin'
  | 'heart'
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'mail'
  | 'bell'
  | 'lock'
  | 'info'
  | 'image'
  | 'edit'
  | 'hourglass'
  | 'trash'
  | 'star'
  | 'ball'
  | 'assist'
  | 'message-square'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'panel-left-close'
  | 'panel-left-open'
  | 'refresh'
  | 'reply'
  | 'menu'
  | 'chevron-down'
  | 'ghost'
  | 'user';

const icons: Record<IconName, string> = {
  medical: pharmacyCrossCircle,
  article: page,
  users: group,
  'external-link': openInBrowser,
  tag: label,
  report: statsReport,
  news: journal,
  press: microphone,
  transfer: dataTransferBoth,
  more: moreHoriz,
  plus,
  moon: halfMoon,
  sun: sunLight,
  calendar,
  clock,
  height: ruler,
  boot: soccerBall,
  flag: whiteFlag,
  shield,
  file: emptyPage,
  coins,
  shirt,
  'map-pin': mapPin,
  heart,
  search,
  eye,
  'eye-off': eyeClosed,
  mail,
  bell,
  lock,
  info: infoCircle,
  image: mediaImage,
  edit: editPencil,
  hourglass,
  trash,
  star,
  ball: soccerBall,
  assist: dotArrowRight,
  'message-square': message,
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'arrow-up': arrowUp,
  'arrow-down': arrowDown,
  'panel-left-close': sidebarCollapse,
  'panel-left-open': sidebarExpand,
  refresh,
  reply,
  menu,
  'chevron-down': navArrowDown,
  ghost: ghostSvg,
  user,
};

export const iconNames = Object.keys(icons) as IconName[];

/**
 * Rendert ein iconoir-Icon als inline-SVG-String (siehe formatIcon in
 * ./icon-svg.ts).
 */
export function renderIcon(
  name: IconName,
  size = 18,
  className?: string,
): string {
  return formatIcon(icons[name], size, className);
}

/** Nur der innere Markup (Pfade) eines Icons, z. B. für eigene <svg>-Wrapper. */
export function iconInner(name: IconName): string {
  return innerMarkup(icons[name]);
}
