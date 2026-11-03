export type FxCat = 'filter' | 'style' | 'light' | 'retro' | 'glitch' | 'distort' | 'motion' | 'd3' | 'nature';
export const FX_CATS: { id: FxCat; name: string }[] = [
  { id: 'filter', name: 'Filtrlar' }, { id: 'd3', name: '3D' }, { id: 'light', name: 'Yorug\'lik' },
  { id: 'glitch', name: 'Glitch' }, { id: 'retro', name: 'Retro' }, { id: 'motion', name: 'Harakat' },
  { id: 'distort', name: 'Buzilish' }, { id: 'style', name: 'Uslub' }, { id: 'nature', name: 'Tabiat' },
];

export interface EffectDef { id: string; name: string; cat: FxCat; glsl: string; defaultAmount?: number }

interface Grade {
  sat?: number; con?: number; bri?: number; temp?: number; tint?: number; gamma?: number;
  lift?: [number, number, number]; gain?: [number, number, number];
  shadow?: [number, number, number]; high?: [number, number, number]; fade?: number; bw?: boolean;
}
const v3 = (a: [number, number, number]) => `vec3(${a.map(x => x.toFixed(3)).join(',')})`;

/** Builds a colour grade: per-zone tinting, lift/gamma/gain and saturation, blended by amount. */
function grade(g: Grade) {
  const lines = ['vec4 s=S(p);vec3 c=s.rgb;float l;'];
  if (g.bw) lines.push('c=vec3(lum(c));');
  if (g.temp || g.tint) lines.push(`c*=vec3(1.+(${(g.temp ?? 0).toFixed(3)}),1.+(${(g.tint ?? 0).toFixed(3)}),1.-(${(g.temp ?? 0).toFixed(3)}));`);
  if (g.lift) lines.push(`c=c+${v3(g.lift)}*(1.-c);`);
  if (g.gain) lines.push(`c*=${v3(g.gain)};`);
  if (g.gamma) lines.push(`c=pow(max(c,vec3(0.)),vec3(${g.gamma.toFixed(3)}));`);
  if (g.con) lines.push(`c=(c-.5)*(${(1 + g.con).toFixed(3)})+.5;`);
  if (g.bri) lines.push(`c+=(${g.bri.toFixed(3)});`);
  if (g.sat !== undefined) lines.push(`l=lum(c);c=mix(vec3(l),c,${g.sat.toFixed(3)});`);
  if (g.shadow || g.high) {
    lines.push('l=lum(c);');
    if (g.shadow) lines.push(`c+=${v3(g.shadow)}*(1.-smoothstep(0.,.55,l));`);
    if (g.high) lines.push(`c+=${v3(g.high)}*smoothstep(.45,1.,l);`);
  }
  if (g.fade) lines.push(`c=mix(c,vec3(.5),${g.fade.toFixed(3)})+${(g.fade * 0.18).toFixed(3)};`);
  lines.push('return vec4(mix(s.rgb,clamp(c,0.,1.),amt),s.a);');
  return `vec4 fx(vec2 p){${lines.join('')}}`;
}

const F = (id: string, name: string, g: Grade): EffectDef => ({ id, name, cat: 'filter', glsl: grade(g), defaultAmount: 1 });
const E = (cat: FxCat, id: string, name: string, glsl: string, defaultAmount = 0.7): EffectDef => ({ id, name, cat, glsl, defaultAmount });

const FILTERS: EffectDef[] = [
  F('f_atlas', 'Atlas', { sat: 1.45, con: 0.14, shadow: [0.05, -0.02, 0.1], high: [0.06, 0.0, -0.02] }),
  F('f_margilon', "Marg'ilon", { sat: 1.3, temp: 0.05, tint: -0.03, shadow: [0.09, 0.0, 0.12], con: 0.1 }),
  F('f_rishton', 'Rishton', { sat: 1.1, temp: -0.09, con: 0.12, shadow: [-0.02, 0.05, 0.12], high: [0.0, 0.03, 0.05] }),
  F('f_registon', 'Registon', { sat: 1.2, temp: 0.1, shadow: [0.0, 0.05, 0.12], high: [0.08, 0.04, -0.03], con: 0.15 }),
  F('f_buxoro', 'Buxoro', { sat: 0.85, temp: 0.14, gain: [1.05, 0.98, 0.84], fade: 0.06 }),
  F('f_xiva', 'Xiva', { sat: 0.95, temp: 0.18, con: 0.2, shadow: [0.06, 0.02, -0.03], gamma: 1.05 }),
  F('f_chimyon', 'Chimyon', { sat: 1.15, temp: -0.12, bri: 0.04, high: [0.02, 0.05, 0.08], con: 0.06 }),
  F('f_chorvoq', 'Chorvoq', { sat: 1.25, temp: -0.05, tint: 0.03, shadow: [-0.03, 0.05, 0.08], con: 0.05 }),
  F('f_tong', 'Tong', { sat: 1.05, temp: 0.07, bri: 0.05, lift: [0.04, 0.02, 0.05], high: [0.06, 0.02, 0.0] }),
  F('f_shom', 'Shom', { sat: 1.25, temp: 0.2, con: 0.12, shadow: [0.04, -0.03, 0.08], gamma: 1.1 }),
  F('f_tun', 'Tun', { sat: 0.75, temp: -0.2, bri: -0.08, con: 0.18, shadow: [-0.02, 0.0, 0.08] }),
  F('f_teal', 'Kino moviy', { sat: 1.15, con: 0.2, shadow: [-0.06, 0.04, 0.09], high: [0.09, 0.03, -0.06] }),
  F('f_noir', 'Qora kino', { bw: true, con: 0.45, gamma: 1.12 }),
  F('f_bw', 'Oq-qora', { bw: true, con: 0.05 }),
  F('f_bwsoft', 'Yumshoq oq-qora', { bw: true, fade: 0.14, bri: 0.02 }),
  F('f_sepia', 'Sepiya', { bw: true, gain: [1.12, 0.94, 0.72], con: 0.05 }),
  F('f_faded', 'Xira', { sat: 0.72, fade: 0.2 }),
  F('f_vivid', 'Yorqin', { sat: 1.7, con: 0.1 }),
  F('f_clean', 'Toza', { sat: 1.08, bri: 0.04, con: 0.08, temp: -0.01 }),
  F('f_food', 'Taom', { sat: 1.35, temp: 0.1, bri: 0.04, con: 0.1 }),
  F('f_portrait', 'Portret', { sat: 1.02, temp: 0.05, tint: 0.02, bri: 0.05, fade: 0.04, gamma: 0.94 }),
  F('f_skin', 'Tiniq teri', { sat: 0.95, temp: 0.03, tint: 0.04, bri: 0.07, con: -0.04, high: [0.05, 0.03, 0.03] }),
  F('f_rose', 'Atirgul', { sat: 1.05, tint: 0.08, gain: [1.08, 0.94, 1.0], fade: 0.05 }),
  F('f_mint', 'Yalpiz', { sat: 0.95, tint: -0.07, temp: -0.05, bri: 0.05, fade: 0.05 }),
  F('f_gold', 'Oltin', { sat: 1.12, gain: [1.15, 1.0, 0.7], con: 0.12 }),
  F('f_silver', 'Kumush', { sat: 0.35, temp: -0.05, con: 0.14, bri: 0.02 }),
  F('f_copper', 'Mis', { sat: 0.65, gain: [1.2, 0.88, 0.68], con: 0.14 }),
  F('f_autumn', 'Kuz', { sat: 1.2, temp: 0.16, tint: -0.04, con: 0.1, shadow: [0.05, 0.0, -0.04] }),
  F('f_spring', 'Bahor', { sat: 1.3, tint: -0.06, bri: 0.06, high: [0.02, 0.05, 0.0] }),
  F('f_winter', 'Qish', { sat: 0.6, temp: -0.16, bri: 0.07, high: [0.03, 0.06, 0.1] }),
  F('f_summer', 'Yoz', { sat: 1.4, temp: 0.11, bri: 0.08, con: 0.1 }),
  F('f_matte', 'Mat', { con: -0.14, lift: [0.08, 0.08, 0.09], sat: 0.9 }),
  F('f_pop', 'Pop', { sat: 1.95, con: 0.28, gamma: 0.95 }),
  F('f_cyber', 'Kiber', { sat: 1.35, con: 0.2, shadow: [0.12, -0.05, 0.2], high: [-0.08, 0.1, 0.13] }),
  F('f_film', 'Plyonka', { sat: 0.92, temp: 0.04, tint: -0.03, con: 0.1, lift: [0.05, 0.05, 0.04] }),
  F('f_cross', 'Krossprotsess', { sat: 1.25, gain: [1.1, 1.05, 0.8], lift: [0.0, 0.03, 0.12], con: 0.22 }),
  F('f_green', 'Yashil tush', { sat: 1.05, gain: [0.84, 1.12, 0.84], con: 0.08 }),
  F('f_magenta', 'Pushti tush', { sat: 1.1, gain: [1.12, 0.82, 1.12], con: 0.08 }),
  F('f_blue', "Ko'k tush", { sat: 1.0, gain: [0.8, 0.92, 1.25], con: 0.1 }),
  F('f_orange', 'Apelsin', { sat: 1.2, gain: [1.2, 0.98, 0.72], bri: 0.02 }),
];

const STYLE: EffectDef[] = [
  E('style', 's_posterize', 'Plakat', 'vec4 fx(vec2 p){vec4 s=S(p);float n=mix(16.,4.,amt);return vec4(floor(s.rgb*n+.5)/n,s.a);}'),
  E('style', 's_comic', 'Komiks', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 e=2./res;float g=length(vec2(lum(S(p+vec2(e.x,0.)).rgb)-lum(S(p-vec2(e.x,0.)).rgb),lum(S(p+vec2(0.,e.y)).rgb)-lum(S(p-vec2(0.,e.y)).rgb)));vec3 c=floor(s.rgb*5.+.5)/5.;c*=1.-smoothstep(.1,.3,g);return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_sketch', 'Qalam chizma', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 e=1.5/res;float g=length(vec2(lum(S(p+vec2(e.x,0.)).rgb)-lum(S(p-vec2(e.x,0.)).rgb),lum(S(p+vec2(0.,e.y)).rgb)-lum(S(p-vec2(0.,e.y)).rgb)));float d=1.-smoothstep(.02,.22,g);return vec4(mix(s.rgb,vec3(d),amt),s.a);}'),
  E('style', 's_edges', 'Neon chiziqlar', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 e=1.5/res;vec3 g=abs(S(p+vec2(e.x,0.)).rgb-S(p-vec2(e.x,0.)).rgb)+abs(S(p+vec2(0.,e.y)).rgb-S(p-vec2(0.,e.y)).rgb);vec3 n=g*3.*hsv(vec3(p.y+t*.2,.8,1.));return vec4(mix(s.rgb,n,amt),s.a);}'),
  E('style', 's_halftone', 'Nuqtali bosma', 'vec4 fx(vec2 p){vec4 s=S(p);float z=res.y/mix(220.,70.,amt);vec2 q=rot(.78)*(p*res)/z;vec2 f=fract(q)-.5;float r=sqrt(1.-lum(s.rgb))*.75;float d=smoothstep(r+.06,r-.06,length(f));return vec4(mix(s.rgb,vec3(1.-d)*(s.rgb*.35+.65),amt),s.a);}'),
  E('style', 's_pixel', 'Piksel', 'vec4 fx(vec2 p){float n=mix(res.y/4.,res.y/40.,amt);vec2 a=vec2(n*res.x/res.y,n);return S((floor(p*a)+.5)/a);}'),
  E('style', 's_oil', 'Moybo\'yoq', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=vec3(0.);float mx=0.;vec2 e=2.5/res*(1.+amt*2.);for(int i=0;i<8;i++){float a=float(i)*.785;vec3 q=S(p+vec2(cos(a),sin(a))*e).rgb;float v=lum(q);if(v>mx){mx=v;c=q;}}c=floor(c*9.)/9.;return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_invert', 'Negativ', 'vec4 fx(vec2 p){vec4 s=S(p);return vec4(mix(s.rgb,1.-s.rgb,amt),s.a);}'),
  E('style', 's_duotone', 'Ikki rang', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=mix(vec3(.13,.05,.45),vec3(1.,.72,.25),smoothstep(0.,1.,lum(s.rgb)));return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_duotone2', 'Moviy pushti', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=mix(vec3(.02,.2,.5),vec3(1.,.28,.6),smoothstep(.05,.95,lum(s.rgb)));return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_thermal', 'Issiqlik kamerasi', 'vec4 fx(vec2 p){vec4 s=S(p);float l=lum(s.rgb);vec3 c=hsv(vec3(.7-.7*l,1.,smoothstep(0.,.25,l)));return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_nightvis', 'Tungi kamera', 'vec4 fx(vec2 p){vec4 s=S(p);float l=lum(s.rgb)*1.6;float n=rand(p*res+t)*.14;vec3 c=vec3(.1,1.,.25)*(l+n)*(1.-length(p-.5)*.9);return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_mosaic', 'Mozaika', 'vec4 fx(vec2 p){float n=mix(120.,22.,amt);vec2 a=vec2(n*res.x/res.y,n);vec2 c=floor(p*a);vec2 f=fract(p*a);vec4 s=S((c+.5)/a);float b=smoothstep(0.,.08,f.x)*smoothstep(0.,.08,f.y);return vec4(s.rgb*b,s.a);}'),
  E('style', 's_hexa', 'Olti burchak', 'vec4 fx(vec2 p){float z=mix(.012,.05,amt);vec2 r=vec2(1.,1.732);vec2 q=vec2(p.x*res.x/res.y,p.y)/z;vec2 h=r*.5;vec2 a=mod(q,r)-h;vec2 b=mod(q-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;vec2 c=(q-g)*z;c.x/=res.x/res.y;return S(c);}'),
  E('style', 's_ikat', 'Atlas naqsh', 'vec4 fx(vec2 p){vec4 s=S(p);float w=sin(p.y*40.+sin(p.x*9.)*2.)*.5+.5;float k=step(.5,fract(p.x*8.+w*.18+rand(vec2(floor(p.y*90.),2.))*.05));vec3 c=mix(vec3(.65,.06,.4),vec3(.98,.75,.1),k);c=mix(c,vec3(.04,.4,.55),smoothstep(.7,.9,w)*(1.-k));return vec4(mix(s.rgb,s.rgb*c*2.,amt*.85),s.a);}'),
  E('style', 's_watercolor', 'Akvarel', 'vec4 fx(vec2 p){vec2 q=p+(vec2(noise(p*14.),noise(p*14.+7.))-.5)*.02*amt;vec4 s=S(q);vec3 c=floor(s.rgb*7.)/7.;c=mix(c,vec3(1.),.14+noise(p*60.)*.06);return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_emboss', 'Bo\'rtma', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 e=1.5/res;float d=lum(S(p+e).rgb)-lum(S(p-e).rgb);vec3 c=vec3(.5+d*3.);return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('style', 's_ascii', 'Belgilar', 'vec4 fx(vec2 p){vec2 z=vec2(res.y/mix(180.,70.,amt));vec2 g=floor(p*res/z);vec2 f=fract(p*res/z);vec4 s=S((g+.5)*z/res);float l=lum(s.rgb);float m=l<.25?0.:l<.5?step(.4,f.x)*step(f.x,.6):l<.75?max(step(.4,f.x)*step(f.x,.6),step(.4,f.y)*step(f.y,.6)):step(.2,f.x)*step(.2,f.y);return vec4(s.rgb*m*1.3,s.a);}'),
  E('style', 's_chroma', 'Yashil fon olib tashlash', 'vec4 fx(vec2 p){vec4 s=S(p);float k=s.g-max(s.r,s.b);float a=1.-smoothstep(.06,mix(.45,.12,amt),k);return vec4(s.rgb,s.a*a);}', 0.7),
  E('style', 's_blur', 'Xiralashtirish', 'vec4 fx(vec2 p){vec4 c=vec4(0.);float w=0.;float r=amt*.012;for(int i=0;i<16;i++){float a=float(i)*2.399;float d=sqrt(float(i)/16.);c+=S(p+vec2(cos(a),sin(a)*res.x/res.y)*d*r*res.y/res.x);w+=1.;}return c/w;}'),
  E('style', 's_sharp', 'Tiniqlashtirish', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 e=1.2/res;vec3 b=(S(p+vec2(e.x,0.)).rgb+S(p-vec2(e.x,0.)).rgb+S(p+vec2(0.,e.y)).rgb+S(p-vec2(0.,e.y)).rgb)*.25;return vec4(clamp(s.rgb+(s.rgb-b)*amt*3.,0.,1.),s.a);}'),
];

const LIGHT: EffectDef[] = [
  E('light', 'l_glow', 'Yorqin nur', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 g=vec3(0.);for(int i=0;i<12;i++){float a=float(i)*2.399;float d=sqrt(float(i)/12.)*.025;g+=max(S(p+vec2(cos(a),sin(a))*d).rgb-.55,0.);}return vec4(s.rgb+g/12.*amt*4.,s.a);}'),
  E('light', 'l_vignette', 'Chekka soya', 'vec4 fx(vec2 p){vec4 s=S(p);float d=length((p-.5)*vec2(1.1));return vec4(s.rgb*(1.-smoothstep(.3,.85,d)*amt),s.a);}'),
  E('light', 'l_leak', 'Nur oqishi', 'vec4 fx(vec2 p){vec4 s=S(p);float x=p.x+sin(t*.7)*.3;float m=noise(vec2(x*2.5+t*.25,p.y*1.5))*smoothstep(.9,.0,x);vec3 c=mix(vec3(1.,.35,.1),vec3(1.,.8,.3),p.y);return vec4(1.-(1.-s.rgb)*(1.-c*m*amt*1.4),s.a);}'),
  E('light', 'l_rays', 'Quyosh nurlari', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 d=p-vec2(.75,.85);float a=atan(d.y,d.x);float r=length(d);float k=pow(noise(vec2(a*7.+t*.3,1.)),2.)*smoothstep(1.1,0.,r);return vec4(s.rgb+vec3(1.,.85,.55)*k*amt,s.a);}'),
  E('light', 'l_flare', 'Linza yorug\'i', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 c=vec2(.5+sin(t*.6)*.3,.72);vec2 q=(p-c)*vec2(res.x/res.y,1.);float f=.02/(length(q)+.02)+.012/(abs(q.y)+.012)*smoothstep(.8,0.,abs(q.x));vec2 q2=(p-(1.-c))*vec2(res.x/res.y,1.);f+=smoothstep(.09,.08,length(q2))*.14;vec2 q3=(p-(.3+c*.4))*vec2(res.x/res.y,1.);f+=smoothstep(.05,.04,length(q3))*.2;return vec4(s.rgb+vec3(1.,.85,.7)*f*amt,s.a);}'),
  E('light', 'l_bokeh', 'Bokeh doiralar', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=vec3(0.);vec2 q=p*vec2(res.x/res.y,1.);for(int i=0;i<14;i++){float f=float(i);vec2 o=vec2(rand(vec2(f,1.))*res.x/res.y,fract(rand(vec2(f,2.))+t*.03*(1.+rand(vec2(f,3.)))));float r=.03+rand(vec2(f,4.))*.05;c+=hsv(vec3(rand(vec2(f,5.)),.5,1.))*smoothstep(r,r-.008,length(q-o))*.22;}return vec4(s.rgb+c*amt,s.a);}'),
  E('light', 'l_sparkle', 'Yaltiroq', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=vec3(0.);vec2 g=p*vec2(res.x/res.y,1.)*14.;vec2 id=floor(g);vec2 f=fract(g)-.5;float r=rand(id);if(r>.72){vec2 o=(vec2(rand(id+1.),rand(id+2.))-.5)*.5;vec2 d=abs(f-o);float tw=pow(sin(t*3.+r*30.)*.5+.5,4.);float st=.008/(d.x*d.y+.008)*smoothstep(.45,.0,length(d));c+=vec3(1.,.95,.75)*st*tw;}return vec4(s.rgb+c*amt,s.a);}'),
  E('light', 'l_strobe', 'Stroboskop', 'vec4 fx(vec2 p){vec4 s=S(p);float k=step(.8,fract(t*4.));return vec4(s.rgb+k*amt*.8,s.a);}'),
  E('light', 'l_flash', 'Chaqnash', 'vec4 fx(vec2 p){vec4 s=S(p);float k=pow(max(0.,sin(t*3.14)),24.);return vec4(s.rgb+k*amt,s.a);}'),
  E('light', 'l_neon', 'Neon kontur', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 e=2./res;float g=length(vec2(lum(S(p+vec2(e.x,0.)).rgb)-lum(S(p-vec2(e.x,0.)).rgb),lum(S(p+vec2(0.,e.y)).rgb)-lum(S(p-vec2(0.,e.y)).rgb)));vec3 n=hsv(vec3(fract(p.x+t*.25),.9,1.))*smoothstep(.05,.3,g)*2.;return vec4(mix(s.rgb,s.rgb*.35+n,amt),s.a);}'),
  E('light', 'l_spot', 'Sahna chirog\'i', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 c=vec2(.5+sin(t)*.28,.5+cos(t*.7)*.22);float m=smoothstep(.45,.1,length((p-c)*vec2(res.x/res.y,1.)));return vec4(s.rgb*mix(1.,.15+m*1.25,amt),s.a);}'),
  E('light', 'l_rainbow', 'Kamalak', 'vec4 fx(vec2 p){vec4 s=S(p);float d=length(p-vec2(.5,-.2));float b=smoothstep(.72,.78,d)*smoothstep(1.06,1.0,d);vec3 c=hsv(vec3((d-.72)/.34,.8,1.));return vec4(s.rgb+c*b*amt*.6,s.a);}'),
  E('light', 'l_party', 'Diskoteka', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=vec3(0.);for(int i=0;i<4;i++){float f=float(i);vec2 o=vec2(.5+sin(t*(1.+f*.3)+f*2.)*.45,.5+cos(t*(.8+f*.2)+f)*.45);c+=hsv(vec3(f*.25+t*.1,1.,1.))*smoothstep(.34,.0,length(p-o));}return vec4(s.rgb*(1.-amt*.35)+s.rgb*c*amt*1.6,s.a);}'),
];

const RETRO: EffectDef[] = [
  E('retro', 'r_vhs', 'VHS kasseta', 'vec4 fx(vec2 p){float j=(noise(vec2(p.y*40.,t*4.))-.5)*.012*amt;float b=step(.985,fract(p.y*1.+t*.13))*.04*amt;vec2 q=p+vec2(j+b,0.);float c=.004*amt;vec3 o=vec3(S(q+vec2(c,0.)).r,S(q).g,S(q-vec2(c,0.)).b);o=mix(o,o*vec3(.95,1.02,1.05),amt);o+=rand(vec2(p.y*res.y,t))*.05*amt;o*=1.-.1*amt*step(.5,fract(p.y*res.y*.25));return vec4(o,S(p).a);}'),
  E('retro', 'r_film', 'Eski plyonka', 'vec4 fx(vec2 p){vec2 q=p+vec2(0.,step(.92,rand(vec2(floor(t*12.))))*.008*amt);vec4 s=S(q);vec3 c=mix(s.rgb,vec3(lum(s.rgb))*vec3(1.08,.96,.78),amt*.8);c+=(rand(p*res+floor(t*24.))-.5)*.12*amt;float x=fract(rand(vec2(floor(t*12.),1.)));c*=1.-smoothstep(.002,0.,abs(p.x-x))*.5*amt;c*=1.-smoothstep(.35,.9,length(p-.5))*amt*.6;return vec4(c,s.a);}'),
  E('retro', 'r_8mm', '8 mm', 'vec4 fx(vec2 p){vec2 q=p+vec2(sin(t*17.)*.002,cos(t*23.)*.003)*amt;vec4 s=S(q);vec3 c=s.rgb*vec3(1.1,1.,.82);c=mix(c,vec3(.55,.45,.3),.1*amt);c+=(noise(p*res*.5+t*40.)-.5)*.18*amt;float e=smoothstep(.0,.03,p.x)*smoothstep(1.,.97,p.x);return vec4(mix(s.rgb,c*e,amt),s.a);}'),
  E('retro', 'r_grain', 'Don-don', 'vec4 fx(vec2 p){vec4 s=S(p);float n=rand(p*res+fract(t)*91.)-.5;return vec4(s.rgb+n*amt*.35,s.a);}'),
  E('retro', 'r_scan', 'Eski televizor', 'vec4 fx(vec2 p){vec2 c=p-.5;c*=1.+dot(c,c)*.25*amt;vec2 q=c+.5;if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(0.,0.,0.,1.);vec4 s=S(q);float l=.75+.25*sin(q.y*res.y*1.4);vec3 g=vec3(1.+.15*sin(q.x*res.x*2.),1.+.15*sin(q.x*res.x*2.+2.1),1.+.15*sin(q.x*res.x*2.+4.2));return vec4(mix(s.rgb,s.rgb*l*g*1.2,amt),s.a);}'),
  E('retro', 'r_gb', 'Geym boy', 'vec4 fx(vec2 p){float n=mix(240.,110.,amt);vec2 a=vec2(n*res.x/res.y,n);vec4 s=S((floor(p*a)+.5)/a);float l=floor(lum(s.rgb)*3.99)/3.;vec3 c=mix(vec3(.06,.22,.06),vec3(.61,.74,.06),l);return vec4(c,s.a);}'),
  E('retro', 'r_polaroid', 'Polaroid', 'vec4 fx(vec2 p){float b=.06*amt;vec2 q=(p-vec2(b,b*2.2))/vec2(1.-2.*b,1.-b*3.2);if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(.96,.95,.9,1.);vec4 s=S(q);vec3 c=s.rgb*vec3(1.05,1.,.88)+.03;return vec4(mix(s.rgb,c,amt),s.a);}'),
  E('retro', 'r_filmstrip', 'Plyonka hoshiya', 'vec4 fx(vec2 p){vec4 s=S(p);float w=.07*amt;if(p.x<w||p.x>1.-w){float y=fract(p.y*14.+t*2.);float h=smoothstep(.2,.25,y)*smoothstep(.8,.75,y)*step(abs(fract(p.x/w*.5)-.5),.28);return vec4(vec3(h*.9),1.);}return s;}'),
  E('retro', 'r_camcorder', 'Videokamera', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=s.rgb;c+=(rand(p*res+t)-.5)*.05*amt;vec2 q=abs(p-.5);float fr=step(.42,q.x)*step(q.x,.425)*step(.28,q.y)+step(.42,q.y)*step(q.y,.425)*step(.28,q.x);float dot2=smoothstep(.016,.012,length((p-vec2(.1,.9))*vec2(res.x/res.y,1.)))*step(.5,fract(t));c=mix(c,vec3(1.),fr*amt);c=mix(c,vec3(1.,.1,.1),dot2*amt);return vec4(c,s.a);}'),
  E('retro', 'r_dust', 'Chang va tirnalish', 'vec4 fx(vec2 p){vec4 s=S(p);float f=floor(t*14.);float n=smoothstep(.8,.88,noise(p*90.+f*13.));float l=smoothstep(.0015,0.,abs(p.x-rand(vec2(f,8.))))*step(.5,rand(vec2(f,9.)));return vec4(s.rgb+(n-l*.6)*amt,s.a);}'),
];

const GLITCH: EffectDef[] = [
  E('glitch', 'g_rgb', 'RGB ajralish', 'vec4 fx(vec2 p){float d=amt*.02*(1.+sin(t*5.)*.4);vec4 s=S(p);return vec4(S(p+vec2(d,0.)).r,s.g,S(p-vec2(d,0.)).b,s.a);}'),
  E('glitch', 'g_slice', 'Kesiklar', 'vec4 fx(vec2 p){float f=floor(t*14.);float r=floor(p.y*18.);float o=(rand(vec2(r,f))-.5)*step(.62,rand(vec2(r,f+1.)))*.22*amt;vec4 s=S(p+vec2(o,0.));return s;}'),
  E('glitch', 'g_block', 'Bloklar', 'vec4 fx(vec2 p){float f=floor(t*10.);vec2 b=floor(p*vec2(10.,16.));float r=rand(b+f);vec2 o=step(.86,r)*(vec2(rand(b+f+1.),rand(b+f+2.))-.5)*.14*amt;vec4 s=S(p+o);vec3 c=s.rgb;if(r>.95)c=c.gbr;return vec4(c,s.a);}'),
  E('glitch', 'g_digital', 'Raqamli xato', 'vec4 fx(vec2 p){float k=step(.6,rand(vec2(floor(t*8.),3.)))*amt;float y=floor(p.y*50.);float o=(rand(vec2(y,floor(t*30.)))-.5)*.08*k;vec4 s=S(p+vec2(o,0.));vec3 c=vec3(S(p+vec2(o+.012*k,0.)).r,s.g,S(p+vec2(o-.012*k,0.)).b);return vec4(c,s.a);}'),
  E('glitch', 'g_shake', 'Signal uzilishi', 'vec4 fx(vec2 p){float f=floor(t*10.);float k=step(.7,rand(vec2(f,4.)))*amt;float v=fract(p.y+f*.37*k);vec2 q=vec2(p.x+sin(p.y*90.+t*30.)*.012*k,v);vec4 s=S(q);return vec4(mix(s.rgb,vec3(lum(s.rgb)),k*.6),s.a);}'),
  E('glitch', 'g_noise', 'Shovqin', 'vec4 fx(vec2 p){vec4 s=S(p);float b=step(.97,rand(vec2(floor(p.y*80.),floor(t*20.))));float n=rand(p*res+t*30.);return vec4(mix(s.rgb,vec3(n),max(b,.12)*amt),s.a);}'),
  E('glitch', 'g_wave', 'Signal to\'lqini', 'vec4 fx(vec2 p){float k=sin(p.y*12.+t*7.)*sin(p.y*67.-t*11.)*.03*amt;vec4 s=S(p+vec2(k,0.));return vec4(S(p+vec2(k*1.6,0.)).r,s.g,S(p+vec2(k*.4,0.)).b,s.a);}'),
  E('glitch', 'g_datamosh', 'Datamosh', 'vec4 fx(vec2 p){vec2 b=floor(p*22.)/22.;vec2 f=vec2(noise(b*6.+floor(t*5.)),noise(b*6.+9.+floor(t*5.)))-.5;vec4 s=S(p+f*.12*amt);return s;}'),
  E('glitch', 'g_bars', 'Tasmalar', 'vec4 fx(vec2 p){vec4 s=S(p);float y=fract(p.y*6.+t*.9);float k=smoothstep(.9,1.,y)*amt;return vec4(mix(s.rgb,hsv(vec3(floor(p.y*6.+t*.9)*.18,.85,1.)),k*.85),s.a);}'),
  E('glitch', 'g_cyber', 'Kiberpank', 'vec4 fx(vec2 p){float f=floor(t*12.);float k=step(.55,rand(vec2(f,7.)));float o=(rand(vec2(floor(p.y*12.),f))-.5)*.1*k*amt;vec4 s=S(p+vec2(o,0.));vec3 c=vec3(S(p+vec2(o+.01,0.)).r,s.g,S(p+vec2(o-.01,0.)).b);c=mix(c,c*vec3(1.2,.7,1.35)+vec3(.06,0.,.1),amt);return vec4(c,s.a);}'),
];

const DISTORT: EffectDef[] = [
  E('distort', 'd_wave', "To'lqin", 'vec4 fx(vec2 p){return S(p+vec2(sin(p.y*14.+t*3.),cos(p.x*11.+t*2.5))*.018*amt);}'),
  E('distort', 'd_ripple', 'Suv halqalari', 'vec4 fx(vec2 p){vec2 d=(p-.5)*vec2(res.x/res.y,1.);float r=length(d);return S(p+normalize(d+1e-4)*sin(r*40.-t*6.)*.012*amt*smoothstep(.9,.0,r));}'),
  E('distort', 'd_swirl', 'Girdob', 'vec4 fx(vec2 p){vec2 d=p-.5;float r=length(d);float a=amt*3.*smoothstep(.6,0.,r)*(.6+.4*sin(t));return S(rot(a)*d+.5);}'),
  E('distort', 'd_bulge', 'Bo\'rtish', 'vec4 fx(vec2 p){vec2 d=p-.5;float r=length(d);return S(.5+d*mix(1.,pow(r*1.6,.7+.5*amt*.5),amt*.9));}'),
  E('distort', 'd_pinch', 'Siqilish', 'vec4 fx(vec2 p){vec2 d=p-.5;float r=length(d);return S(.5+d*(1.+amt*r*1.6));}'),
  E('distort', 'd_fisheye', 'Baliq ko\'zi', 'vec4 fx(vec2 p){vec2 d=(p-.5)*2.;float r=length(d);float z=1.+amt*.9;float a=atan(r*z*.9)/atan(z*.9);vec2 q=d/(r+1e-4)*a*.5+.5;return S(q);}'),
  E('distort', 'd_mirrorh', 'Oyna vertikal', 'vec4 fx(vec2 p){vec2 q=vec2(abs(p.x-.5)+.5*(1.-amt)*0.+.0,p.y);q.x=.5-abs(p.x-.5);return S(mix(p,q,step(.01,amt)));}'),
  E('distort', 'd_mirrorv', 'Oyna gorizontal', 'vec4 fx(vec2 p){vec2 q=vec2(p.x,.5-abs(p.y-.5));return S(mix(p,q,step(.01,amt)));}'),
  E('distort', 'd_mirror4', "To'rt oyna", 'vec4 fx(vec2 p){vec2 q=.5-abs(p-.5);return S(mix(p,q*2.*.5+.25*0.+q,step(.01,amt)));}'),
  E('distort', 'd_kaleido', 'Kaleydoskop', 'vec4 fx(vec2 p){vec2 d=p-.5;float r=length(d);float a=atan(d.y,d.x)+t*.2;float n=floor(mix(3.,10.,amt));float s=6.283/n;a=mod(a,s);a=abs(a-s*.5);return S(.5+r*vec2(cos(a),sin(a)));}'),
  E('distort', 'd_split2', 'Ikki kadr', 'vec4 fx(vec2 p){return S(vec2(p.x,fract(p.y*2.)*.8+.1));}'),
  E('distort', 'd_split4', "To'rt kadr", 'vec4 fx(vec2 p){return S(fract(p*2.));}'),
  E('distort', 'd_split9', "To'qqiz kadr", 'vec4 fx(vec2 p){return S(fract(p*3.));}'),
  E('distort', 'd_stretch', 'Cho\'zilish', 'vec4 fx(vec2 p){float m=.5+sin(t*2.)*.25;float y=p.y<m?p.y*(.5/m):.5+(p.y-m)*(.5/(1.-m));return S(vec2(p.x,mix(p.y,y,amt)));}'),
  E('distort', 'd_heat', 'Issiq havo', 'vec4 fx(vec2 p){float n=noise(vec2(p.x*22.,p.y*8.-t*3.))-.5;return S(p+vec2(n,n*.3)*.03*amt);}'),
  E('distort', 'd_glass', 'Ariq shisha', 'vec4 fx(vec2 p){float x=fract(p.x*16.);return S(p+vec2((x-.5)*.05*amt,0.));}'),
  E('distort', 'd_frost', 'Muzli oyna', 'vec4 fx(vec2 p){vec2 o=vec2(rand(p*res),rand(p*res+3.))-.5;return S(p+o*.04*amt);}'),
  E('distort', 'd_liquid', 'Suyuq', 'vec4 fx(vec2 p){vec2 n=vec2(fbm(p*4.+t*.3),fbm(p*4.+5.-t*.3))-.5;return S(p+n*.09*amt);}'),
  E('distort', 'd_shatter', 'Sinish', 'vec4 fx(vec2 p){vec2 g=floor(p*7.);vec2 f=vec2(rand(g),rand(g+3.))-.5;float a=(rand(g+7.)-.5)*.3*amt;vec2 c=(g+.5)/7.;return S(c+rot(a)*(p-c)+f*.05*amt);}'),
];

const MOTION: EffectDef[] = [
  E('motion', 'm_shake', 'Silkinish', 'vec4 fx(vec2 p){vec2 o=vec2(noise(vec2(t*22.,1.)),noise(vec2(t*22.,5.)))-.5;return S(.5+(p-.5)*.94+o*.05*amt);}'),
  E('motion', 'm_beat', 'Zarba', 'vec4 fx(vec2 p){float k=pow(1.-fract(t*2.),3.);return S(.5+(p-.5)*(1.-k*.16*amt));}'),
  E('motion', 'm_zoomblur', 'Zum xiralik', 'vec4 fx(vec2 p){vec4 c=vec4(0.);for(int i=0;i<14;i++){c+=S(.5+(p-.5)*(1.-float(i)*.012*amt));}return c/14.;}'),
  E('motion', 'm_hblur', 'Yon harakat', 'vec4 fx(vec2 p){vec4 c=vec4(0.);for(int i=0;i<14;i++){c+=S(p+vec2((float(i)/13.-.5)*.07*amt,0.));}return c/14.;}'),
  E('motion', 'm_vblur', 'Tik harakat', 'vec4 fx(vec2 p){vec4 c=vec4(0.);for(int i=0;i<14;i++){c+=S(p+vec2(0.,(float(i)/13.-.5)*.07*amt));}return c/14.;}'),
  E('motion', 'm_spinblur', 'Aylanma xiralik', 'vec4 fx(vec2 p){vec4 c=vec4(0.);for(int i=0;i<14;i++){c+=S(.5+rot((float(i)/13.-.5)*.18*amt)*(p-.5));}return c/14.;}'),
  E('motion', 'm_echo', 'Aks-sado', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 c=s.rgb;for(int i=1;i<5;i++){float f=float(i);c=max(c,S(.5+(p-.5)*(1.+f*.05*amt*(1.+.3*sin(t*3.)))).rgb*(1.-f*.2));}return vec4(c,s.a);}'),
  E('motion', 'm_ghost', 'Arvoh', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 a=S(p+vec2(sin(t*2.),cos(t*2.3))*.05*amt).rgb;return vec4(mix(s.rgb,a,.45*amt),s.a);}'),
  E('motion', 'm_bounce', 'Sakrash', 'vec4 fx(vec2 p){float k=abs(sin(t*4.))*.05*amt;return S(.5+(p-.5-vec2(0.,k))*.92);}'),
  E('motion', 'm_sway', 'Tebranish', 'vec4 fx(vec2 p){return S(.5+rot(sin(t*2.2)*.09*amt)*(p-.5)*.9);}'),
  E('motion', 'm_zoompulse', 'Zum puls', 'vec4 fx(vec2 p){return S(.5+(p-.5)*(1.-(.5+.5*sin(t*5.))*.14*amt));}'),
  E('motion', 'm_scroll', 'Cheksiz siljish', 'vec4 fx(vec2 p){return S(fract(p+vec2(t*.25*amt,0.)));}'),
  E('motion', 'm_strobe', 'Rang o\'zgarish', 'vec4 fx(vec2 p){vec4 s=S(p);vec3 h=rgb2hsv(s.rgb);h.x=fract(h.x+t*.4*amt);return vec4(hsv(h),s.a);}'),
  E('motion', 'm_flicker', 'Miltillash', 'vec4 fx(vec2 p){vec4 s=S(p);return vec4(s.rgb*(1.-amt*.55*step(.45,rand(vec2(floor(t*18.),1.)))),s.a);}'),
];

const D3: EffectDef[] = [
  E('d3', 'x_tilt', '3D qiyalik', 'vec4 fx(vec2 p){vec2 d=p-.5;float a=sin(t*.9)*.8*amt;float z=1.+d.x*sin(a)*1.4;vec2 q=vec2(d.x/cos(a)/z,d.y/z)*.92+.5;if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(0.,0.,0.,1.);return S(q);}'),
  E('d3', 'x_floor', '3D pol', 'vec4 fx(vec2 p){float h=mix(1.,.28,amt);if(p.y>h){return vec4(mix(vec3(.02,.03,.1),vec3(.2,.1,.4),p.y),1.);}float z=mix(1.,.45+(1.-p.y/h)*.9,amt);vec2 q=vec2(.5+(p.x-.5)/z,1.-.6/(1.-p.y/h+.6)+.0);return S(vec2(q.x,fract(q.y*1.8+t*.2)));}'),
  E('d3', 'x_sphere', '3D shar', 'vec4 fx(vec2 p){vec2 d=(p-.5)*vec2(res.x/res.y,1.)*2.2;float r=length(d);if(r>1.)return vec4(vec3(.03,.03,.08)+.2*smoothstep(1.3,1.,r),1.);float z=sqrt(1.-r*r);vec3 n=vec3(d,z);float a=t*.5;vec3 m=vec3(n.x*cos(a)+n.z*sin(a),n.y,-n.x*sin(a)+n.z*cos(a));vec2 q=vec2(atan(m.x,m.z)/6.283+.5,asin(m.y)/3.1415+.5);vec3 c=S(q).rgb*(.25+.85*max(dot(n,normalize(vec3(.4,.5,.8))),0.));c+=pow(max(dot(n,normalize(vec3(.4,.5,.9))),0.),40.)*.5;return vec4(mix(S(p).rgb,c,step(.02,amt)),1.);}'),
  E('d3', 'x_cube', '3D kub', 'mat3 rY(float a){return mat3(cos(a),0.,sin(a),0.,1.,0.,-sin(a),0.,cos(a));}mat3 rX(float a){return mat3(1.,0.,0.,0.,cos(a),-sin(a),0.,sin(a),cos(a));}vec4 fx(vec2 p){vec2 d=(p-.5)*vec2(res.x/res.y,1.);mat3 R=rY(t*.7)*rX(.45);vec3 ro=R*vec3(0.,0.,3.2);vec3 rd=R*normalize(vec3(d*mix(1.,1.6,amt),-1.3));vec3 tmin=(vec3(-.8)-ro)/rd;vec3 tmax=(vec3(.8)-ro)/rd;vec3 a=min(tmin,tmax);vec3 b=max(tmin,tmax);float n=max(max(a.x,a.y),a.z);float f=min(min(b.x,b.y),b.z);if(n>f||f<0.)return vec4(mix(vec3(.05,.03,.14),vec3(.01),length(d)),1.);vec3 h=ro+rd*n;vec3 q=h/.8;vec2 u;float l;if(n==a.x){u=q.zy;l=.7;}else if(n==a.y){u=q.xz;l=1.;}else{u=q.xy;l=.85;}return vec4(S(u*.5+.5).rgb*l,1.);}'),
  E('d3', 'x_cylinder', '3D silindr', 'vec4 fx(vec2 p){vec2 d=(p-.5)*2.;float a=asin(clamp(d.x*.98,-1.,1.))+t*.6;float l=sqrt(max(0.,1.-d.x*d.x));vec2 q=vec2(fract(a/3.1415),.5+d.y*(.55+.1*l)*mix(1.,.95,amt));return vec4(S(q).rgb*(.3+l*.8),1.);}'),
  E('d3', 'x_tunnel', '3D tunnel', 'vec4 fx(vec2 p){vec2 d=(p-.5)*vec2(res.x/res.y,1.);float r=length(d)+1e-3;float a=atan(d.y,d.x);vec2 q=vec2(a/3.1415,.25/r+t*.5);vec3 c=S(abs(fract(q)*2.-1.)).rgb*smoothstep(0.,.55,r);return vec4(mix(S(p).rgb,c,smoothstep(0.,.4,amt)),1.);}'),
  E('d3', 'x_rotatey', '3D aylanish', 'vec4 fx(vec2 p){vec2 d=p-.5;float a=t*1.4;float c=cos(a);float z=1.+d.x*sin(a)*1.1;if(abs(c)<.02)return vec4(0.,0.,0.,1.);vec2 q=vec2(d.x/c,d.y)/z;q=q*(1.+.25*amt)+.5;if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(mix(vec3(.04,.02,.12),vec3(0.),length(d)),1.);return vec4(S(q).rgb*(.55+.45*abs(c)),1.);}'),
  E('d3', 'x_flag', '3D bayroq', 'vec4 fx(vec2 p){float w=sin(p.x*9.-t*4.)*.035*amt*p.x;float l=cos(p.x*9.-t*4.)*.28*amt*p.x;vec2 q=vec2(p.x,p.y+w);if(q.y<0.||q.y>1.)return vec4(.03,.04,.08,1.);return vec4(S(q).rgb*(1.+l),1.);}'),
  E('d3', 'x_fold', '3D buklanish', 'vec4 fx(vec2 p){float n=4.;float x=fract(p.x*n);float k=abs(x-.5)*2.;float z=1.-k*.18*amt;vec2 q=vec2(p.x,.5+(p.y-.5)/z);if(q.y<0.||q.y>1.)return vec4(.02,.02,.05,1.);return vec4(S(q).rgb*(1.-(x<.5?.34:0.)*amt),1.);}'),
  E('d3', 'x_stairs', '3D zinapoya', 'vec4 fx(vec2 p){float n=6.;float i=floor(p.y*n);float d=i/n;float s=mix(1.,.55+d*.45,amt);vec2 q=vec2(.5+(p.x-.5)/s,p.y);if(q.x<0.||q.x>1.)return vec4(vec3(.02,.02,.05)+d*.07,1.);return vec4(S(q).rgb*(.6+d*.4),1.);}'),
  E('d3', 'x_anaglyph', '3D stereo', 'vec4 fx(vec2 p){float d=.012*amt*(1.+length(p-.5));vec4 s=S(p);return vec4(lum(S(p-vec2(d,0.)).rgb)*1.05,S(p+vec2(d,0.)).g,S(p+vec2(d,0.)).b,s.a);}'),
  E('d3', 'x_depth', '3D chuqurlik', 'vec4 fx(vec2 p){vec2 o=vec2(sin(t*1.3),cos(t*1.1))*.03*amt;float l=lum(S(p).rgb);return S(.5+(p-.5)*.92+o*(l-.4)*2.);}'),
  E('d3', 'x_grid', '3D kataklar', 'vec4 fx(vec2 p){vec2 g=floor(p*vec2(5.,8.));vec2 f=fract(p*vec2(5.,8.))-.5;float a=sin(t*2.+g.x*.7+g.y*.5)*.9*amt;float c=cos(a);vec2 q=f/vec2(max(c,.05),1.);if(abs(q.x)>.48||abs(q.y)>.48)return vec4(.02,.02,.05,1.);vec2 u=(g+.5+q)/vec2(5.,8.);return vec4(S(u).rgb*(.5+.5*c),1.);}'),
  E('d3', 'x_terrain', '3D qatlam', 'vec4 fx(vec2 p){vec3 c=vec3(0.);float a=1.;for(int i=0;i<6;i++){float f=float(i)/5.;vec2 q=.5+(p-.5)*(1.-f*.22*amt)+vec2(sin(t+f*2.),cos(t*.8+f))*.006*f;vec4 s=S(q);float m=smoothstep(f-.15,f+.15,lum(s.rgb));c=mix(c,s.rgb,m);}return vec4(c,1.);}'),
  E('d3', 'x_hologram', 'Gologramma', 'vec4 fx(vec2 p){float d=sin(p.y*80.+t*8.)*.003*amt;vec4 s=S(p+vec2(d,0.));vec3 c=vec3(.25,.9,1.)*lum(s.rgb)*1.5*(.75+.25*sin(p.y*res.y*.8));c+=vec3(.1,.5,.7)*smoothstep(.8,1.,fract(p.y*3.-t));return vec4(mix(s.rgb,c,amt),s.a);}'),
];

const NATURE: EffectDef[] = [
  E('nature', 'n_snow', 'Qor', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 q=p*vec2(res.x/res.y,1.);float c=0.;for(int i=0;i<4;i++){float f=float(i)+1.;vec2 g=q*(6.*f);g.y+=t*(1.2+f*.3)*f*.5;g.x+=sin(t*.5+f)*.4;vec2 id=floor(g);vec2 u=fract(g)-.5;vec2 o=(vec2(rand(id),rand(id+1.))-.5)*.6;c+=smoothstep(.09/f+.03,.0,length(u-o))*.9/f*step(.4,rand(id+2.));}return vec4(s.rgb+c*amt,s.a);}'),
  E('nature', 'n_rain', "Yomg'ir", 'vec4 fx(vec2 p){vec2 g=vec2(p.x*70.+p.y*6.,p.y*5.+t*5.5);vec2 id=floor(g);vec2 f=fract(g);float k=step(.86,rand(vec2(id.x,1.)))*smoothstep(.0,.05,f.y)*smoothstep(.22,.05,f.y)*smoothstep(.5,.0,abs(f.x-.5));vec4 s=S(p+vec2(k*.01,0.));return vec4(s.rgb*(1.-.15*amt)+k*.5*amt,s.a);}'),
  E('nature', 'n_fog', 'Tuman', 'vec4 fx(vec2 p){vec4 s=S(p);float n=fbm(p*3.+vec2(t*.1,t*.04));return vec4(mix(s.rgb,vec3(.86,.88,.9),n*amt*.9),s.a);}'),
  E('nature', 'n_fire', 'Olov', 'vec4 fx(vec2 p){vec4 s=S(p);float n=fbm(vec2(p.x*6.,p.y*3.-t*1.5));float m=smoothstep(.1,.75,(1.-p.y*2.)+n-.42);vec3 c=mix(vec3(1.,.2,0.),vec3(1.,.85,.25),m);return vec4(s.rgb+c*m*amt,s.a);}'),
  E('nature', 'n_smoke', 'Tutun', 'vec4 fx(vec2 p){vec4 s=S(p);float n=fbm(vec2(p.x*4.+t*.1,p.y*3.-t*.3));float m=smoothstep(.3,.75,n)*smoothstep(1.,.1,p.y);return vec4(mix(s.rgb,vec3(.55),m*amt),s.a);}'),
  E('nature', 'n_stars', 'Yulduzlar', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 g=p*vec2(res.x/res.y,1.)*40.;vec2 id=floor(g);float r=rand(id);float tw=.5+.5*sin(t*4.+r*20.);float k=step(.9,r)*smoothstep(.2,0.,length(fract(g)-.5))*tw;return vec4(s.rgb+k*amt*1.5,s.a);}'),
  E('nature', 'n_petals', 'Gulbarglar', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 q=p*vec2(res.x/res.y,1.)*7.;q.y+=t*.5;q.x+=sin(t*.6+q.y)*.2;vec2 id=floor(q);vec2 u=fract(q)-.5;u=rot(t+rand(id)*6.)*u;float k=step(.55,rand(id))*smoothstep(.2,.17,length(u*vec2(1.,2.2)));return vec4(mix(s.rgb,vec3(1.,.45,.62),k*amt),s.a);}'),
  E('nature', 'n_bubbles', 'Pufakchalar', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 q=p*vec2(res.x/res.y,1.)*6.;q.y-=t*.5;vec2 id=floor(q);vec2 u=fract(q)-.5;float r=.12+rand(id)*.25;float d=length(u);float k=step(.5,rand(id+3.))*(smoothstep(r,r-.02,d)-smoothstep(r-.02,r-.05,d));return vec4(s.rgb+k*amt*.8,s.a);}'),
  E('nature', 'n_confetti', 'Konfetti', 'vec4 fx(vec2 p){vec4 s=S(p);vec2 q=p*vec2(res.x/res.y,1.)*11.;q.y+=t*1.3;vec2 id=floor(q);vec2 u=fract(q)-.5;u=rot(t*3.+rand(id)*6.)*u;float k=step(.68,rand(id))*step(abs(u.x),.16)*step(abs(u.y),.08);return vec4(mix(s.rgb,hsv(vec3(rand(id+4.),.85,1.)),k*amt),s.a);}'),
  E('nature', 'n_lightning', 'Chaqmoq', 'vec4 fx(vec2 p){vec4 s=S(p);float f=floor(t*3.);float on=step(.55,rand(vec2(f,1.)))*step(fract(t*3.),.3);float x=rand(vec2(f,2.))+(fbm(vec2(p.y*7.,f))-.5)*.32;float b=.004/(abs(p.x-x)+.004);return vec4(s.rgb*(1.+on*.5*amt)+vec3(.75,.85,1.)*b*on*amt,s.a);}'),
];

export const EFFECTS: EffectDef[] = [...FILTERS, ...D3, ...LIGHT, ...GLITCH, ...RETRO, ...MOTION, ...DISTORT, ...STYLE, ...NATURE];
export const EFFECT_BY_ID = new Map(EFFECTS.map(e => [e.id, e]));
