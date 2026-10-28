
import { newSceneStage, renderSceneStage, sceneStageDocument, validSceneStage, type SceneStage } from '../../libs/editor/sceneStage';
import { validFilmProject, remapFilmProjectMedia, filmShotDraft } from '../../libs/editor/filmProject';
const base = (): SceneStage => ({version:1,camera:{yaw:0,elevation:5,distance:6,fov:45},objects:[{kind:'sphere',x:0,y:1,z:0,scale:2,yaw:0,color:'#ff0000'}],
  lights:[{x:0,y:5,z:4,intensity:5,radius:0,color:'#ffffff'},{x:0,y:5,z:0,intensity:0,radius:0,color:'#ffffff'},{x:0,y:5,z:0,intensity:0,radius:0,color:'#ffffff'}]});
const center = (scene: SceneStage) => {const result=renderSceneStage(scene,33,19),at=(9*33+16)*4;return Array.from(result.pixels.slice(at,at+3));};
describe('editable physical scene stage',()=>{
  it('persists bounded scene state and rejects unsafe or unbounded input',()=>{
    expect(validSceneStage(JSON.parse(JSON.stringify(newSceneStage())))).toBe(true);
    for(const scene of [{...base(),objects:new Array(5).fill(base().objects[0])},{...base(),camera:{...base().camera,distance:Infinity}},{...base(),script:'</script>'}]) expect(validSceneStage(scene)).toBe(false);
    expect(()=>renderSceneStage(base(),321,180)).toThrow();
    expect(()=>sceneStageDocument({...base(),objects:[{...base().objects[0],color:'</script>'}]})).toThrow();
  });
  it('resolves front-to-back geometry independently of object array order',()=>{
    const scene=base();scene.objects=[{...scene.objects[0],z:0.6},{...scene.objects[0],z:-0.6,color:'#0000ff'}];
    expect(center(scene)[0]).toBeGreaterThan(center(scene)[2]);
    expect(Array.from(renderSceneStage(scene,33,19).pixels)).toEqual(Array.from(renderSceneStage({...scene,objects:[...scene.objects].reverse()},33,19).pixels));
    scene.objects[0].z=-2;expect(center(scene)[2]).toBeGreaterThan(center(scene)[0]);
  });
  it('a separate off-axis object physically occludes the light without covering the camera ray',()=>{
    const scene=base(),lit=center(scene)[0];
    scene.objects.push({kind:'box',x:0,y:3,z:2.5,scale:1,yaw:0,color:'#ffffff'});
    expect(center(scene)[0]).toBeLessThan(lit-30);
  });
  it('renders the exit surface when the camera is inside either supported solid',()=>{
    for(const kind of ['box','sphere'] as const){const scene=base();scene.camera.distance=3;
      scene.objects=[{kind,x:0,y:1.25,z:3,scale:3,yaw:0,color:'#ff0000'}];
      const pixel=center(scene);expect(pixel[0]).toBeGreaterThan(pixel[2]+30);
    }
  });
  it('camera, placement, rotation, color, intensity and diffusion change rendered pixels',()=>{
    const original=newSceneStage(),pixels=Array.from(renderSceneStage(original,32,18).pixels);
    const variants: SceneStage[]=[{...original,camera:{...original.camera,yaw:-40}},{...original,objects:original.objects.map((o,i)=>i?o:{...o,x:-3})},
      {...original,objects:original.objects.map((o,i)=>i?o:{...o,yaw:65})},{...original,lights:original.lights.map((l,i)=>i?l:{...l,color:'#0000ff'})},
      {...original,lights:original.lights.map((l,i)=>i?l:{...l,intensity:0})},{...original,lights:original.lights.map((l,i)=>i?l:{...l,radius:2})}];
    for(const scene of variants)expect(Array.from(renderSceneStage(scene,32,18).pixels)).not.toEqual(pixels);
  });
  it('native uses the same deterministic renderer with no remote fetch or navigation',()=>{
    const html=sceneStageDocument(base());
    expect(html).toContain(renderSceneStage.toString());expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/https?:\/\/|fetch\(|eval\(/);expect(html).toContain('width:320,height:180');
  });
  it('keeps editable scene state through project media remapping and hands the rendered reference to real shot drafts',()=>{
    const film={version:1 as const,title:'Film',brief:'',referenceMediaIds:[],shots:[{id:'shot',title:'Stage',prompt:'A quiet room',seconds:5,referenceMediaIds:['frame'],stage:newSceneStage()}]};
    const saved=JSON.parse(JSON.stringify(film));expect(validFilmProject(saved)).toBe(true);
    const restored=remapFilmProjectMedia(saved,new Map([['frame','cloud-frame']]));
    expect(restored.shots[0].stage).toEqual(film.shots[0].stage);
    const draft=filmShotDraft(restored,'shot','video',[{id:'cloud-frame',kind:'image',name:'Rendered stage',url:'https://private.test/frame.png'}],'16:9','project','owner');
    expect(draft?.references).toEqual([{url:'https://private.test/frame.png',label:'Rendered stage'}]);
    saved.shots[0].stage.camera.distance=NaN;expect(validFilmProject(saved)).toBe(false);
  });
});
