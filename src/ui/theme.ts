export const colors = {
  paper: '#F6F3EC',
  card: '#FFFFFF',
  ink: '#1A3C34',
  muted: '#5C675F',
  line: '#E5DFD4',
  cream: '#F8F3EA',
  gold: '#E8C98A',
  wait: '#8A5A12',
  waitBg: '#F8EBD6',
  move: '#1E4D7B',
  moveBg: '#E4EEF7',
  safe: '#1E6B45',
  safeBg: '#E5F3EB',
  stop: '#8E2F2F',
  stopBg: '#F8E6E4',
};

export const toneColor = {
  wait: { fg: colors.wait, bg: colors.waitBg },
  move: { fg: colors.move, bg: colors.moveBg },
  safe: { fg: colors.safe, bg: colors.safeBg },
  stop: { fg: colors.stop, bg: colors.stopBg },
} as const;
