export interface StageObject { kind: 'sphere' | 'box'; x: number; y: number; z: number; scale: number; yaw: number; color: string }
export interface StageLight { x: number; y: number; z: number; intensity: number; radius: number; color: string }
export interface SceneStage { version: 1; camera: { yaw: number; elevation: number; distance: number; fov: number }; objects: StageObject[]; lights: StageLight[] }
export const STAGE_COLORS = ['#d56a42', '#448cb5', '#70a66c', '#ded9ca', '#ffffff', '#ffd18a', '#94bbff'];
const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const color = (v: unknown) => typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v);
const keys = (value: unknown, allowed: string[]) => !!value && typeof value === 'object' && Object.keys(value).every(key => allowed.includes(key));
export function validSceneStage(value: unknown): value is SceneStage {
  const s = value as SceneStage;
  return keys(s,['version','camera','objects','lights']) && s.version === 1 && keys(s.camera,['yaw','elevation','distance','fov']) && bounded(s.camera.yaw, -180, 180) && bounded(s.camera.elevation, 5, 75)
    && bounded(s.camera.distance, 3, 16) && bounded(s.camera.fov, 25, 80)
    && Array.isArray(s.objects) && s.objects.length <= 4 && s.objects.every(o => keys(o,['kind','x','y','z','scale','yaw','color']) && ['sphere','box'].includes(o.kind)
      && bounded(o.x, -6, 6) && bounded(o.y, 0.25, 6) && bounded(o.z, -6, 6) && bounded(o.scale, 0.25, 3) && bounded(o.yaw, -180, 180) && color(o.color))
    && Array.isArray(s.lights) && s.lights.length === 3 && s.lights.every(l => keys(l,['x','y','z','intensity','radius','color']) && bounded(l.x, -8, 8) && bounded(l.y, 0.5, 10)
      && bounded(l.z, -8, 8) && bounded(l.intensity, 0, 5) && bounded(l.radius, 0, 2) && color(l.color));
}
export function newSceneStage(): SceneStage {
  return { version: 1, camera: { yaw: 25, elevation: 18, distance: 7, fov: 45 },
    objects: [{ kind: 'box', x: -0.9, y: 0.75, z: 0, scale: 1.5, yaw: 20, color: '#d56a42' },
      { kind: 'sphere', x: 1, y: 0.8, z: 0, scale: 1.6, yaw: 0, color: '#448cb5' }],
    lights: [{ x: -3, y: 5, z: 3, intensity: 3, radius: 0.6, color: '#ffd18a' },
      { x: 4, y: 3, z: 1, intensity: 1, radius: 1, color: '#94bbff' },
      { x: 0, y: 5, z: -4, intensity: 2, radius: 0.4, color: '#ffffff' }] };
}

/** Bounded, deterministic ray rendering. Self-contained so the native WebView uses identical code. */
export function renderSceneStage(scene: SceneStage, width = 320, height = 180) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 320 || height > 180
    || scene.objects.length > 4 || scene.lights.length !== 3) throw new Error('Invalid stage render budget');
  const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
  if (scene.version !== 1 || !finite(scene.camera.yaw,-180,180) || !finite(scene.camera.elevation,5,75) || !finite(scene.camera.distance,3,16) || !finite(scene.camera.fov,25,80)) throw new Error('Invalid stage camera');
  for(let i=0;i<scene.objects.length;i++) { const o=scene.objects[i];if(!['box','sphere'].includes(o.kind)||!finite(o.x,-6,6)||!finite(o.y,0.25,6)||!finite(o.z,-6,6)||!finite(o.scale,0.25,3)||!finite(o.yaw,-180,180)||!/^#[a-f0-9]{6}$/i.test(o.color))throw new Error('Invalid stage object'); }
  for(let i=0;i<scene.lights.length;i++) { const l=scene.lights[i];if(!finite(l.x,-8,8)||!finite(l.y,0.5,10)||!finite(l.z,-8,8)||!finite(l.intensity,0,5)||!finite(l.radius,0,2)||!/^#[a-f0-9]{6}$/i.test(l.color))throw new Error('Invalid stage light'); }
  type V = number[];
  const add = (a: V, b: V): V => a.map((n, i) => n + b[i]);
  const sub = (a: V, b: V): V => a.map((n, i) => n - b[i]);
  const mul = (a: V, n: number): V => a.map(v => v * n);
  const dot = (a: V, b: V) => a.reduce((n, v, i) => n + v * b[i], 0);
  const norm = (a: V): V => mul(a, 1 / Math.max(1e-8, Math.sqrt(dot(a, a))));
  const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const rgb = (hex: string): V => [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16) / 255);
  const rotate = (v: V, angle: number): V => [v[0]*Math.cos(angle)-v[2]*Math.sin(angle), v[1], v[0]*Math.sin(angle)+v[2]*Math.cos(angle)];
  const meshes = scene.objects.map(o => ({ kind:o.kind, scale:o.scale, center: [o.x,o.y,o.z], angle: o.yaw*Math.PI/180, rgb: rgb(o.color) }));
  const intersect = (origin: V, direction: V, floor = true) => {
    let distance = 1e6, normal: V = [0,1,0], material: V = [0.42,0.44,0.46];
    if (floor && direction[1] < -1e-6) { const t = -origin[1]/direction[1]; if (t > 0.001) distance=t; }
    for (let m=0;m<meshes.length;m++) {
      const mesh=meshes[m];
      const p = rotate(sub(origin, mesh.center), -mesh.angle), d = rotate(direction, -mesh.angle), r = mesh.scale/2;
      let t = 1e6, n: V = [0,1,0];
      if (mesh.kind === 'sphere') {
        const b = dot(p,d), disc = b*b-dot(p,p)+r*r;
        if (disc >= 0) { const near=-b-Math.sqrt(disc), far=-b+Math.sqrt(disc); t=near>0.001?near:far; n=norm(add(p,mul(d,t))); }
      } else {
        let near=-1e6, far=1e6, axis=0, sign=1, farAxis=0, farSign=1;
        for (let i=0;i<3;i++) {
          if (Math.abs(d[i])<1e-8) { if (Math.abs(p[i])>r) { far=-1e6; break; } continue; }
          const a=(-r-p[i])/d[i], b=(r-p[i])/d[i], low=Math.min(a,b), high=Math.max(a,b);
          if (low>near) { near=low; axis=i; sign=d[i]>0?-1:1; }
          if(high<far){far=high;farAxis=i;farSign=d[i]>0?1:-1;}
        }
        if (far>=near && far>0.001) {const inside=near<=0.001;t=inside?far:near;n=[0,0,0];n[inside?farAxis:axis]=inside?farSign:sign;}
      }
      if (t>0.001 && t<distance) { distance=t; normal=rotate(n,mesh.angle); material=mesh.rgb; }
    }
    return { distance, normal, material };
  };
  const radians=Math.PI/180, yaw=scene.camera.yaw*radians, elevation=scene.camera.elevation*radians;
  const origin=[Math.sin(yaw)*Math.cos(elevation)*scene.camera.distance, 1+Math.sin(elevation)*scene.camera.distance, Math.cos(yaw)*Math.cos(elevation)*scene.camera.distance];
  const forward=norm(sub([0,1,0],origin)), right=norm(cross(forward,[0,1,0])), up=cross(right,forward), fov=Math.tan(scene.camera.fov*radians/2);
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const direction=norm(add(forward,add(mul(right,((x+0.5)/width*2-1)*fov*width/height),mul(up,(1-(y+0.5)/height*2)*fov))));
    const hit=intersect(origin,direction), value: V=[0.07,0.085,0.11];
    if(hit.distance<1e5) {
      const point=add(origin,mul(direction,hit.distance)), start=add(point,mul(hit.normal,0.002));
      for(let c=0;c<3;c++) value[c]=hit.material[c]*0.1;
      for(let l=0;l<scene.lights.length;l++) {
        const light=scene.lights[l];
        if(light.intensity<=0) continue;
        const lightColor=rgb(light.color);
        // Four fixed area-light samples provide repeatable diffusion and soft shadow edges.
        for(let sample=0;sample<4;sample++) {
          const offset=[sample<2?-0.5:0.5,sample%2?-0.5:0.5];
          const delta=sub([light.x+offset[0]*light.radius,light.y,light.z+offset[1]*light.radius],start), d2=dot(delta,delta), ray=norm(delta);
          if(intersect(start,ray,false).distance<Math.sqrt(d2)-0.004) continue;
          const strength=Math.max(0,dot(hit.normal,ray))*light.intensity/(1+d2*0.12)/4;
          for(let c=0;c<3;c++) value[c]+=hit.material[c]*lightColor[c]*strength;
        }
      }
    }
    const at=(y*width+x)*4;
    for(let c=0;c<3;c++) pixels[at+c]=Math.round(255*Math.pow(Math.max(0,Math.min(1,value[c])),1/2.2));
    pixels[at+3]=255;
  }
  return { width,height,pixels };
}

/** No external origins, scripts, arbitrary markup or user-authored code enter the native renderer. */
export function sceneStageDocument(scene: SceneStage) {
  if (!validSceneStage(scene)) throw new Error('Invalid stage');
  const revision=JSON.stringify(scene);
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:"><style>html,body{margin:0;background:#151a20}canvas{display:block;width:100%;height:auto}</style><canvas width="160" height="90"></canvas><script>const render=${renderSceneStage.toString()};const scene=${revision};const revision=${JSON.stringify(revision)};const result=render(scene,160,90);const canvas=document.querySelector('canvas');canvas.getContext('2d').putImageData(new ImageData(result.pixels,result.width,result.height),0,0);window.stageCapture=()=>{const image=render(scene,320,180);const out=document.createElement('canvas');out.width=320;out.height=180;out.getContext('2d').putImageData(new ImageData(image.pixels,320,180),0,0);window.ReactNativeWebView.postMessage(JSON.stringify({type:'frame',revision,url:out.toDataURL('image/png'),width:320,height:180}));};window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready',revision}));</script>`;
}
