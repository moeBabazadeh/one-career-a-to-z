// A small set of 16px line icons in the spirit of a desktop git client.
const PATHS = {
  readme:
    'M2.5 3c2-.5 4-.3 5.5 1 1.5-1.3 3.5-1.5 5.5-1v10c-2-.5-4-.3-5.5 1-1.5-1.3-3.5-1.5-5.5-1zM8 4v10',
  commit: 'M1 8h4M11 8h4M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  branch:
    'M5 5.2v5.6M11 6.2c0 3-6 2.2-6 4.6M5 1.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM5 10.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM11 2.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  pr: 'M4.5 5.2v5.6M11.5 10.8V6.2c0-1.2-.8-2-2-2h-2M9 2.6 7.5 4.2 9 5.8M4.5 1.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM4.5 10.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM11.5 10.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  release: 'M8 1.8 14 5v6l-6 3.2L2 11V5zM2 5l6 3.2L14 5M8 8.2v6',
  chip: 'M5 4h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM6.5 1.5V4M9.5 1.5V4M6.5 12v2.5M9.5 12v2.5M1.5 6.5H4M1.5 9.5H4M12 6.5h2.5M12 9.5h2.5',
  tag: 'M2 2.5h5.3L14 9.2 9.2 14 2.5 7.3zM5.2 4.4a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
  remote: 'M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5',
  search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.4 10.4 14 14',
  copy: 'M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM3 10.5V3.5a1 1 0 0 1 1-1h7',
  close: 'M4 4l8 8M12 4l-8 8',
  replay: 'M3.2 9.5A5 5 0 1 0 4.6 4.4M2.8 2v3h3',
  external: 'M6.5 3H13v6.5M13 3 3.5 12.5',
  check: 'M3 8.5 6.5 12 13 4.5',
  sun: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06',
  moon: 'M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z',
  system:
    'M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM6 14.5h4M8 11.5v3',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
