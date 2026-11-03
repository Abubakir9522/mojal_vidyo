export const VERT = `#version 300 es
in vec2 a; out vec2 uv; void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;

export const LIB = `
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
float rand(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rand(i),rand(i+vec2(1.,0.)),f.x),mix(rand(i+vec2(0.,1.)),rand(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
mat2 rot(float a){float c=cos(a);float s=sin(a);return mat2(c,-s,s,c);}
vec3 hsv(vec3 c){vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-5)),d/(q.x+1e-5),q.x);}
`;

const HEAD = `#version 300 es
precision highp float;in vec2 uv;out vec4 o;`;

export const fxFrag = (body: string) => `${HEAD}
uniform sampler2D tex;uniform float t;uniform float amt;uniform vec2 res;
vec4 S(vec2 p){return texture(tex,p);}
${LIB}
${body}
void main(){o=fx(uv);}`;

export const trFrag = (body: string) => `${HEAD}
uniform sampler2D ta;uniform sampler2D tb;uniform float pr;uniform vec2 res;
vec4 A(vec2 p){return texture(ta,p);}
vec4 B(vec2 p){return texture(tb,p);}
${LIB}
${body}
void main(){o=tr(uv);o.a=1.;}`;

/** Draws a source (video frame, photo, canvas) into the project frame with fit, transform, 3D tilt and orientation. */
export const SRC_FRAG = `${HEAD}
uniform sampler2D tex;
uniform float outAspect,srcAspect,scale,rotation,tiltX,tiltY,opacity,cover;
uniform vec2 offset,flip;uniform int srcRot;uniform vec3 bg;uniform float bgOn;
void main(){
  vec2 p=uv-.5;p.x*=outAspect;
  p-=offset*vec2(outAspect,1.);
  float c=cos(-rotation),s=sin(-rotation);p=mat2(c,-s,s,c)*p;
  float w=1.+tiltY*p.x+tiltX*p.y;p/=max(w,.05);
  p/=scale;
  float h=cover>.5?max(1.,outAspect/srcAspect):min(1.,outAspect/srcAspect);
  p/=h;p.x/=srcAspect;
  p*=flip;
  vec2 m=abs(p);
  float edge=smoothstep(.5,.4985,m.x)*smoothstep(.5,.4985,m.y);
  vec2 q;
  if(srcRot==90)q=vec2(-p.y,p.x);else if(srcRot==180)q=-p;else if(srcRot==270)q=vec2(p.y,-p.x);else q=p;
  vec2 st=vec2(q.x+.5,.5-q.y);
  vec4 col=texture(tex,st);
  col.a*=edge*opacity;
  if(bgOn>.5){o=vec4(mix(bg,col.rgb,col.a),1.);}else{o=col;}
}`;

export const ADJUST_FRAG = `${HEAD}
uniform sampler2D tex;uniform vec2 res;
uniform float brightness,contrast,saturation,temperature,tint,vignette,sharpen,fade;
void main(){
  vec4 s=texture(tex,uv);vec3 c=s.rgb;
  if(sharpen>0.){vec2 e=1.2/res;vec3 b=(texture(tex,uv+vec2(e.x,0.)).rgb+texture(tex,uv-vec2(e.x,0.)).rgb+texture(tex,uv+vec2(0.,e.y)).rgb+texture(tex,uv-vec2(0.,e.y)).rgb)*.25;c+=(c-b)*sharpen*3.;}
  c*=vec3(1.+temperature*.3,1.+tint*.2,1.-temperature*.3);
  c+=brightness*.5;
  c=(c-.5)*(1.+contrast)+.5;
  float l=dot(c,vec3(.299,.587,.114));
  c=mix(vec3(l),c,1.+saturation);
  if(fade>0.)c=mix(c,vec3(.5),fade*.4)+fade*.05;
  if(vignette>0.)c*=1.-smoothstep(.3,.85,length(uv-.5))*vignette;
  o=vec4(clamp(c,0.,1.),s.a);
}`;

export const BLIT_FRAG = `${HEAD}
uniform sampler2D tex;void main(){o=texture(tex,uv);}`;

/** Layer compositing for overlays and text. Output is premultiplied for GL blending. */
export const LAYER_FRAG = `${HEAD}
uniform sampler2D tex;uniform sampler2D base;uniform int mode;uniform float flipY;
void main(){
  vec4 s=texture(tex,flipY>.5?vec2(uv.x,1.-uv.y):uv);vec3 b=texture(base,uv).rgb;vec3 c;
  if(mode==1)c=1.-(1.-b)*(1.-s.rgb);else if(mode==2)c=b*s.rgb;else if(mode==3)c=min(b+s.rgb,vec3(1.));else c=s.rgb;
  o=vec4(mix(b,c,s.a),1.);
}`;
