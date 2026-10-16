
import { memo, useMemo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { IC, type IconName } from './icons';

type Node = {
  tag: 'path' | 'circle' | 'rect';
  a: Record<string, string>;
};

const cache: Record<string, Node[]> = {};

function parse(name: string): Node[] {
  if (cache[name]) return cache[name];

  const src = IC[name] || '';
  const out: Node[] = [];

  const re = /<(path|circle|rect)\s+([^>]*?)\/>/g;

  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    const a: Record<string, string> = {};
    const are = /([\w-]+)="([^"]*)"/g;

    let x: RegExpExecArray | null;

    while ((x = are.exec(m[2]))) {
      a[x[1]] = x[2];
    }

    out.push({
      tag: m[1] as Node['tag'],
      a,
    });
  }

  cache[name] = out;
  return out;
}

export interface IconProps {
  name: IconName | string;
  size?: number;
  color: string;
  stroke?: number;
}

export const Icon = memo(function Icon({
  name,
  size = 20,
  color,
  stroke = 2,
}: IconProps) {
  const nodes = useMemo(() => parse(name), [name]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nodes.map((n, i) =>
        n.tag === 'path' ? (
          <Path key={i} d={n.a.d} />
        ) : n.tag === 'circle' ? (
          <Circle
            key={i}
            cx={Number(n.a.cx)}
            cy={Number(n.a.cy)}
            r={Number(n.a.r)}
          />
        ) : (
          <Rect
            key={i}
            x={Number(n.a.x)}
            y={Number(n.a.y)}
            width={Number(n.a.width)}
            height={Number(n.a.height)}
            rx={Number(n.a.rx || 0)}
          />
        )
      )}
    </Svg>
  );
});
