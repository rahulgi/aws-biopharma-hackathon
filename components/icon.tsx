import type { SVGProps } from "react";

export type IconName =
  | "activity"
  | "arrow"
  | "check"
  | "chevron"
  | "database"
  | "download"
  | "external"
  | "file"
  | "flask"
  | "layers"
  | "refresh"
  | "search"
  | "shield"
  | "spark"
  | "users";

const paths: Record<IconName, React.ReactNode> = {
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
  external: (
    <path d="M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
  ),
  file: <path d="M7 3h7l4 4v14H7zM14 3v5h5M10 13h5m-5 4h5" />,
  flask: (
    <path d="M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8" />
  ),
  layers: <path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
  refresh: (
    <path d="M20 7v5h-5M4 17v-5h5m9.5-3A7 7 0 0 0 6 6l-2 3m2 6a7 7 0 0 0 12.5-3l1.5-2" />
  ),
  search: <path d="m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
  shield: (
    <path d="M12 3 4.5 6v5.5c0 4.8 3.1 8.1 7.5 9.5 4.4-1.4 7.5-4.7 7.5-9.5V6zM8.5 12l2.2 2.2 4.8-5" />
  ),
  spark: (
    <path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  ),
  users: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  ),
};

export function Icon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
