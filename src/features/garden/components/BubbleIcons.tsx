// Low-poly icons for the farm's action bubbles and buttons: a cut-stone water drop, a faceted apple,
// a chunky lightning bolt and a cut sparkle. Flat planes lit from the upper left (a bright plane
// towards the sun, deep ones away from it, a white chip), no gradients, no filters. Decorative: the
// control they sit in carries the label.

type IconProps = { className?: string; size?: number }
type Plane = readonly [points: string, fill: string]

const Icon = ({ name, planes, className, size = 20 }: IconProps & { name: string; planes: readonly Plane[] }) => (
  <svg aria-hidden data-icon={name} viewBox="0 0 24 24" width={size} height={size} className={className} strokeLinejoin="round">
    {planes.map(([points, fill], i) => (
      <polygon key={i} points={points} fill={fill} stroke={fill} strokeWidth="0.4" />
    ))}
  </svg>
)

// 💧 A water drop cut like a stone: six planes round an off-centre peak.
const DROP: Plane[] = [
  ['13.6,3.4 20.1,13.9 18.6,19.9 13.6,23.4 8.6,19.9 7.1,13.9', '#0b4a86'],
  ['12,2 18.5,12.5 10.6,13', '#4fc3f7'],
  ['18.5,12.5 17,18.5 10.6,13', '#1e88d6'],
  ['17,18.5 12,22 10.6,13', '#1565b0'],
  ['12,22 7,18.5 10.6,13', '#1976c8'],
  ['7,18.5 5.5,12.5 10.6,13', '#5ccbf9'],
  ['5.5,12.5 12,2 10.6,13', '#c4f0ff'],
  ['8.2,12.4 10.4,8.2 10.6,11.6', '#ffffff'],
]
export const WaterDropIcon = (props: IconProps) => <Icon name="water" planes={DROP} {...props} />

// 🍎 A faceted apple with a stalk and a two-plane leaf.
const APPLE: Plane[] = [
  ['13.4,8.6 19.9,10.1 21.4,15.6 17.4,22.1 13.4,21.1 9.4,22.1 5.4,15.6 6.9,10.1', '#7a0f1c'],
  ['12,7 18.5,8.5 10.6,12.6', '#ff5a5f'],
  ['18.5,8.5 20,14 10.6,12.6', '#e02f3c'],
  ['20,14 16,20.5 10.6,12.6', '#b81d2c'],
  ['16,20.5 12,19.5 10.6,12.6', '#c92a36'],
  ['12,19.5 8,20.5 10.6,12.6', '#d83340'],
  ['8,20.5 4,14 10.6,12.6', '#ef4a52'],
  ['4,14 5.5,8.5 10.6,12.6', '#ff7b7b'],
  ['5.5,8.5 12,7 10.6,12.6', '#ffb0a8'],
  ['11.4,7.6 12.2,3.4 13.4,3.8 12.8,7.8', '#7a4a21'],
  ['12.8,5.6 16.6,2.6 18.4,5.2', '#8fdc5a'],
  ['12.8,5.6 18.4,5.2 15.4,7.2', '#2f9140'],
  ['6.6,11.6 8.6,9.6 8.8,12', '#ffffff'],
]
export const AppleIcon = (props: IconProps) => <Icon name="fruit" planes={APPLE} {...props} />

// ⚡ A lightning bolt with a thick shaded side: a lit upper plane, a deeper lower one.
const BOLT: Plane[] = [
  ['15.6,2.4 6.6,14.4 12.6,14.4 9.6,24 20.6,10.4 14.6,10.4', '#b45309'],
  ['14,1 5,13 11,13 13,9', '#fff3a3'],
  ['11,13 8,22.6 19,9 13,9', '#ffb703'],
  ['14,1 13,9 19,9 16.4,9 15.2,4.4', '#ffd23f'],
  ['12.6,3.6 9,8.6 11.4,8.2', '#ffffff'],
]
export const BoltIcon = (props: IconProps) => <Icon name="rush" planes={BOLT} {...props} />

// ✨ A four-point sparkle cut into eight planes, with a small one beside it.
const SPARK: Plane[] = [
  ['12.8,2.4 15.2,9.6 22.4,12.8 15.2,15.2 12.8,22.4 9.6,15.2 2.4,12.8 9.6,9.6', '#a16207'],
  ['12,1 12,12 9.4,9.4', '#fffbe0'],
  ['12,1 14.6,9.4 12,12', '#ffe066'],
  ['14.6,9.4 23,12 12,12', '#ffc21a'],
  ['23,12 14.6,14.6 12,12', '#e89a00'],
  ['14.6,14.6 12,23 12,12', '#d48806'],
  ['12,23 9.4,14.6 12,12', '#e89a00'],
  ['9.4,14.6 1,12 12,12', '#ffc21a'],
  ['1,12 9.4,9.4 12,12', '#fff3a3'],
  ['19.5,2 20.4,4.6 23,5.5 20.4,6.4 19.5,9 18.6,6.4 16,5.5 18.6,4.6', '#ffe066'],
]
export const SparkleIcon = (props: IconProps) => <Icon name="mastered" planes={SPARK} {...props} />
