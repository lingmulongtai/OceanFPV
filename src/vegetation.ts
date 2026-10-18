import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type TreeSite={matrices:T.Matrix4[];fallback:T.InstancedMesh[]};
type TreePoint={matrix:T.Matrix4;position:T.Vector3;scale:T.Vector3;yaw:number};
/** Captured coastal-tree geometry close to the pilot; model-derived multi-view
 * impostors cover distant forests without drawing hundreds of million faces. */
export class CoastalForest {
  readonly group=new T.Group();
  readonly sourceTriangles:number;
  private readonly points:TreePoint[];
  private readonly sprites:T.InstancedMesh;
  private readonly frame:T.InstancedBufferAttribute;
  private readonly near:T.InstancedMesh[]=[];
  private readonly spriteMaterial:T.MeshBasicMaterial;
  private readonly atlas:T.WebGLRenderTarget;
  private readonly bakeScene=new T.Scene();
  private readonly bakeCamera:T.OrthographicCamera;
  private readonly span:number;
  private lastUpdate=-Infinity;
  private lastCamera=new T.Vector3(Infinity,Infinity,Infinity);
  private quality='high';
  private light='';

  static async load(renderer:T.WebGLRenderer,sites:TreeSite[],lighting:T.Scene,lightingReady:Promise<unknown>,onReady?:(forest:CoastalForest)=>void) {
    performance.mark('oceanfpv:tree-model-start');
    const manager=new T.LoadingManager(),loader=new GLTFLoader(manager);let timer:ReturnType<typeof setTimeout>|undefined,expired=false;
    try {
      const url=new URL(`${import.meta.env.BASE_URL}models/island_tree_02/island_tree_02_1k.gltf`,document.baseURI);
      const pending=loader.loadAsync(url.href).then(model=> {
        if(expired)model.scene.traverse(object=>{if(object instanceof T.Mesh)object.geometry.dispose();});return model;
      });
      const model=await Promise.race([pending,new Promise<never>((_,reject)=> {timer=setTimeout(()=>{expired=true;manager.abort();reject(new Error('Tree asset deadline'));},45000);})]);
      performance.mark('oceanfpv:tree-model-ready');
      clearTimeout(timer);model.scene.updateMatrixWorld(true);
      await lightingReady;
      performance.mark('oceanfpv:tree-build-start');
      const forest=new CoastalForest(renderer,model.scene,sites.flatMap(site=>site.matrices),lighting);
      performance.mark('oceanfpv:tree-build-ready');
      // Publish in the same task as the bake so a queued light change can relight it.
      onReady?.(forest);return forest;
    } catch {performance.mark('oceanfpv:tree-load-failed');if(timer)clearTimeout(timer);return null;}
  }
  private constructor(renderer:T.WebGLRenderer,source:T.Group,matrices:T.Matrix4[],lighting:T.Scene) {
    this.points=matrices.map(matrix=>{const position=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();matrix.decompose(position,q,scale);return {matrix,position,scale,yaw:new T.Euler().setFromQuaternion(q,'YXZ').y};});
    const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),foot=new T.Vector3(),factor=10/size.y;let footSamples=0;
    source.traverse(object=> {
      if(!(object instanceof T.Mesh)||(object.material as T.Material).name!=='island_tree_02')return;
      const position=object.geometry.attributes.position,point=new T.Vector3();
      for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);if(point.y<bounds.min.y+size.y*0.03){foot.add(point);footSamples++;}}
    });
    if(footSamples)foot.divideScalar(footSamples);else bounds.getCenter(foot);
    this.span=2*Math.hypot(Math.max(Math.abs(bounds.min.x-foot.x),Math.abs(bounds.max.x-foot.x)),Math.max(Math.abs(bounds.min.z-foot.z),Math.abs(bounds.max.z-foot.z)))*factor*1.12;
    const templates:{geometry:T.BufferGeometry;material:T.MeshStandardMaterial}[]=[];
    let triangleCount=0;
    source.traverse(object=> {
      if(!(object instanceof T.Mesh))return;
      const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);geometry.translate(-foot.x,-bounds.min.y,-foot.z);geometry.scale(factor,factor,factor);
      const material=(object.material as T.MeshStandardMaterial).clone();if(!material.map)throw new Error('Incomplete tree textures');material.alphaTest=0.35;material.transparent=false;material.depthWrite=true;
      for(const property of Object.values(material))if(property instanceof T.Texture)property.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
      triangleCount+=(geometry.index?.count??geometry.attributes.position.count)/3;templates.push({geometry,material});
      const lit=material.clone();lit.side=T.DoubleSide;lit.metalness=0;lit.roughness=Math.max(0.85,lit.roughness);
      this.bakeScene.add(new T.Mesh(geometry,lit));
    });
    this.sourceTriangles=triangleCount;
    const tile=512;this.atlas=new T.WebGLRenderTarget(tile*4,tile*2,{depthBuffer:true});this.atlas.texture.colorSpace=T.SRGBColorSpace;
    this.atlas.texture.generateMipmaps=true;this.atlas.texture.minFilter=T.LinearMipmapLinearFilter;
    const half=this.span/2;this.bakeCamera=new T.OrthographicCamera(-half,half,half,-half,0.1,100);
    performance.mark('oceanfpv:tree-atlas-start');
    this.relight(renderer,lighting);
    performance.mark('oceanfpv:tree-atlas-submitted');
    this.spriteMaterial=new T.MeshBasicMaterial({map:this.atlas.texture,alphaTest:0.4,side:T.DoubleSide});
    this.spriteMaterial.onBeforeCompile=shader=> {
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float treeFrame;').replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=(vMapUv+vec2(mod(treeFrame,4.0),floor(treeFrame/4.0)))/vec2(4.0,2.0);');
      // Mips average opaque foliage with clear RGB=0; restore covered colour.
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;','sampledDiffuseColor.rgb/=max(sampledDiffuseColor.a,0.05);\ndiffuseColor *= sampledDiffuseColor;'));
    };
    this.spriteMaterial.customProgramCacheKey=()=> 'coastal-tree-atlas-coverage';
    const plane=new T.PlaneGeometry(1,1);this.frame=new T.InstancedBufferAttribute(new Float32Array(this.points.length),1);plane.setAttribute('treeFrame',this.frame);
    this.sprites=new T.InstancedMesh(plane,this.spriteMaterial,this.points.length);this.sprites.frustumCulled=false;this.group.add(this.sprites);
    // Separate bounds let each main, reflection and shadow camera reject hidden trees.
    for(const template of templates)for(let i=0;i<8;i++) {
      const mesh=new T.InstancedMesh(template.geometry,template.material,1);mesh.count=0;mesh.visible=false;mesh.castShadow=mesh.receiveShadow=true;
      this.near.push(mesh);this.group.add(mesh);
    }
  }
  /** Reuse the scene's HDR environment and lights when its preset changes. */
  relight(renderer:T.WebGLRenderer,lighting:T.Scene) {
    for(const object of [...this.bakeScene.children])if(object instanceof T.Light)this.bakeScene.remove(object);
    for(const object of lighting.children)if(object instanceof T.Light){const light=object.clone();light.castShadow=false;this.bakeScene.add(light);}
    this.bakeScene.environment=lighting.environment;this.bakeScene.environmentIntensity=lighting.environmentIntensity;this.bakeScene.environmentRotation.copy(lighting.environmentRotation);
    const tile=512,camera=this.bakeCamera;
    const previous={target:renderer.getRenderTarget(),ratio:renderer.getPixelRatio(),tone:renderer.toneMapping,clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest(),shadow:renderer.shadowMap.enabled};
    try {
      renderer.setPixelRatio(1);renderer.toneMapping=T.NoToneMapping;renderer.shadowMap.enabled=false;renderer.setClearColor(0x000000,0);renderer.setRenderTarget(this.atlas);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
      for(let view=0;view<8;view++) {
        const angle=view*Math.PI/4;camera.position.set(Math.sin(angle)*40,13,Math.cos(angle)*40);camera.lookAt(0,5,0);
        renderer.setViewport((view%4)*tile,Math.floor(view/4)*tile,tile,tile);renderer.setScissor((view%4)*tile,Math.floor(view/4)*tile,tile,tile);renderer.render(this.bakeScene,camera);
      }
    } finally {
      renderer.setPixelRatio(previous.ratio);renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.setClearColor(previous.clear,previous.alpha);renderer.toneMapping=previous.tone;renderer.shadowMap.enabled=previous.shadow;
    }
  }
  update(camera:T.Vector3,time:number,quality:string,light:string) {
    if(time-this.lastUpdate<0.1&&time>=this.lastUpdate&&quality===this.quality&&light===this.light&&camera.distanceToSquared(this.lastCamera)<0.25)return;
    this.lastCamera.copy(camera);
    this.lastUpdate=time;this.quality=quality;this.light=light;
    const limit=quality==='ultra'?8:quality==='high'?4:1;
    const closest=this.points.map((p,i)=>({i,d:p.position.distanceToSquared(camera)})).filter(p=>p.d<110*110).sort((a,b)=>a.d-b.d).slice(0,limit);
    const detailed=new Set(closest.map(p=>p.i));
    this.near.forEach((mesh,i)=> {
      const point=closest[i%8];mesh.count=point?1:0;mesh.visible=!!point;
      if(!point)return;
      mesh.setMatrixAt(0,this.points[point.i].matrix);mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
    });
    let spriteCount=0;
    for(let i=0;i<this.points.length;i++) {
      if(detailed.has(i))continue;const point=this.points[i],dx=camera.x-point.position.x,dz=camera.z-point.position.z,angle=Math.atan2(dx,dz);
      const view=((Math.round((angle-point.yaw)/(Math.PI*2)*8)%8)+8)%8;
      const center=point.position.clone().add(new T.Vector3(0,5*point.scale.y,0));
      const matrix=new T.Matrix4().compose(center,new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle),new T.Vector3(this.span*point.scale.x,this.span*point.scale.y,1));
      this.sprites.setMatrixAt(spriteCount,matrix);this.frame.setX(spriteCount,view);spriteCount++;
    }
    this.sprites.count=spriteCount;this.sprites.instanceMatrix.needsUpdate=true;this.frame.needsUpdate=true;
  }
}
