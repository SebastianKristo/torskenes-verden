// Prompt 36: ikon på hver rad i Innstillinger (claude-code-innstillinger-ikoner.md).
// Ikonbrikke 34 × 34 (mobil 30), radius 10, sidens farge med 12 % (mørkt: 18 %), ikon 18 px med strek 2 (Lucide-former).
// Status-rader blir grønne/røde, farlige handlinger røde. Radene får ikonet automatisk etter tittelen, så også rader som
// tegnes av andre moduler (Backup, System, AI …) får det. Ikonene er aria-hidden; tittelen bærer teksten.
const L = {
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'at-sign': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8',
  shield: 'M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z',
  'shield-check': 'M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1zM9 12l2 2 4-4',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21',
  'key-round': 'M2.6 18.2A2 2 0 0 0 2 19.6V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4zM16.5 7.5h.01',
  key: 'M15.5 7.5l2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4M21 2l-9.6 9.6M7.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z',
  laptop: 'M18 5a2 2 0 0 1 2 2v8.5a1 1 0 0 1 .1.4l.9 2.3A1.3 1.3 0 0 1 19.8 20H4.2A1.3 1.3 0 0 1 3 18.2l.9-2.3a1 1 0 0 0 .1-.4V7a2 2 0 0 1 2-2zM20 16H4',
  'monitor-smartphone': 'M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8M10 19v-3.96M7 19h5M16 12h6v10h-6zM19 18h.01',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  'lock-keyhole': 'M5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM7 10V7a5 5 0 0 1 10 0v3M12 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  history: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.7 2.7L3 8M3 3v5h5M12 7v5l4 2',
  'log-out': 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  'sun-moon': 'M12 8a2.8 2.8 0 0 0 4 4 4 4 0 1 1-4-4M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4',
  palette: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8zM13.5 6.5h.01M17.5 10.5h.01M6.5 12.5h.01M8.5 7.5h.01',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  languages: 'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  'app-window': 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 4v4M2 8h20M6 4v4',
  'layout-grid': 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'grip-vertical': 'M9 12h.01M9 5h.01M9 19h.01M15 12h.01M15 5h.01M15 19h.01',
  'columns-3': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18M15 3v18',
  newspaper: 'M15 18h-5M18 14h-8M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2M10 6h8v4h-8z',
  hand: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  sparkles: 'M9.9 15.5A2 2 0 0 0 8.5 14.1l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0zM20 3v4M22 5h-4',
  activity: 'M22 12h-2.5a2 2 0 0 0-1.9 1.5l-2.4 8.4a.25.25 0 0 1-.5 0L9.2 2.1a.25.25 0 0 0-.5 0l-2.4 8.4A2 2 0 0 1 4.5 12H2',
  bell: 'M10.3 21a1.9 1.9 0 0 0 3.4 0M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.6 18 8A6 6 0 0 0 6 8c0 4.6-1.4 6-2.7 7.3',
  'bell-ring': 'M10.3 21a1.9 1.9 0 0 0 3.4 0M22 8c0-2.3-.8-4.3-2-6M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.6 18 8A6 6 0 0 0 6 8c0 4.6-1.4 6-2.7 7.3M4 2C2.8 3.7 2 5.7 2 8',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  calendar: 'M8 2v4M16 2v4M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 10h18',
  'calendar-clock': 'M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M16 2v4M8 2v4M3 10h5M17.5 17.5L16 16.3V14M22 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  package: 'M11 21.7a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7zM12 22V12M3.3 7L12 12l8.7-5M7.5 4.3l9 5.1',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  'hard-drive': 'M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  'download-cloud': 'M12 13v8l-4-4M12 21l4-4M4.4 15.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2',
  'scan-face': 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  vibrate: 'M2 8l2 2-2 2 2 2-2 2M22 8l-2 2 2 2-2 2 2 2M9 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  smartphone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  'refresh-cw': 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5',
  'refresh-ccw': 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M16 16h5v5',
  keyboard: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'eye-off': 'M10.7 5.1A10.7 10.7 0 0 1 21.9 11.6a1 1 0 0 1 0 .7 10.7 10.7 0 0 1-1.4 2.5M14.1 14.2a3 3 0 0 1-4.2-4.2M17.5 17.5a10.8 10.8 0 0 1-15.4-5.2 1 1 0 0 1 0-.7 10.7 10.7 0 0 1 4.4-5.1M2 2l20 20',
  'check-circle-2': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9 12l2 2 4-4',
  play: 'M6 3l14 9-14 9z',
  repeat: 'M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
  archive: 'M3 3h18v5H3zM5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4',
  server: 'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM6 6h.01M6 18h.01',
  'list-checks': 'M13 5h8M13 12h8M13 19h8M3 17l2 2 4-4M3 7l2 2 4-4',
  'rotate-ccw': 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
  cpu: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6v6H9zM15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2',
  coins: 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82',
  'list-todo': 'M3 5h6v6H3zM3 17l2 2 4-4M13 6h8M13 12h8M13 18h8',
  'audio-lines': 'M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3',
  sunrise: 'M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  'scroll-text': 'M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3',
  network: 'M16 16h6v6h-6zM2 16h6v6H2zM9 2h6v6H9zM5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8',
  power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  wifi: 'M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  pencil: 'M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4',
  volume: 'M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5zM16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.7',
  'message-circle': 'M7.9 20A9 9 0 1 0 4 16.1L2 22z',
  'map-pin': 'M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  // Prompt 65 (samlet-md § Ikoner på alt): System og flyttede rader.
  box: 'M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7L12 12l8.7-5M12 22V12',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  bug: 'M8 2l1.9 1.9M14.1 3.9L16 2M9 7.1V6a3 3 0 1 1 6 0v1.1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6.5 13H3M21 13h-3.5M6 9.5L3 8M21 8l-3 1.5M6 17l-3 2M21 19l-3-2',
  flask: 'M10 2v7.5L4.6 18.4A2 2 0 0 0 6.4 21h11.2a2 2 0 0 0 1.8-2.6L14 9.5V2M8.5 2h7M7 16h10',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
};
const ALERT = 'M21.7 18L13.7 4a2 2 0 0 0-3.5 0L2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3zM12 9v4M12 17h.01';

// [regex på tittelen, ikon]. Første treff vinner.
const MAP = [
  // Prompt 65: System (containere = boks, disk/backup = disk, database, oppdateringer = sirkelpiler, tilbakerulling = angre,
  // røyktest = kolbe, trege forespørsler = klokke, /api/health = puls, feature flags = flagg, krasjrapporter = insekt).
  [/container/i, 'box'], [/database|integritet|vacuum|vedlikehold/i, 'database'], [/feature flag/i, 'flag'], [/krasj/i, 'bug'], [/røyktest|staging/i, 'flask'],
  // Prompt 66: Glimt-radene, modulene og Konto/Utseende/Varsler (ikon etter innhold).
  [/^les opp|leser .* høyt/i, 'audio-lines'], [/^tempo/i, 'timer'], [/språk for opplesning/i, 'languages'], [/stemme for/i, 'audio-lines'], [/vis meg rundt|guide/i, 'hand'], [/venner av/i, 'smile'], [/^varsel når|^push-varsel/i, 'bell'], [/julemodus|jul|17\. mai|høytid/i, 'sparkles'],
[/^sted\b/i, 'map-pin'], [/^person\b/i, 'user'], [/^butikk\b/i, 'package'], [/^abonnement\b/i, 'repeat'], [/^fast hendelse/i, 'calendar'],
    [/^vær$|^været/i, 'cloud'], [/^gjøremål|huskeliste/i, 'list-checks'], [/^pakker/i, 'package'], [/^familie/i, 'users'], [/^nyheter/i, 'newspaper'], [/^økonomi|^penger|^aksjer/i, 'coins'],
  [/entitet|hva betyr/i, 'users'], [/oppskrift|glimt lærer|hurtigvei|rettelse/i, 'list-checks'], [/^legg til/i, 'pencil'], [/ukerapport|eval|kjører hver natt|^uke \d/i, 'flask'], [/alle brukere/i, 'users'],
  [/morgenbrief|dagsbrief|kveldsbrief|nattbrief/i, 'sunrise'], [/betinget/i, 'bell'], [/prisområde|strøm/i, 'activity'], [/planlagte oppgaver/i, 'calendar-clock'],
  [/trege forespørsler|ytelse|per rute/i, 'clock'], [/api\/health|^helse/i, 'activity'], [/tilbakerull|gå tilbake|rull tilbake/i, 'undo'], [/passkey/i, 'key-round'],
  [/brief og glimt-figur/i, 'smile'], [/apple health|health connect|^helse|deles med familien/i, 'heart'], [/faste oppgaver/i, 'calendar-clock'], [/snarvei/i, 'link'], [/hastighet|pause/i, 'timer'], [/^stil$|kategori/i, 'palette'], [/søkehistorikk/i, 'history'], [/^kvalitet$/i, 'check-circle-2'], [/sonevarsel/i, 'map-pin'], [/selvreparasjon|omstart/i, 'refresh-cw'], [/timeplan|skole/i, 'calendar'],
  [/^navn på serveren/i, 'server'], [/^(navn|fullt navn|visningsnavn)$/i, 'user'], [/^brukernavn/i, 'at-sign'], [/^rolle/i, 'shield'], [/^profilbilde|^bilde$/i, 'image'],
  [/totrinn|2fa|tofaktor/i, 'key-round'], [/^pålitelige enheter/i, 'monitor-smartphone'], [/^pålitelig enhet|^denne enheten/i, 'laptop'], [/passord/i, 'lock'], [/^økter|^aktive økter/i, 'history'],
  [/logg ut/i, 'log-out'], [/^lås skjermen|^lås/i, 'lock'],
  [/^tema$|mørkt|lyst tema|^tema /i, 'sun-moon'], [/fargetema|farger$|^farge/i, 'palette'], [/bakgrunn/i, 'image'], [/tekststørrelse|skrift/i, 'type'], [/^språk|language/i, 'languages'], [/bevegelse/i, 'move'], [/app-ikon|appikon|ikon/i, 'app-window'],
  [/^widgets på telefonen|widgets på hjem/i, 'smartphone'], [/widget/i, 'layout-grid'], [/rekkefølge/i, 'grip-vertical'], [/kolonner/i, 'columns-3'], [/nyhet|ticker/i, 'newspaper'], [/hilsen/i, 'hand'], [/faner|topplinje|meny/i, 'layout-grid'], [/søkebar|^søk/i, 'search'],
  [/cloudflare/i, 'cloud'], [/search console/i, 'search'], [/oppsummering/i, 'sparkles'], [/nedetid|oppetid/i, 'activity'], [/^domen/i, 'globe'],
  [/^push|varsler på|varsling/i, 'bell'], [/e-post|epost|mail/i, 'mail'], [/stille timer|natt/i, 'moon'], [/backup feiler|varsle meg når/i, 'bell-ring'], [/pakker|sporing/i, 'package'], [/prøveperiode/i, 'timer'],
  [/face id|biometri|fingeravtrykk/i, 'scan-face'], [/haptikk|vibrasjon/i, 'vibrate'], [/bakgrunnsoppdatering/i, 'refresh-cw'], [/hurtigtast|tastatur/i, 'keyboard'],
  [/ical|abonnement|lenke|url/i, 'link'], [/skjul i menyen|skjul/i, 'eye-off'],
  [/^siste backup|^status$/i, 'check-circle-2'], [/ta backup nå|kjør nå|test nå/i, 'play'], [/automatisk backup/i, 'calendar-clock'], [/hvor ofte|frekvens|intervall/i, 'repeat'], [/^behold/i, 'archive'],
  [/nettverksdisk|mål|smb|nas|lagres på|hvor/i, 'server'], [/hva (som )?tas med|omfang|moduler/i, 'list-checks'], [/gjenopprett/i, 'rotate-ccw'], [/krypter/i, 'lock-keyhole'], [/last ned (siste )?backup/i, 'download'], [/kopi til sky|sky/i, 'cloud'],
  [/^modell|modeller$/i, 'cpu'], [/last ned modell/i, 'download-cloud'], [/token|forbruk/i, 'coins'], [/api-nøkl|nøkkel/i, 'key'], [/jobber/i, 'list-todo'], [/stemme|opplesning/i, 'audio-lines'], [/brief/i, 'sunrise'], [/figur/i, 'smile'], [/personvern/i, 'shield-check'], [/chat/i, 'message-circle'],
  [/^versjon|programvareversjon|nordlys os/i, 'info'], [/se etter oppdatering/i, 'search'], [/automatiske oppdateringer|oppdater automatisk/i, 'refresh-ccw'], [/tidligere versjoner/i, 'history'], [/oppdater/i, 'download'], [/^logg$|vis logg|logg /i, 'scroll-text'], [/lagring|disk/i, 'hard-drive'], [/nettverk|ip-adresse|lan/i, 'network'], [/start på nytt|restart/i, 'power'],
  [/kalender/i, 'calendar'], [/bruker/i, 'users'], [/integrasjon/i, 'plug'], [/sted|posisjon/i, 'map-pin'], [/lyd/i, 'volume'], [/mappe/i, 'folder'], [/slett|fjern/i, 'trash'], [/tilbakestill/i, 'rotate-ccw'], [/endre|rediger/i, 'pencil'],
];
const DANGER = /^(logg ut|slett|fjern|tilbakestill)/i;
export function iconFor(title) {
  const t = String(title ?? '').trim();
  for (const [re, k] of MAP) if (re.test(t)) return k;
  return 'info';
}
const svg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
export function chipHtml(k, tone = '', badge = false) {
  return `<span class="si36${tone ? ` si36-${tone}` : ''}" aria-hidden="true">${svg(L[k] ?? L.info)}${badge ? `<span class="si36-b">${svg(ALERT)}</span>` : ''}</span>`;
}

/** Legger ikonbrikke på rader som ikke har ikon, logo eller avatar fra før. */
export function decorateRows(root) {
  root.querySelectorAll('.sg-row:not([data-si36])').forEach((r) => {
    r.dataset.si36 = '1';
    if (r.querySelector(':scope > .sg-av,:scope > .sg-lg,:scope > .lg,:scope > .sg-ic,:scope > img,:scope > .si36,:scope > .kal-sc-dot,:scope > .set-ic,:scope > .bk-ic,:scope > [class*="-ic"]')) return;
    const b = r.querySelector('.sg-txt b, :scope > b, :scope > span > b');
    const t = b?.textContent ?? r.textContent;
    if (!t?.trim()) return;
    const danger = DANGER.test(t.trim()) || r.classList.contains('danger');
    const v = r.querySelector('.sg-v')?.textContent ?? '';
    const st = /^(siste backup|status)/i.test(t.trim()) ? (/feil|failed|mislyk/i.test(v + r.textContent) ? 'red' : /ok|✓|verifisert/i.test(v + r.textContent) ? 'green' : '') : '';
    // Prompt 66: tittelen er ofte et navn (entiteter, oppgaver) – da velges ikonet etter underteksten.
    let k = iconFor(t);
    if (k === 'info') { const sub = r.querySelector('.sg-txt > span')?.textContent ?? ''; if (sub) k = iconFor(sub); }
    r.insertAdjacentHTML('afterbegin', chipHtml(k, danger ? 'red' : st, /backup feiler/i.test(t)));
    if (danger && b) b.classList.add('si36-dt');
  });
  // Prompt 66: kalender- og fagrader (fargeprikk foran tittelen) får flis; prikken blir 9 px merke nederst til høyre på flisen.
  root.querySelectorAll('.sg-row.kal-sc:not([data-si66])').forEach((r) => {
    r.dataset.si66 = '1';
    const dot = r.querySelector(':scope > .kal-sc-dot');
    if (!dot) return;
    dot.insertAdjacentHTML('beforebegin', chipHtml(r.classList.contains('kal40-row') ? 'calendar' : 'palette'));
    dot.previousElementSibling.appendChild(dot);
  });
  // Prompt 66 (Ikoner på alt): Glimt-radene (glimt35 .gs-row) får samme 28 px flis.
  root.querySelectorAll(':is(.gs-row,.gs40-snd,.gs-seg-w,.gs-opt):not([data-si36])').forEach((r) => {
    r.dataset.si36 = '1';
    if (r.querySelector(':scope > .si36,:scope > .gs40-ji,:scope > [class*="-ic"]')) return;
    const t = r.querySelector('.gs-ot b, .gs-on b, .gs-seg-l b, b')?.textContent ?? '';
    const k = r.matches('.gs-opt:not(.gs-voice)') ? 'audio-lines' : r.matches('.gs-voice') ? 'volume' : iconFor(t);
    if (!t.trim()) return;
    r.insertAdjacentHTML('afterbegin', chipHtml(k));
  });
  // Prompt 66: undertekstene er én linje med ellipsis på web – hele teksten som verktøytips.
  root.querySelectorAll('.sg-row > .sg-txt > span:first-of-type:not([title]):not([role]), .gs-row .gs-os:not([title])').forEach((s) => { const x = s.textContent.trim(); if (x) s.title = x; });
}
