const P: Record<string, string> = {
  back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', check: 'M5 12l5 5 9-10',
  play: 'M7 4l13 8-13 8z', pause: 'M7 4h4v16H7zM14 4h4v16h-4z', undo: 'M8 5L3 10l5 5M3 10h11a6 6 0 010 12h-3', redo: 'M16 5l5 5-5 5M21 10H10a6 6 0 000 12h3',
  split: 'M12 3v18M6 8l-3 4 3 4M18 8l3 4-3 4', scissors: 'M6 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8 7l12 11M8 17L20 6',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z', text: 'M5 5h14M12 5v15M9 20h6',
  fx: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2zM19 3v4M17 5h4', filter: 'M12 3a9 9 0 100 18 4 4 0 010-8 5 5 0 000-10z', sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', sticker: 'M4 4h16v10l-6 6H4zM14 20v-6h6', frame: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', speed: 'M12 21a9 9 0 119-9M12 12l5-5',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 010 8M19 5a9 9 0 010 14', mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6', trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14', copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  swap: 'M4 8h13l-3-3M20 16H7l3 3', motion: 'M3 12h4M5 7h6M5 17h6M14 5l7 7-7 7z', cube: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10', wand: 'M4 20L15 9M17 3v4M15 5h4M20 11v3M18.5 12.5h3M9 3v3M7.5 4.5h3',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  home: 'M3 11l9-8 9 8M6 9v12h12V9', mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  cloud: 'M7 18a5 5 0 01-.5-10A6 6 0 0118 9a4.5 4.5 0 01-1 9z', download: 'M12 4v12M7 11l5 5 5-5M4 20h16', share: 'M12 15V3M8 7l4-4 4 4M5 12v9h14v-9', beat: 'M3 12h3l2-6 4 13 3-9 2 2h4', flip: 'M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z', rotate: 'M4 12a8 8 0 1014 -5M18 3v4h-4', wave: 'M3 12c3-6 5-6 7 0s4 6 7 0 3-3 4-2', settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
};
export function Icon({ n, s = 22 }: { n: keyof typeof P | string; s?: number }) {
  const filled = n === 'play' || n === 'pause';
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={P[n] ?? ''} /></svg>;
}
