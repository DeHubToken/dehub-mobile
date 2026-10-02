// Geometry and irregular discharge timing from the approved logo preview.
export type Point = [number, number];
export type Bolt = { points: Point[]; colour: string; opacity: number; width: number };
export type ElectricFrame = { bolts: Bolt[]; x: number; y: number; charged: boolean; held: boolean };
export const idleFrame: ElectricFrame = { bolts: [], x: 0, y: 0, charged: false, held: false };
const random = (a: number, b: number) => a + Math.random() * (b - a);
const outline: Point[] = [[19.71, 0.0], [19.71, 2.78], [19.71, 6.02], [19.71, 9.73], [18.79, 12.98], [17.42, 16.22], [15.12, 19.0], [12.83, 22.24], [9.17, 24.1], [5.96, 25.95], [-5.96, 25.95], [-9.62, 24.56], [-12.83, 22.71], [-15.58, 19.93], [-17.88, 16.68], [-19.25, 13.44], [-20.17, 9.73], [-20.62, 6.49], [-20.62, 3.24], [-20.62, 0.0], [-20.62, -3.24], [-20.62, -6.49], [-20.62, -10.2], [-20.62, -14.37], [-14.67, -13.44], [-3.67, -4.63], [-3.67, -6.95], [-3.67, -9.73], [-3.67, -17.15], [-1.83, -26.41], [1.83, -26.88], [3.21, -14.83], [3.21, -8.8], [3.21, -6.02], [3.21, -4.17], [15.58, -14.37], [19.71, -13.44], [19.71, -9.73], [19.71, -6.02], [19.71, -2.78]];
const arms = [outline.slice(10, 24), outline.slice(24, 35), outline.slice(35).concat(outline.slice(0, 10))];
type Arc = { arm: number; pos: number; span: number; born: number; life: number; colour: string; geometry: number; points: Point[]; branches: Point[][]; trail: boolean; drift: number };
function surface(arm: Point[], pos: number, offset: number): Point {
  const i = Math.min(arm.length - 2, Math.floor(pos)), f = pos - i, a = arm[i], b = arm[i + 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
  return [a[0] + dx * f - dy / length * offset, a[1] + dy * f + dx / length * offset];
}
export function createElectricity() {
  const arcs: Arc[] = [], next = [0, 0, 0];
  let x = 0, y = 0, tx = 0, ty = 0, nextShake = 0;
  return (elapsed: number, reduced = false): ElectricFrame => {
    const charged = elapsed >= 3000, overload = elapsed >= 10000, over = Math.min(1, Math.max(0, (elapsed - 10000) / 5000));
    if (!charged || reduced) return { ...idleFrame, held: true, charged };
    if (elapsed >= nextShake) {
      const strength = overload ? 1.1 + over * 1.1 : .35 + Math.min(1, (elapsed - 3000) / 7000) * .35;
      nextShake = elapsed + random(25, 65); tx = random(-strength, strength); ty = random(-strength, strength);
    }
    x += (tx - x) * .65; y += (ty - y) * .65;
    arms.forEach((arm, j) => {
      if (elapsed < next[j]) return;
      next[j] = elapsed + random(overload ? 35 : 80, overload ? 130 : 260);
      const count = Math.random() < .3 ? 2 : 1;
      for (let n = 0; n < count; n++) arcs.push({ arm: j, pos: random(0, arm.length - 4), span: random(1.5, 3.8), born: elapsed, life: random(90, 210), colour: Math.random() < .5 ? '#ffe86c' : '#72d9ff', geometry: 0, points: [], branches: [], trail: Math.random() < .5, drift: random(-.4, .4) });
    });
    const bolts: Bolt[] = [];
    for (let d = arcs.length - 1; d >= 0; d--) {
      const arc = arcs[d], age = elapsed - arc.born;
      if (age > arc.life) { arcs.splice(d, 1); continue; }
      const arm = arms[arc.arm], progress = age / arc.life;
      if (elapsed >= arc.geometry) {
        arc.geometry = elapsed + random(28, 65); arc.points = []; arc.branches = [];
        for (let k = 0; k < 10; k++) arc.points.push(surface(arm, Math.min(arm.length - 1, Math.max(0, arc.pos + arc.span * k / 9 + arc.drift * progress)), k === 0 || k === 9 ? 0 : random(-1.5, 1.5)));
        const count = Math.random() < .6 ? 1 : 2;
        for (let k = 0; k < count; k++) {
          const origin = arc.points[Math.floor(random(2, 8))], angle = Math.atan2(origin[1], origin[0]) + random(-.8, .8), reach = arc.trail ? random(5, overload ? 20 : 13) : random(2, 5);
          arc.branches.push([origin, [origin[0] + Math.cos(angle) * reach * .35 + random(-1.5, 1.5), origin[1] + Math.sin(angle) * reach * .35 + random(-1.5, 1.5)], [origin[0] + Math.cos(angle) * reach * .65 + random(-2, 2), origin[1] + Math.sin(angle) * reach * .65 + random(-2, 2)], [origin[0] + Math.cos(angle) * reach, origin[1] + Math.sin(angle) * reach]]);
        }
      }
      const opacity = Math.min(1, age / 15) * Math.pow(1 - progress, .55) * (Math.random() < .08 ? .3 : random(.75, 1));
      bolts.push({ points: arc.points, colour: arc.colour, opacity, width: 1.1 });
      arc.branches.forEach(points => bolts.push({ points, colour: arc.colour, opacity: opacity * .65, width: .65 }));
    }
    return { bolts, x, y, held: true, charged };
  };
}
