(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const loadImage = require('./lib/image-promise.js')
function random_list(size) {
    const result = [];
    for (var i = 0; i < size; i++) {
        result.push(Math.floor(255*Math.random()))
    }
    return result
}
function interpolate(a, b, v) {
    return [
        (1-v)*a[0]+ v*b[0],
        (1-v)*a[1]+ v*b[1],
        (1-v)*a[2]+ v*b[2],
        (1-v)*a[3]+ v*b[3]
    ]
}

const regl = require('./lib/regl.min.js')({
    pixelRatio: 1.0,
    extensions: [
        'oes_texture_float',
    ],
    optionalExtensions: [
        'oes_texture_half_float'
    ],
    attributes: {
        antialias: false
    },
    // onDone: main
});
main(regl)

function main(regl) {
    let w;
    let h;
    let scale = 1.0;

    let states = []

    let container = document.getElementById('container')
    let test = document.getElementById('test')
    let controlRoot = document.createElement('div');

    const clear_rect = require('./shaders/clear_rect.js')(regl)
    const initialize = require('./shaders/initialize.js')(regl)
    const transition = require('./shaders/transition.js')(regl)
    const compute = require('./shaders/compute.js')(regl)
    const draw = require('./shaders/draw.js')(regl)

    console.time('load_images')
    Promise.all([
        Promise.all([
            loadImage('imgs/title.png'),
            loadImage('imgs/gen_design.png')
        ]),
        Promise.all([
            loadImage('imgs/title_mobile.png'),
            loadImage('imgs/gen_design_mobile.png')
        ]),

    ]).then(([ images, mobile_images ]) => {
        console.timeEnd('load_images')

        const portrait_textures = mobile_images.map(regl.texture)
        const landscape_textures = images.map(regl.texture)
        let textures = landscape_textures

        const purple = [128/255, 66/255, 244/255, 1.0]
        const red = [214/255, 44/255, 98/255, 1.0]

        const state_colors = [
            [[.98, .98, .98, 1.0], purple],
            [[0, 0.0, .9, 1.0], [.92, .92, .92, 1.0]],
            [red, red]
        ]

        let colorA = state_colors[0][0]
        let colorB = state_colors[0][1]

        let rect = new Float32Array(4);
        let rectBuf = regl.buffer(rect);

        function scroll_index() {
            const step = container.scrollHeight / images.length
            const y = container.scrollTop
            const idx = Math.min(Math.floor(y / step), images.length -1)
            const percent = (y - idx*step) / step
            return [ idx, percent ]
        }

        let [ scroll_idx, scroll_percent ] = scroll_index()
        let last_scroll_idx = scroll_idx


        function restart() {
            console.log('restart')
            w = Math.floor(regl._gl.canvas.width * scale);
            h = Math.floor(regl._gl.canvas.height * scale);
            console.log(w, h)
            textures = w > 1200 ? landscape_textures : portrait_textures

            states = [0, 1].map(i => (states[i] || regl.framebuffer)({
                colorType: regl.hasExtension('oes_texture_half_float') ? 'half float' : 'float',
                width: w,
                height: h,
            }));
            const random = regl.texture({
              width: 512,
              height: 256,
              data: random_list(512*256*4)
            })
            initialize({ dst: states[0], texture: textures[0], random});
            update_scroll()
        }

        function update_scroll() {
            [scroll_idx, scroll_percent] = scroll_index()
            if (scroll_idx != last_scroll_idx) {
                console.log('transition', last_scroll_idx, scroll_idx)
                transition({
                    src: states[1],
                    dst: states[0],
                    old_texture: textures[last_scroll_idx],
                    new_texture: textures[scroll_idx],
                    random: regl.texture({
                        width: 512, height: 256, data: random_list(512*256*4)
                    })
                })
                last_scroll_idx = scroll_idx
            }

            let p = (scroll_percent)
            let foo
            if (scroll_idx == 0) {
                foo = p
            }
            if (p < 0.25) {
                foo = 0
            } else if (p > 0.75) {
                foo = 1.0
            } else {
                foo = (p-0.25) * 2.0
            }
            colorA = interpolate(state_colors[scroll_idx][0], state_colors[scroll_idx+1][0], foo)
            colorB = interpolate(state_colors[scroll_idx][1], state_colors[scroll_idx+1][1], foo)
        }

        container.addEventListener('scroll', (event) => {
            update_scroll()
        })

        restart()

        window.addEventListener('resize', restart)
        let itersPerFrame = 2
        let prevTime = null
        let slowCount = 0
        regl.frame(({tick, time}) => {
            if (prevTime) {
                var dt = time - prevTime;
                if (dt > 1.4 / 60) {
                    slowCount++;
                } else if (dt < 1.1 / 60) {
                    slowCount--;
                }
                if (slowCount > 10) {
                    slowCount = 0;
                    itersPerFrame = Math.max(1, itersPerFrame - 1);
                }
                if (slowCount < -10) {
                    slowCount = 0;
                    itersPerFrame = Math.min(10, itersPerFrame + 1);
                }
            }
            prevTime = time;

            for (var i = 0; i < itersPerFrame; i++) {
                compute({src: states[0], dst: states[1]});
                compute({src: states[1], dst: states[0]});
            }
            const bounds = test.getBoundingClientRect()
            clear_rect({
                dst: states[0],
                rect: [
                    bounds.left / window.innerWidth,
                    bounds.top / window.innerHeight,
                    bounds.right / window.innerWidth,
                    bounds.bottom / window.innerHeight
                ]
            });
            draw({ colorA, colorB, src: states[0] });
        })
    })
}
},{"./lib/image-promise.js":2,"./lib/regl.min.js":3,"./shaders/clear_rect.js":4,"./shaders/compute.js":5,"./shaders/draw.js":6,"./shaders/initialize.js":7,"./shaders/transition.js":8}],2:[function(require,module,exports){
/*! npm.im/image-promise 6.0.0 */
'use strict';

function load(image, attributes) {
	if (!image) {
		return Promise.reject();
	} else if (typeof image === 'string') {
		/* Create a <img> from a string */
		var src = image;
		image = new Image();
		Object.keys(attributes || {}).forEach(
			function (name) { return image.setAttribute(name, attributes[name]); }
		);
		image.src = src;
	} else if (image.length !== undefined) {
		/* Treat as multiple images */

		// Momentarily ignore errors
		var reflected = [].map.call(image, function (img) { return load(img, attributes).catch(function (err) { return err; }); });

		return Promise.all(reflected).then(function (results) {
			var loaded = results.filter(function (x) { return x.naturalWidth; });
			if (loaded.length === results.length) {
				return loaded;
			}
			return Promise.reject({
				loaded: loaded,
				errored: results.filter(function (x) { return !x.naturalWidth; })
			});
		});
	} else if (image.tagName !== 'IMG') {
		return Promise.reject();
	}

	var promise = new Promise(function (resolve, reject) {
		if (image.naturalWidth) {
			// If the browser can determine the naturalWidth the
			// image is already loaded successfully
			resolve(image);
		} else if (image.complete) {
			// If the image is complete but the naturalWidth is 0px
			// it is probably broken
			reject(image);
		} else {
			image.addEventListener('load', fullfill);
			image.addEventListener('error', fullfill);
		}
		function fullfill() {
			if (image.naturalWidth) {
				resolve(image);
			} else {
				reject(image);
			}
			image.removeEventListener('load', fullfill);
			image.removeEventListener('error', fullfill);
		}
	});
	promise.image = image;
	return promise;
}

module.exports = load;

},{}],3:[function(require,module,exports){
(function(aa,ia){"object"===typeof exports&&"undefined"!==typeof module?module.exports=ia():"function"===typeof define&&define.amd?define(ia):aa.createREGL=ia()})(this,function(){function aa(a,b){this.id=Ab++;this.type=a;this.data=b}function ia(a){if(0===a.length)return[];var b=a.charAt(0),c=a.charAt(a.length-1);if(1<a.length&&b===c&&('"'===b||"'"===b))return['"'+a.substr(1,a.length-2).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'];if(b=/\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(a))return ia(a.substr(0,
b.index)).concat(ia(b[1])).concat(ia(a.substr(b.index+b[0].length)));b=a.split(".");if(1===b.length)return['"'+a.replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'];a=[];for(c=0;c<b.length;++c)a=a.concat(ia(b[c]));return a}function Za(a){return"["+ia(a).join("][")+"]"}function Bb(){var a={"":0},b=[""];return{id:function(c){var e=a[c];if(e)return e;e=a[c]=b.length;b.push(c);return e},str:function(a){return b[a]}}}function Cb(a,b,c){function e(){var b=window.innerWidth,e=window.innerHeight;a!==document.body&&
(e=a.getBoundingClientRect(),b=e.right-e.left,e=e.bottom-e.top);g.width=c*b;g.height=c*e;E(g.style,{width:b+"px",height:e+"px"})}var g=document.createElement("canvas");E(g.style,{border:0,margin:0,padding:0,top:0,left:0});a.appendChild(g);a===document.body&&(g.style.position="absolute",E(a.style,{margin:0,padding:0}));window.addEventListener("resize",e,!1);e();return{canvas:g,onDestroy:function(){window.removeEventListener("resize",e);a.removeChild(g)}}}function Db(a,b){function c(c){try{return a.getContext(c,
b)}catch(g){return null}}return c("webgl")||c("experimental-webgl")||c("webgl-experimental")}function $a(a){return"string"===typeof a?a.split():a}function ab(a){return"string"===typeof a?document.querySelector(a):a}function Eb(a){var b=a||{},c,e,g,d;a={};var n=[],f=[],r="undefined"===typeof window?1:window.devicePixelRatio,q=!1,t=function(a){},m=function(){};"string"===typeof b?c=document.querySelector(b):"object"===typeof b&&("string"===typeof b.nodeName&&"function"===typeof b.appendChild&&"function"===
typeof b.getBoundingClientRect?c=b:"function"===typeof b.drawArrays||"function"===typeof b.drawElements?(d=b,g=d.canvas):("gl"in b?d=b.gl:"canvas"in b?g=ab(b.canvas):"container"in b&&(e=ab(b.container)),"attributes"in b&&(a=b.attributes),"extensions"in b&&(n=$a(b.extensions)),"optionalExtensions"in b&&(f=$a(b.optionalExtensions)),"onDone"in b&&(t=b.onDone),"profile"in b&&(q=!!b.profile),"pixelRatio"in b&&(r=+b.pixelRatio)));c&&("canvas"===c.nodeName.toLowerCase()?g=c:e=c);if(!d){if(!g){c=Cb(e||document.body,
t,r);if(!c)return null;g=c.canvas;m=c.onDestroy}d=Db(g,a)}return d?{gl:d,canvas:g,container:e,extensions:n,optionalExtensions:f,pixelRatio:r,profile:q,onDone:t,onDestroy:m}:(m(),t("webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org"),null)}function Fb(a,b){function c(b){b=b.toLowerCase();var c;try{c=e[b]=a.getExtension(b)}catch(g){}return!!c}for(var e={},g=0;g<b.extensions.length;++g){var d=b.extensions[g];if(!c(d))return b.onDestroy(),b.onDone('"'+d+'" extension is not supported by the current WebGL context, try upgrading your system or a different browser'),
null}b.optionalExtensions.forEach(c);return{extensions:e,restore:function(){Object.keys(e).forEach(function(a){if(e[a]&&!c(a))throw Error("(regl): error restoring extension "+a);})}}}function J(a,b){for(var c=Array(a),e=0;e<a;++e)c[e]=b(e);return c}function bb(a){var b,c;b=(65535<a)<<4;a>>>=b;c=(255<a)<<3;a>>>=c;b|=c;c=(15<a)<<2;a>>>=c;b|=c;c=(3<a)<<1;return b|c|a>>>c>>1}function cb(){function a(a){a:{for(var b=16;268435456>=b;b*=16)if(a<=b){a=b;break a}a=0}b=c[bb(a)>>2];return 0<b.length?b.pop():
new ArrayBuffer(a)}function b(a){c[bb(a.byteLength)>>2].push(a)}var c=J(8,function(){return[]});return{alloc:a,free:b,allocType:function(b,c){var d=null;switch(b){case 5120:d=new Int8Array(a(c),0,c);break;case 5121:d=new Uint8Array(a(c),0,c);break;case 5122:d=new Int16Array(a(2*c),0,c);break;case 5123:d=new Uint16Array(a(2*c),0,c);break;case 5124:d=new Int32Array(a(4*c),0,c);break;case 5125:d=new Uint32Array(a(4*c),0,c);break;case 5126:d=new Float32Array(a(4*c),0,c);break;default:return null}return d.length!==
c?d.subarray(0,c):d},freeType:function(a){b(a.buffer)}}}function ma(a){return!!a&&"object"===typeof a&&Array.isArray(a.shape)&&Array.isArray(a.stride)&&"number"===typeof a.offset&&a.shape.length===a.stride.length&&(Array.isArray(a.data)||M(a.data))}function db(a,b,c,e,g,d){for(var n=0;n<b;++n)for(var f=a[n],r=0;r<c;++r)for(var q=f[r],t=0;t<e;++t)g[d++]=q[t]}function eb(a,b,c,e,g){for(var d=1,n=c+1;n<b.length;++n)d*=b[n];var f=b[c];if(4===b.length-c){var r=b[c+1],q=b[c+2];b=b[c+3];for(n=0;n<f;++n)db(a[n],
r,q,b,e,g),g+=d}else for(n=0;n<f;++n)eb(a[n],b,c+1,e,g),g+=d}function Ha(a){return Ia[Object.prototype.toString.call(a)]|0}function fb(a,b){for(var c=0;c<b.length;++c)a[c]=b[c]}function gb(a,b,c,e,g,d,n){for(var f=0,r=0;r<c;++r)for(var q=0;q<e;++q)a[f++]=b[g*r+d*q+n]}function Gb(a,b,c,e){function g(b){this.id=r++;this.buffer=a.createBuffer();this.type=b;this.usage=35044;this.byteLength=0;this.dimension=1;this.dtype=5121;this.persistentData=null;c.profile&&(this.stats={size:0})}function d(b,c,k){b.byteLength=
c.byteLength;a.bufferData(b.type,c,k)}function n(a,b,c,h,l,e){a.usage=c;if(Array.isArray(b)){if(a.dtype=h||5126,0<b.length)if(Array.isArray(b[0])){l=hb(b);for(var v=h=1;v<l.length;++v)h*=l[v];a.dimension=h;b=Qa(b,l,a.dtype);d(a,b,c);e?a.persistentData=b:x.freeType(b)}else"number"===typeof b[0]?(a.dimension=l,l=x.allocType(a.dtype,b.length),fb(l,b),d(a,l,c),e?a.persistentData=l:x.freeType(l)):M(b[0])&&(a.dimension=b[0].length,a.dtype=h||Ha(b[0])||5126,b=Qa(b,[b.length,b[0].length],a.dtype),d(a,b,c),
e?a.persistentData=b:x.freeType(b))}else if(M(b))a.dtype=h||Ha(b),a.dimension=l,d(a,b,c),e&&(a.persistentData=new Uint8Array(new Uint8Array(b.buffer)));else if(ma(b)){l=b.shape;var g=b.stride,v=b.offset,f=0,q=0,r=0,t=0;1===l.length?(f=l[0],q=1,r=g[0],t=0):2===l.length&&(f=l[0],q=l[1],r=g[0],t=g[1]);a.dtype=h||Ha(b.data)||5126;a.dimension=q;l=x.allocType(a.dtype,f*q);gb(l,b.data,f,q,r,t,v);d(a,l,c);e?a.persistentData=l:x.freeType(l)}}function f(c){b.bufferCount--;for(var d=0;d<e.state.length;++d){var k=
e.state[d];k.buffer===c&&(a.disableVertexAttribArray(d),k.buffer=null)}a.deleteBuffer(c.buffer);c.buffer=null;delete q[c.id]}var r=0,q={};g.prototype.bind=function(){a.bindBuffer(this.type,this.buffer)};g.prototype.destroy=function(){f(this)};var t=[];c.profile&&(b.getTotalBufferSize=function(){var a=0;Object.keys(q).forEach(function(b){a+=q[b].stats.size});return a});return{create:function(m,e,d,h){function l(b){var m=35044,e=null,d=0,k=0,g=1;Array.isArray(b)||M(b)||ma(b)?e=b:"number"===typeof b?
d=b|0:b&&("data"in b&&(e=b.data),"usage"in b&&(m=jb[b.usage]),"type"in b&&(k=Ra[b.type]),"dimension"in b&&(g=b.dimension|0),"length"in b&&(d=b.length|0));u.bind();e?n(u,e,m,k,g,h):(d&&a.bufferData(u.type,d,m),u.dtype=k||5121,u.usage=m,u.dimension=g,u.byteLength=d);c.profile&&(u.stats.size=u.byteLength*ja[u.dtype]);return l}b.bufferCount++;var u=new g(e);q[u.id]=u;d||l(m);l._reglType="buffer";l._buffer=u;l.subdata=function(b,c){var m=(c||0)|0,e;u.bind();if(M(b))a.bufferSubData(u.type,m,b);else if(Array.isArray(b)){if(0<
b.length)if("number"===typeof b[0]){var d=x.allocType(u.dtype,b.length);fb(d,b);a.bufferSubData(u.type,m,d);x.freeType(d)}else if(Array.isArray(b[0])||M(b[0]))e=hb(b),d=Qa(b,e,u.dtype),a.bufferSubData(u.type,m,d),x.freeType(d)}else if(ma(b)){e=b.shape;var h=b.stride,k=d=0,g=0,F=0;1===e.length?(d=e[0],k=1,g=h[0],F=0):2===e.length&&(d=e[0],k=e[1],g=h[0],F=h[1]);e=Array.isArray(b.data)?u.dtype:Ha(b.data);e=x.allocType(e,d*k);gb(e,b.data,d,k,g,F,b.offset);a.bufferSubData(u.type,m,e);x.freeType(e)}return l};
c.profile&&(l.stats=u.stats);l.destroy=function(){f(u)};return l},createStream:function(a,b){var c=t.pop();c||(c=new g(a));c.bind();n(c,b,35040,0,1,!1);return c},destroyStream:function(a){t.push(a)},clear:function(){S(q).forEach(f);t.forEach(f)},getBuffer:function(a){return a&&a._buffer instanceof g?a._buffer:null},restore:function(){S(q).forEach(function(b){b.buffer=a.createBuffer();a.bindBuffer(b.type,b.buffer);a.bufferData(b.type,b.persistentData||b.byteLength,b.usage)})},_initBuffer:n}}function Hb(a,
b,c,e){function g(a){this.id=r++;f[this.id]=this;this.buffer=a;this.primType=4;this.type=this.vertCount=0}function d(e,d,g,h,l,u,v){e.buffer.bind();if(d){var f=v;v||M(d)&&(!ma(d)||M(d.data))||(f=b.oes_element_index_uint?5125:5123);c._initBuffer(e.buffer,d,g,f,3)}else a.bufferData(34963,u,g),e.buffer.dtype=f||5121,e.buffer.usage=g,e.buffer.dimension=3,e.buffer.byteLength=u;f=v;if(!v){switch(e.buffer.dtype){case 5121:case 5120:f=5121;break;case 5123:case 5122:f=5123;break;case 5125:case 5124:f=5125}e.buffer.dtype=
f}e.type=f;d=l;0>d&&(d=e.buffer.byteLength,5123===f?d>>=1:5125===f&&(d>>=2));e.vertCount=d;d=h;0>h&&(d=4,h=e.buffer.dimension,1===h&&(d=0),2===h&&(d=1),3===h&&(d=4));e.primType=d}function n(a){e.elementsCount--;delete f[a.id];a.buffer.destroy();a.buffer=null}var f={},r=0,q={uint8:5121,uint16:5123};b.oes_element_index_uint&&(q.uint32=5125);g.prototype.bind=function(){this.buffer.bind()};var t=[];return{create:function(a,b){function k(a){if(a)if("number"===typeof a)h(a),l.primType=4,l.vertCount=a|0,
l.type=5121;else{var b=null,c=35044,e=-1,g=-1,f=0,m=0;if(Array.isArray(a)||M(a)||ma(a))b=a;else if("data"in a&&(b=a.data),"usage"in a&&(c=jb[a.usage]),"primitive"in a&&(e=Sa[a.primitive]),"count"in a&&(g=a.count|0),"type"in a&&(m=q[a.type]),"length"in a)f=a.length|0;else if(f=g,5123===m||5122===m)f*=2;else if(5125===m||5124===m)f*=4;d(l,b,c,e,g,f,m)}else h(),l.primType=4,l.vertCount=0,l.type=5121;return k}var h=c.create(null,34963,!0),l=new g(h._buffer);e.elementsCount++;k(a);k._reglType="elements";
k._elements=l;k.subdata=function(a,b){h.subdata(a,b);return k};k.destroy=function(){n(l)};return k},createStream:function(a){var b=t.pop();b||(b=new g(c.create(null,34963,!0,!1)._buffer));d(b,a,35040,-1,-1,0,0);return b},destroyStream:function(a){t.push(a)},getElements:function(a){return"function"===typeof a&&a._elements instanceof g?a._elements:null},clear:function(){S(f).forEach(n)}}}function kb(a){for(var b=x.allocType(5123,a.length),c=0;c<a.length;++c)if(isNaN(a[c]))b[c]=65535;else if(Infinity===
a[c])b[c]=31744;else if(-Infinity===a[c])b[c]=64512;else{lb[0]=a[c];var e=Ib[0],g=e>>>31<<15,d=(e<<1>>>24)-127,e=e>>13&1023;b[c]=-24>d?g:-14>d?g+(e+1024>>-14-d):15<d?g+31744:g+(d+15<<10)+e}return b}function pa(a){return Array.isArray(a)||M(a)}function Ea(a){return"[object "+a+"]"}function mb(a){return Array.isArray(a)&&(0===a.length||"number"===typeof a[0])}function nb(a){return Array.isArray(a)&&0!==a.length&&pa(a[0])?!0:!1}function na(a){return Object.prototype.toString.call(a)}function Ta(a){if(!a)return!1;
var b=na(a);return 0<=Jb.indexOf(b)?!0:mb(a)||nb(a)||ma(a)}function ob(a,b){36193===a.type?(a.data=kb(b),x.freeType(b)):a.data=b}function Ja(a,b,c,e,g,d){a="undefined"!==typeof y[a]?y[a]:L[a]*qa[b];d&&(a*=6);if(g){for(e=0;1<=c;)e+=a*c*c,c/=2;return e}return a*c*e}function Kb(a,b,c,e,g,d,n){function f(){this.format=this.internalformat=6408;this.type=5121;this.flipY=this.premultiplyAlpha=this.compressed=!1;this.unpackAlignment=1;this.colorSpace=37444;this.channels=this.height=this.width=0}function r(a,
b){a.internalformat=b.internalformat;a.format=b.format;a.type=b.type;a.compressed=b.compressed;a.premultiplyAlpha=b.premultiplyAlpha;a.flipY=b.flipY;a.unpackAlignment=b.unpackAlignment;a.colorSpace=b.colorSpace;a.width=b.width;a.height=b.height;a.channels=b.channels}function q(a,b){if("object"===typeof b&&b){"premultiplyAlpha"in b&&(a.premultiplyAlpha=b.premultiplyAlpha);"flipY"in b&&(a.flipY=b.flipY);"alignment"in b&&(a.unpackAlignment=b.alignment);"colorSpace"in b&&(a.colorSpace=wa[b.colorSpace]);
"type"in b&&(a.type=G[b.type]);var c=a.width,e=a.height,d=a.channels,h=!1;"shape"in b?(c=b.shape[0],e=b.shape[1],3===b.shape.length&&(d=b.shape[2],h=!0)):("radius"in b&&(c=e=b.radius),"width"in b&&(c=b.width),"height"in b&&(e=b.height),"channels"in b&&(d=b.channels,h=!0));a.width=c|0;a.height=e|0;a.channels=d|0;c=!1;"format"in b&&(c=b.format,e=a.internalformat=U[c],a.format=Lb[e],c in G&&!("type"in b)&&(a.type=G[c]),c in W&&(a.compressed=!0),c=!0);!h&&c?a.channels=L[a.format]:h&&!c&&a.channels!==
La[a.format]&&(a.format=a.internalformat=La[a.channels])}}function t(b){a.pixelStorei(37440,b.flipY);a.pixelStorei(37441,b.premultiplyAlpha);a.pixelStorei(37443,b.colorSpace);a.pixelStorei(3317,b.unpackAlignment)}function m(){f.call(this);this.yOffset=this.xOffset=0;this.data=null;this.needsFree=!1;this.element=null;this.needsCopy=!1}function C(a,b){var c=null;Ta(b)?c=b:b&&(q(a,b),"x"in b&&(a.xOffset=b.x|0),"y"in b&&(a.yOffset=b.y|0),Ta(b.data)&&(c=b.data));if(b.copy){var e=g.viewportWidth,d=g.viewportHeight;
a.width=a.width||e-a.xOffset;a.height=a.height||d-a.yOffset;a.needsCopy=!0}else if(!c)a.width=a.width||1,a.height=a.height||1,a.channels=a.channels||4;else if(M(c))a.channels=a.channels||4,a.data=c,"type"in b||5121!==a.type||(a.type=Ia[Object.prototype.toString.call(c)]|0);else if(mb(c)){a.channels=a.channels||4;e=c;d=e.length;switch(a.type){case 5121:case 5123:case 5125:case 5126:d=x.allocType(a.type,d);d.set(e);a.data=d;break;case 36193:a.data=kb(e)}a.alignment=1;a.needsFree=!0}else if(ma(c)){e=
c.data;Array.isArray(e)||5121!==a.type||(a.type=Ia[Object.prototype.toString.call(e)]|0);var d=c.shape,h=c.stride,f,l,p,w;3===d.length?(p=d[2],w=h[2]):w=p=1;f=d[0];l=d[1];d=h[0];h=h[1];a.alignment=1;a.width=f;a.height=l;a.channels=p;a.format=a.internalformat=La[p];a.needsFree=!0;f=w;c=c.offset;p=a.width;w=a.height;l=a.channels;for(var z=x.allocType(36193===a.type?5126:a.type,p*w*l),I=0,fa=0;fa<w;++fa)for(var ga=0;ga<p;++ga)for(var xa=0;xa<l;++xa)z[I++]=e[d*ga+h*fa+f*xa+c];ob(a,z)}else if(na(c)===
Ua||na(c)===pb)na(c)===Ua?a.element=c:a.element=c.canvas,a.width=a.element.width,a.height=a.element.height,a.channels=4;else if(na(c)===qb)a.element=c,a.width=c.width,a.height=c.height,a.channels=4;else if(na(c)===rb)a.element=c,a.width=c.naturalWidth,a.height=c.naturalHeight,a.channels=4;else if(na(c)===sb)a.element=c,a.width=c.videoWidth,a.height=c.videoHeight,a.channels=4;else if(nb(c)){e=a.width||c[0].length;d=a.height||c.length;h=a.channels;h=pa(c[0][0])?h||c[0][0].length:h||1;f=Ma.shape(c);
p=1;for(w=0;w<f.length;++w)p*=f[w];p=x.allocType(36193===a.type?5126:a.type,p);Ma.flatten(c,f,"",p);ob(a,p);a.alignment=1;a.width=e;a.height=d;a.channels=h;a.format=a.internalformat=La[h];a.needsFree=!0}}function k(b,c,d,h,f){var g=b.element,l=b.data,k=b.internalformat,p=b.format,w=b.type,z=b.width,I=b.height;t(b);g?a.texSubImage2D(c,f,d,h,p,w,g):b.compressed?a.compressedTexSubImage2D(c,f,d,h,k,z,I,l):b.needsCopy?(e(),a.copyTexSubImage2D(c,f,d,h,b.xOffset,b.yOffset,z,I)):a.texSubImage2D(c,f,d,h,z,
I,p,w,l)}function h(){return P.pop()||new m}function l(a){a.needsFree&&x.freeType(a.data);m.call(a);P.push(a)}function u(){f.call(this);this.genMipmaps=!1;this.mipmapHint=4352;this.mipmask=0;this.images=Array(16)}function v(a,b,c){var d=a.images[0]=h();a.mipmask=1;d.width=a.width=b;d.height=a.height=c;d.channels=a.channels=4}function N(a,b){var c=null;if(Ta(b))c=a.images[0]=h(),r(c,a),C(c,b),a.mipmask=1;else if(q(a,b),Array.isArray(b.mipmap))for(var d=b.mipmap,e=0;e<d.length;++e)c=a.images[e]=h(),
r(c,a),c.width>>=e,c.height>>=e,C(c,d[e]),a.mipmask|=1<<e;else c=a.images[0]=h(),r(c,a),C(c,b),a.mipmask=1;r(a,a.images[0])}function B(b,c){for(var d=b.images,h=0;h<d.length&&d[h];++h){var f=d[h],g=c,l=h,k=f.element,p=f.data,w=f.internalformat,z=f.format,I=f.type,fa=f.width,ga=f.height,xa=f.channels;t(f);k?a.texImage2D(g,l,z,z,I,k):f.compressed?a.compressedTexImage2D(g,l,w,fa,ga,0,p):f.needsCopy?(e(),a.copyTexImage2D(g,l,z,f.xOffset,f.yOffset,fa,ga,0)):((f=!p)&&(p=x.zero.allocType(I,fa*ga*xa)),a.texImage2D(g,
l,z,fa,ga,0,z,I,p),f&&p&&x.zero.freeType(p))}}function D(){var a=tb.pop()||new u;f.call(a);for(var b=a.mipmask=0;16>b;++b)a.images[b]=null;return a}function ib(a){for(var b=a.images,c=0;c<b.length;++c)b[c]&&l(b[c]),b[c]=null;tb.push(a)}function y(){this.magFilter=this.minFilter=9728;this.wrapT=this.wrapS=33071;this.anisotropic=1;this.genMipmaps=!1;this.mipmapHint=4352}function O(a,b){"min"in b&&(a.minFilter=Va[b.min],0<=Mb.indexOf(a.minFilter)&&!("faces"in b)&&(a.genMipmaps=!0));"mag"in b&&(a.magFilter=
V[b.mag]);var c=a.wrapS,d=a.wrapT;if("wrap"in b){var e=b.wrap;"string"===typeof e?c=d=K[e]:Array.isArray(e)&&(c=K[e[0]],d=K[e[1]])}else"wrapS"in b&&(c=K[b.wrapS]),"wrapT"in b&&(d=K[b.wrapT]);a.wrapS=c;a.wrapT=d;"anisotropic"in b&&(a.anisotropic=b.anisotropic);if("mipmap"in b){c=!1;switch(typeof b.mipmap){case "string":a.mipmapHint=ua[b.mipmap];c=a.genMipmaps=!0;break;case "boolean":c=a.genMipmaps=b.mipmap;break;case "object":a.genMipmaps=!1,c=!0}!c||"min"in b||(a.minFilter=9984)}}function R(c,d){a.texParameteri(d,
10241,c.minFilter);a.texParameteri(d,10240,c.magFilter);a.texParameteri(d,10242,c.wrapS);a.texParameteri(d,10243,c.wrapT);b.ext_texture_filter_anisotropic&&a.texParameteri(d,34046,c.anisotropic);c.genMipmaps&&(a.hint(33170,c.mipmapHint),a.generateMipmap(d))}function F(b){f.call(this);this.mipmask=0;this.internalformat=6408;this.id=ya++;this.refCount=1;this.target=b;this.texture=a.createTexture();this.unit=-1;this.bindCount=0;this.texInfo=new y;n.profile&&(this.stats={size:0})}function T(b){a.activeTexture(33984);
a.bindTexture(b.target,b.texture)}function Aa(){var b=ha[0];b?a.bindTexture(b.target,b.texture):a.bindTexture(3553,null)}function A(b){var c=b.texture,e=b.unit,h=b.target;0<=e&&(a.activeTexture(33984+e),a.bindTexture(h,null),ha[e]=null);a.deleteTexture(c);b.texture=null;b.params=null;b.pixels=null;b.refCount=0;delete X[b.id];d.textureCount--}var ua={"don't care":4352,"dont care":4352,nice:4354,fast:4353},K={repeat:10497,clamp:33071,mirror:33648},V={nearest:9728,linear:9729},Va=E({mipmap:9987,"nearest mipmap nearest":9984,
"linear mipmap nearest":9985,"nearest mipmap linear":9986,"linear mipmap linear":9987},V),wa={none:0,browser:37444},G={uint8:5121,rgba4:32819,rgb565:33635,"rgb5 a1":32820},U={alpha:6406,luminance:6409,"luminance alpha":6410,rgb:6407,rgba:6408,rgba4:32854,"rgb5 a1":32855,rgb565:36194},W={};b.ext_srgb&&(U.srgb=35904,U.srgba=35906);b.oes_texture_float&&(G.float32=G["float"]=5126);b.oes_texture_half_float&&(G.float16=G["half float"]=36193);b.webgl_depth_texture&&(E(U,{depth:6402,"depth stencil":34041}),
E(G,{uint16:5123,uint32:5125,"depth stencil":34042}));b.webgl_compressed_texture_s3tc&&E(W,{"rgb s3tc dxt1":33776,"rgba s3tc dxt1":33777,"rgba s3tc dxt3":33778,"rgba s3tc dxt5":33779});b.webgl_compressed_texture_atc&&E(W,{"rgb atc":35986,"rgba atc explicit alpha":35987,"rgba atc interpolated alpha":34798});b.webgl_compressed_texture_pvrtc&&E(W,{"rgb pvrtc 4bppv1":35840,"rgb pvrtc 2bppv1":35841,"rgba pvrtc 4bppv1":35842,"rgba pvrtc 2bppv1":35843});b.webgl_compressed_texture_etc1&&(W["rgb etc1"]=36196);
var Nb=Array.prototype.slice.call(a.getParameter(34467));Object.keys(W).forEach(function(a){var b=W[a];0<=Nb.indexOf(b)&&(U[a]=b)});var ca=Object.keys(U);c.textureFormats=ca;var J=[];Object.keys(U).forEach(function(a){J[U[a]]=a});var da=[];Object.keys(G).forEach(function(a){da[G[a]]=a});var oa=[];Object.keys(V).forEach(function(a){oa[V[a]]=a});var za=[];Object.keys(Va).forEach(function(a){za[Va[a]]=a});var ka=[];Object.keys(K).forEach(function(a){ka[K[a]]=a});var Lb=ca.reduce(function(a,b){var c=
U[b];6409===c||6406===c||6409===c||6410===c||6402===c||34041===c?a[c]=c:32855===c||0<=b.indexOf("rgba")?a[c]=6408:a[c]=6407;return a},{}),P=[],tb=[],ya=0,X={},ea=c.maxTextureUnits,ha=Array(ea).map(function(){return null});E(F.prototype,{bind:function(){this.bindCount+=1;var b=this.unit;if(0>b){for(var c=0;c<ea;++c){var e=ha[c];if(e){if(0<e.bindCount)continue;e.unit=-1}ha[c]=this;b=c;break}n.profile&&d.maxTextureUnits<b+1&&(d.maxTextureUnits=b+1);this.unit=b;a.activeTexture(33984+b);a.bindTexture(this.target,
this.texture)}return b},unbind:function(){--this.bindCount},decRef:function(){0>=--this.refCount&&A(this)}});n.profile&&(d.getTotalTextureSize=function(){var a=0;Object.keys(X).forEach(function(b){a+=X[b].stats.size});return a});return{create2D:function(b,c){function e(a,b){var c=f.texInfo;y.call(c);var d=D();"number"===typeof a?"number"===typeof b?v(d,a|0,b|0):v(d,a|0,a|0):a?(O(c,a),N(d,a)):v(d,1,1);c.genMipmaps&&(d.mipmask=(d.width<<1)-1);f.mipmask=d.mipmask;r(f,d);f.internalformat=d.internalformat;
e.width=d.width;e.height=d.height;T(f);B(d,3553);R(c,3553);Aa();ib(d);n.profile&&(f.stats.size=Ja(f.internalformat,f.type,d.width,d.height,c.genMipmaps,!1));e.format=J[f.internalformat];e.type=da[f.type];e.mag=oa[c.magFilter];e.min=za[c.minFilter];e.wrapS=ka[c.wrapS];e.wrapT=ka[c.wrapT];return e}var f=new F(3553);X[f.id]=f;d.textureCount++;e(b,c);e.subimage=function(a,b,c,d){b|=0;c|=0;d|=0;var p=h();r(p,f);p.width=0;p.height=0;C(p,a);p.width=p.width||(f.width>>d)-b;p.height=p.height||(f.height>>d)-
c;T(f);k(p,3553,b,c,d);Aa();l(p);return e};e.resize=function(b,c){var d=b|0,h=c|0||d;if(d===f.width&&h===f.height)return e;e.width=f.width=d;e.height=f.height=h;T(f);for(var p,w=f.channels,z=f.type,I=0;f.mipmask>>I;++I){var fa=d>>I,ga=h>>I;if(!fa||!ga)break;p=x.zero.allocType(z,fa*ga*w);a.texImage2D(3553,I,f.format,fa,ga,0,f.format,f.type,p);p&&x.zero.freeType(p)}Aa();n.profile&&(f.stats.size=Ja(f.internalformat,f.type,d,h,!1,!1));return e};e._reglType="texture2d";e._texture=f;n.profile&&(e.stats=
f.stats);e.destroy=function(){f.decRef()};return e},createCube:function(b,c,e,f,g,ua){function A(a,b,c,d,e,f){var H,Y=m.texInfo;y.call(Y);for(H=0;6>H;++H)p[H]=D();if("number"===typeof a||!a)for(a=a|0||1,H=0;6>H;++H)v(p[H],a,a);else if("object"===typeof a)if(b)N(p[0],a),N(p[1],b),N(p[2],c),N(p[3],d),N(p[4],e),N(p[5],f);else if(O(Y,a),q(m,a),"faces"in a)for(a=a.faces,H=0;6>H;++H)r(p[H],m),N(p[H],a[H]);else for(H=0;6>H;++H)N(p[H],a);r(m,p[0]);m.mipmask=Y.genMipmaps?(p[0].width<<1)-1:p[0].mipmask;m.internalformat=
p[0].internalformat;A.width=p[0].width;A.height=p[0].height;T(m);for(H=0;6>H;++H)B(p[H],34069+H);R(Y,34067);Aa();n.profile&&(m.stats.size=Ja(m.internalformat,m.type,A.width,A.height,Y.genMipmaps,!0));A.format=J[m.internalformat];A.type=da[m.type];A.mag=oa[Y.magFilter];A.min=za[Y.minFilter];A.wrapS=ka[Y.wrapS];A.wrapT=ka[Y.wrapT];for(H=0;6>H;++H)ib(p[H]);return A}var m=new F(34067);X[m.id]=m;d.cubeCount++;var p=Array(6);A(b,c,e,f,g,ua);A.subimage=function(a,b,c,p,d){c|=0;p|=0;d|=0;var e=h();r(e,m);
e.width=0;e.height=0;C(e,b);e.width=e.width||(m.width>>d)-c;e.height=e.height||(m.height>>d)-p;T(m);k(e,34069+a,c,p,d);Aa();l(e);return A};A.resize=function(b){b|=0;if(b!==m.width){A.width=m.width=b;A.height=m.height=b;T(m);for(var c=0;6>c;++c)for(var p=0;m.mipmask>>p;++p)a.texImage2D(34069+c,p,m.format,b>>p,b>>p,0,m.format,m.type,null);Aa();n.profile&&(m.stats.size=Ja(m.internalformat,m.type,A.width,A.height,!1,!0));return A}};A._reglType="textureCube";A._texture=m;n.profile&&(A.stats=m.stats);A.destroy=
function(){m.decRef()};return A},clear:function(){for(var b=0;b<ea;++b)a.activeTexture(33984+b),a.bindTexture(3553,null),ha[b]=null;S(X).forEach(A);d.cubeCount=0;d.textureCount=0},getTexture:function(a){return null},restore:function(){for(var b=0;b<ea;++b){var c=ha[b];c&&(c.bindCount=0,c.unit=-1,ha[b]=null)}S(X).forEach(function(b){b.texture=a.createTexture();a.bindTexture(b.target,b.texture);for(var c=0;32>c;++c)if(0!==(b.mipmask&1<<c))if(3553===b.target)a.texImage2D(3553,c,b.internalformat,b.width>>
c,b.height>>c,0,b.internalformat,b.type,null);else for(var d=0;6>d;++d)a.texImage2D(34069+d,c,b.internalformat,b.width>>c,b.height>>c,0,b.internalformat,b.type,null);R(b.texInfo,b.target)})}}}function Ob(a,b,c,e,g,d){function n(a,b,c){this.target=a;this.texture=b;this.renderbuffer=c;var d=a=0;b?(a=b.width,d=b.height):c&&(a=c.width,d=c.height);this.width=a;this.height=d}function f(a){a&&(a.texture&&a.texture._texture.decRef(),a.renderbuffer&&a.renderbuffer._renderbuffer.decRef())}function r(a,b,c){a&&
(a.texture?a.texture._texture.refCount+=1:a.renderbuffer._renderbuffer.refCount+=1)}function q(b,c){c&&(c.texture?a.framebufferTexture2D(36160,b,c.target,c.texture._texture.texture,0):a.framebufferRenderbuffer(36160,b,36161,c.renderbuffer._renderbuffer.renderbuffer))}function t(a){var b=3553,c=null,d=null,e=a;"object"===typeof a&&(e=a.data,"target"in a&&(b=a.target|0));a=e._reglType;"texture2d"===a?c=e:"textureCube"===a?c=e:"renderbuffer"===a&&(d=e,b=36161);return new n(b,c,d)}function m(a,b,c,d,
f){if(c)return a=e.create2D({width:a,height:b,format:d,type:f}),a._texture.refCount=0,new n(3553,a,null);a=g.create({width:a,height:b,format:d});a._renderbuffer.refCount=0;return new n(36161,null,a)}function C(a){return a&&(a.texture||a.renderbuffer)}function k(a,b,c){a&&(a.texture?a.texture.resize(b,c):a.renderbuffer&&a.renderbuffer.resize(b,c),a.width=b,a.height=c)}function h(){this.id=O++;R[this.id]=this;this.framebuffer=a.createFramebuffer();this.height=this.width=0;this.colorAttachments=[];this.depthStencilAttachment=
this.stencilAttachment=this.depthAttachment=null}function l(a){a.colorAttachments.forEach(f);f(a.depthAttachment);f(a.stencilAttachment);f(a.depthStencilAttachment)}function u(b){a.deleteFramebuffer(b.framebuffer);b.framebuffer=null;d.framebufferCount--;delete R[b.id]}function v(b){var d;a.bindFramebuffer(36160,b.framebuffer);var e=b.colorAttachments;for(d=0;d<e.length;++d)q(36064+d,e[d]);for(d=e.length;d<c.maxColorAttachments;++d)a.framebufferTexture2D(36160,36064+d,3553,null,0);a.framebufferTexture2D(36160,
33306,3553,null,0);a.framebufferTexture2D(36160,36096,3553,null,0);a.framebufferTexture2D(36160,36128,3553,null,0);q(36096,b.depthAttachment);q(36128,b.stencilAttachment);q(33306,b.depthStencilAttachment);a.checkFramebufferStatus(36160);a.isContextLost();a.bindFramebuffer(36160,B.next?B.next.framebuffer:null);B.cur=B.next;a.getError()}function N(a,b){function c(a,b){var d,f=0,h=0,g=!0,k=!0;d=null;var q=!0,u="rgba",n="uint8",N=1,da=null,oa=null,B=null,ka=!1;if("number"===typeof a)f=a|0,h=b|0||f;else if(a){"shape"in
a?(h=a.shape,f=h[0],h=h[1]):("radius"in a&&(f=h=a.radius),"width"in a&&(f=a.width),"height"in a&&(h=a.height));if("color"in a||"colors"in a)d=a.color||a.colors,Array.isArray(d);if(!d){"colorCount"in a&&(N=a.colorCount|0);"colorTexture"in a&&(q=!!a.colorTexture,u="rgba4");if("colorType"in a&&(n=a.colorType,!q))if("half float"===n||"float16"===n)u="rgba16f";else if("float"===n||"float32"===n)u="rgba32f";"colorFormat"in a&&(u=a.colorFormat,0<=x.indexOf(u)?q=!0:0<=D.indexOf(u)&&(q=!1))}if("depthTexture"in
a||"depthStencilTexture"in a)ka=!(!a.depthTexture&&!a.depthStencilTexture);"depth"in a&&("boolean"===typeof a.depth?g=a.depth:(da=a.depth,k=!1));"stencil"in a&&("boolean"===typeof a.stencil?k=a.stencil:(oa=a.stencil,g=!1));"depthStencil"in a&&("boolean"===typeof a.depthStencil?g=k=a.depthStencil:(B=a.depthStencil,k=g=!1))}else f=h=1;var F=null,y=null,E=null,T=null;if(Array.isArray(d))F=d.map(t);else if(d)F=[t(d)];else for(F=Array(N),d=0;d<N;++d)F[d]=m(f,h,q,u,n);f=f||F[0].width;h=h||F[0].height;da?
y=t(da):g&&!k&&(y=m(f,h,ka,"depth","uint32"));oa?E=t(oa):k&&!g&&(E=m(f,h,!1,"stencil","uint8"));B?T=t(B):!da&&!oa&&k&&g&&(T=m(f,h,ka,"depth stencil","depth stencil"));g=null;for(d=0;d<F.length;++d)r(F[d],f,h),F[d]&&F[d].texture&&(k=Wa[F[d].texture._texture.format]*Na[F[d].texture._texture.type],null===g&&(g=k));r(y,f,h);r(E,f,h);r(T,f,h);l(e);e.width=f;e.height=h;e.colorAttachments=F;e.depthAttachment=y;e.stencilAttachment=E;e.depthStencilAttachment=T;c.color=F.map(C);c.depth=C(y);c.stencil=C(E);
c.depthStencil=C(T);c.width=e.width;c.height=e.height;v(e);return c}var e=new h;d.framebufferCount++;c(a,b);return E(c,{resize:function(a,b){var d=Math.max(a|0,1),f=Math.max(b|0||d,1);if(d===e.width&&f===e.height)return c;for(var h=e.colorAttachments,g=0;g<h.length;++g)k(h[g],d,f);k(e.depthAttachment,d,f);k(e.stencilAttachment,d,f);k(e.depthStencilAttachment,d,f);e.width=c.width=d;e.height=c.height=f;v(e);return c},_reglType:"framebuffer",_framebuffer:e,destroy:function(){u(e);l(e)},use:function(a){B.setFBO({framebuffer:c},
a)}})}var B={cur:null,next:null,dirty:!1,setFBO:null},x=["rgba"],D=["rgba4","rgb565","rgb5 a1"];b.ext_srgb&&D.push("srgba");b.ext_color_buffer_half_float&&D.push("rgba16f","rgb16f");b.webgl_color_buffer_float&&D.push("rgba32f");var y=["uint8"];b.oes_texture_half_float&&y.push("half float","float16");b.oes_texture_float&&y.push("float","float32");var O=0,R={};return E(B,{getFramebuffer:function(a){return"function"===typeof a&&"framebuffer"===a._reglType&&(a=a._framebuffer,a instanceof h)?a:null},create:N,
createCube:function(a){function b(a){var d,f={color:null},h=0,g=null;d="rgba";var l="uint8",m=1;if("number"===typeof a)h=a|0;else if(a){"shape"in a?h=a.shape[0]:("radius"in a&&(h=a.radius|0),"width"in a?h=a.width|0:"height"in a&&(h=a.height|0));if("color"in a||"colors"in a)g=a.color||a.colors,Array.isArray(g);g||("colorCount"in a&&(m=a.colorCount|0),"colorType"in a&&(l=a.colorType),"colorFormat"in a&&(d=a.colorFormat));"depth"in a&&(f.depth=a.depth);"stencil"in a&&(f.stencil=a.stencil);"depthStencil"in
a&&(f.depthStencil=a.depthStencil)}else h=1;if(g)if(Array.isArray(g))for(a=[],d=0;d<g.length;++d)a[d]=g[d];else a=[g];else for(a=Array(m),g={radius:h,format:d,type:l},d=0;d<m;++d)a[d]=e.createCube(g);f.color=Array(a.length);for(d=0;d<a.length;++d)m=a[d],h=h||m.width,f.color[d]={target:34069,data:a[d]};for(d=0;6>d;++d){for(m=0;m<a.length;++m)f.color[m].target=34069+d;0<d&&(f.depth=c[0].depth,f.stencil=c[0].stencil,f.depthStencil=c[0].depthStencil);if(c[d])c[d](f);else c[d]=N(f)}return E(b,{width:h,
height:h,color:a})}var c=Array(6);b(a);return E(b,{faces:c,resize:function(a){var d=a|0;if(d===b.width)return b;var e=b.color;for(a=0;a<e.length;++a)e[a].resize(d);for(a=0;6>a;++a)c[a].resize(d);b.width=b.height=d;return b},_reglType:"framebufferCube",destroy:function(){c.forEach(function(a){a.destroy()})}})},clear:function(){S(R).forEach(u)},restore:function(){B.cur=null;B.next=null;B.dirty=!0;S(R).forEach(function(b){b.framebuffer=a.createFramebuffer();v(b)})}})}function ub(){this.w=this.z=this.y=
this.x=this.state=0;this.buffer=null;this.size=0;this.normalized=!1;this.type=5126;this.divisor=this.stride=this.offset=0}function Pb(a,b,c,e){a=c.maxAttributes;b=Array(a);for(c=0;c<a;++c)b[c]=new ub;return{Record:ub,scope:{},state:b}}function Qb(a,b,c,e){function g(a,b,c,d){this.name=a;this.id=b;this.location=c;this.info=d}function d(a,b){for(var c=0;c<a.length;++c)if(a[c].id===b.id){a[c].location=b.location;return}a.push(b)}function n(c,d,e){e=35632===c?q:t;var f=e[d];if(!f){var g=b.str(d),f=a.createShader(c);
a.shaderSource(f,g);a.compileShader(f);e[d]=f}return f}function f(a,b){this.id=k++;this.fragId=a;this.vertId=b;this.program=null;this.uniforms=[];this.attributes=[];e.profile&&(this.stats={uniformsCount:0,attributesCount:0})}function r(c,f){var m,k;m=n(35632,c.fragId);k=n(35633,c.vertId);var q=c.program=a.createProgram();a.attachShader(q,m);a.attachShader(q,k);a.linkProgram(q);var r=a.getProgramParameter(q,35718);e.profile&&(c.stats.uniformsCount=r);var t=c.uniforms;for(m=0;m<r;++m)if(k=a.getActiveUniform(q,
m))if(1<k.size)for(var C=0;C<k.size;++C){var y=k.name.replace("[0]","["+C+"]");d(t,new g(y,b.id(y),a.getUniformLocation(q,y),k))}else d(t,new g(k.name,b.id(k.name),a.getUniformLocation(q,k.name),k));r=a.getProgramParameter(q,35721);e.profile&&(c.stats.attributesCount=r);t=c.attributes;for(m=0;m<r;++m)(k=a.getActiveAttrib(q,m))&&d(t,new g(k.name,b.id(k.name),a.getAttribLocation(q,k.name),k))}var q={},t={},m={},C=[],k=0;e.profile&&(c.getMaxUniformsCount=function(){var a=0;C.forEach(function(b){b.stats.uniformsCount>
a&&(a=b.stats.uniformsCount)});return a},c.getMaxAttributesCount=function(){var a=0;C.forEach(function(b){b.stats.attributesCount>a&&(a=b.stats.attributesCount)});return a});return{clear:function(){var b=a.deleteShader.bind(a);S(q).forEach(b);q={};S(t).forEach(b);t={};C.forEach(function(b){a.deleteProgram(b.program)});C.length=0;m={};c.shaderCount=0},program:function(a,b,d){var e=m[b];e||(e=m[b]={});var g=e[a];g||(g=new f(b,a),c.shaderCount++,r(g,d),e[a]=g,C.push(g));return g},restore:function(){q=
{};t={};for(var a=0;a<C.length;++a)r(C[a])},shader:n,frag:-1,vert:-1}}function Rb(a,b,c,e,g,d,n){function f(d){var f;f=null===b.next?5121:b.next.colorAttachments[0].texture._texture.type;var g=0,r=0,k=e.framebufferWidth,h=e.framebufferHeight,l=null;M(d)?l=d:d&&(g=d.x|0,r=d.y|0,k=(d.width||e.framebufferWidth-g)|0,h=(d.height||e.framebufferHeight-r)|0,l=d.data||null);c();d=k*h*4;l||(5121===f?l=new Uint8Array(d):5126===f&&(l=l||new Float32Array(d)));a.pixelStorei(3333,4);a.readPixels(g,r,k,h,6408,f,
l);return l}function r(a){var c;b.setFBO({framebuffer:a.framebuffer},function(){c=f(a)});return c}return function(a){return a&&"framebuffer"in a?r(a):f(a)}}function Ba(a){return Array.prototype.slice.call(a)}function Ca(a){return Ba(a).join("")}function Sb(){function a(){var a=[],b=[];return E(function(){a.push.apply(a,Ba(arguments))},{def:function(){var d="v"+c++;b.push(d);0<arguments.length&&(a.push(d,"="),a.push.apply(a,Ba(arguments)),a.push(";"));return d},toString:function(){return Ca([0<b.length?
"var "+b+";":"",Ca(a)])}})}function b(){function b(a,e){d(a,e,"=",c.def(a,e),";")}var c=a(),d=a(),e=c.toString,g=d.toString;return E(function(){c.apply(c,Ba(arguments))},{def:c.def,entry:c,exit:d,save:b,set:function(a,d,e){b(a,d);c(a,d,"=",e,";")},toString:function(){return e()+g()}})}var c=0,e=[],g=[],d=a(),n={};return{global:d,link:function(a){for(var b=0;b<g.length;++b)if(g[b]===a)return e[b];b="g"+c++;e.push(b);g.push(a);return b},block:a,proc:function(a,c){function d(){var a="a"+e.length;e.push(a);
return a}var e=[];c=c||0;for(var g=0;g<c;++g)d();var g=b(),C=g.toString;return n[a]=E(g,{arg:d,toString:function(){return Ca(["function(",e.join(),"){",C(),"}"])}})},scope:b,cond:function(){var a=Ca(arguments),c=b(),d=b(),e=c.toString,g=d.toString;return E(c,{then:function(){c.apply(c,Ba(arguments));return this},"else":function(){d.apply(d,Ba(arguments));return this},toString:function(){var b=g();b&&(b="else{"+b+"}");return Ca(["if(",a,"){",e(),"}",b])}})},compile:function(){var a=['"use strict";',
d,"return {"];Object.keys(n).forEach(function(b){a.push('"',b,'":',n[b].toString(),",")});a.push("}");var b=Ca(a).replace(/;/g,";\n").replace(/}/g,"}\n").replace(/{/g,"{\n");return Function.apply(null,e.concat(b)).apply(null,g)}}}function Oa(a){return Array.isArray(a)||M(a)||ma(a)}function vb(a){return a.sort(function(a,c){return"viewport"===a?-1:"viewport"===c?1:a<c?-1:1})}function Z(a,b,c,e){this.thisDep=a;this.contextDep=b;this.propDep=c;this.append=e}function va(a){return a&&!(a.thisDep||a.contextDep||
a.propDep)}function D(a){return new Z(!1,!1,!1,a)}function P(a,b){var c=a.type;return 0===c?(c=a.data.length,new Z(!0,1<=c,2<=c,b)):4===c?(c=a.data,new Z(c.thisDep,c.contextDep,c.propDep,b)):new Z(3===c,2===c,1===c,b)}function Tb(a,b,c,e,g,d,n,f,r,q,t,m,C,k,h){function l(a){return a.replace(".","_")}function u(a,b,c){var d=l(a);Ka.push(a);Fa[d]=ra[d]=!!c;sa[d]=b}function v(a,b,c){var d=l(a);Ka.push(a);Array.isArray(c)?(ra[d]=c.slice(),Fa[d]=c.slice()):ra[d]=Fa[d]=c;ta[d]=b}function N(){var a=Sb(),
c=a.link,d=a.global;a.id=qa++;a.batchId="0";var e=c(na),f=a.shared={props:"a0"};Object.keys(na).forEach(function(a){f[a]=d.def(e,".",a)});var g=a.next={},xa=a.current={};Object.keys(ta).forEach(function(a){Array.isArray(ra[a])&&(g[a]=d.def(f.next,".",a),xa[a]=d.def(f.current,".",a))});var H=a.constants={};Object.keys(aa).forEach(function(a){H[a]=d.def(JSON.stringify(aa[a]))});a.invoke=function(b,d){switch(d.type){case 0:var e=["this",f.context,f.props,a.batchId];return b.def(c(d.data),".call(",e.slice(0,
Math.max(d.data.length+1,4)),")");case 1:return b.def(f.props,d.data);case 2:return b.def(f.context,d.data);case 3:return b.def("this",d.data);case 4:return d.data.append(a,b),d.data.ref}};a.attribCache={};var Y={};a.scopeAttrib=function(a){a=b.id(a);if(a in Y)return Y[a];var d=q.scope[a];d||(d=q.scope[a]=new ya);return Y[a]=c(d)};return a}function B(a){var b=a["static"];a=a.dynamic;var c;if("profile"in b){var d=!!b.profile;c=D(function(a,b){return d});c.enable=d}else if("profile"in a){var e=a.profile;
c=P(e,function(a,b){return a.invoke(b,e)})}return c}function y(a,b){var c=a["static"],d=a.dynamic;if("framebuffer"in c){var e=c.framebuffer;return e?(e=f.getFramebuffer(e),D(function(a,b){var c=a.link(e),d=a.shared;b.set(d.framebuffer,".next",c);d=d.context;b.set(d,".framebufferWidth",c+".width");b.set(d,".framebufferHeight",c+".height");return c})):D(function(a,b){var c=a.shared;b.set(c.framebuffer,".next","null");c=c.context;b.set(c,".framebufferWidth",c+".drawingBufferWidth");b.set(c,".framebufferHeight",
c+".drawingBufferHeight");return"null"})}if("framebuffer"in d){var g=d.framebuffer;return P(g,function(a,b){var c=a.invoke(b,g),d=a.shared,e=d.framebuffer,c=b.def(e,".getFramebuffer(",c,")");b.set(e,".next",c);d=d.context;b.set(d,".framebufferWidth",c+"?"+c+".width:"+d+".drawingBufferWidth");b.set(d,".framebufferHeight",c+"?"+c+".height:"+d+".drawingBufferHeight");return c})}return null}function x(a,b,c){function d(a){if(a in e){var c=e[a];a=!0;var p=c.x|0,ba=c.y|0,g,h;"width"in c?g=c.width|0:a=!1;
"height"in c?h=c.height|0:a=!1;return new Z(!a&&b&&b.thisDep,!a&&b&&b.contextDep,!a&&b&&b.propDep,function(a,b){var d=a.shared.context,e=g;"width"in c||(e=b.def(d,".","framebufferWidth","-",p));var f=h;"height"in c||(f=b.def(d,".","framebufferHeight","-",ba));return[p,ba,e,f]})}if(a in f){var z=f[a];a=P(z,function(a,b){var c=a.invoke(b,z),d=a.shared.context,e=b.def(c,".x|0"),p=b.def(c,".y|0"),Y=b.def('"width" in ',c,"?",c,".width|0:","(",d,".","framebufferWidth","-",e,")"),c=b.def('"height" in ',
c,"?",c,".height|0:","(",d,".","framebufferHeight","-",p,")");return[e,p,Y,c]});b&&(a.thisDep=a.thisDep||b.thisDep,a.contextDep=a.contextDep||b.contextDep,a.propDep=a.propDep||b.propDep);return a}return b?new Z(b.thisDep,b.contextDep,b.propDep,function(a,b){var c=a.shared.context;return[0,0,b.def(c,".","framebufferWidth"),b.def(c,".","framebufferHeight")]}):null}var e=a["static"],f=a.dynamic;if(a=d("viewport")){var g=a;a=new Z(a.thisDep,a.contextDep,a.propDep,function(a,b){var c=g.append(a,b),d=a.shared.context;
b.set(d,".viewportWidth",c[2]);b.set(d,".viewportHeight",c[3]);return c})}return{viewport:a,scissor_box:d("scissor.box")}}function E(a){function c(a){if(a in d){var p=b.id(d[a]);a=D(function(){return p});a.id=p;return a}if(a in e){var f=e[a];return P(f,function(a,b){var c=a.invoke(b,f);return b.def(a.shared.strings,".id(",c,")")})}return null}var d=a["static"],e=a.dynamic,f=c("frag"),g=c("vert"),h=null;va(f)&&va(g)?(h=t.program(g.id,f.id),a=D(function(a,b){return a.link(h)})):a=new Z(f&&f.thisDep||
g&&g.thisDep,f&&f.contextDep||g&&g.contextDep,f&&f.propDep||g&&g.propDep,function(a,b){var c=a.shared.shader,d;d=f?f.append(a,b):b.def(c,".","frag");var e;e=g?g.append(a,b):b.def(c,".","vert");return b.def(c+".program("+e+","+d+")")});return{frag:f,vert:g,progVar:a,program:h}}function O(a,b){function c(a,b){if(a in e){var d=e[a]|0;return D(function(a,c){b&&(a.OFFSET=d);return d})}if(a in f){var p=f[a];return P(p,function(a,c){var d=a.invoke(c,p);b&&(a.OFFSET=d);return d})}return b&&g?D(function(a,
b){a.OFFSET="0";return 0}):null}var e=a["static"],f=a.dynamic,g=function(){if("elements"in e){var a=e.elements;Oa(a)?a=d.getElements(d.create(a,!0)):a&&(a=d.getElements(a));var b=D(function(b,c){if(a){var d=b.link(a);return b.ELEMENTS=d}return b.ELEMENTS=null});b.value=a;return b}if("elements"in f){var c=f.elements;return P(c,function(a,b){var d=a.shared,e=d.isBufferArgs,d=d.elements,p=a.invoke(b,c),f=b.def("null"),e=b.def(e,"(",p,")"),p=a.cond(e).then(f,"=",d,".createStream(",p,");")["else"](f,"=",
d,".getElements(",p,");");b.entry(p);b.exit(a.cond(e).then(d,".destroyStream(",f,");"));return a.ELEMENTS=f})}return null}(),h=c("offset",!0);return{elements:g,primitive:function(){if("primitive"in e){var a=e.primitive;return D(function(b,c){return Sa[a]})}if("primitive"in f){var b=f.primitive;return P(b,function(a,c){var d=a.constants.primTypes,e=a.invoke(c,b);return c.def(d,"[",e,"]")})}return g?va(g)?g.value?D(function(a,b){return b.def(a.ELEMENTS,".primType")}):D(function(){return 4}):new Z(g.thisDep,
g.contextDep,g.propDep,function(a,b){var c=a.ELEMENTS;return b.def(c,"?",c,".primType:",4)}):null}(),count:function(){if("count"in e){var a=e.count|0;return D(function(){return a})}if("count"in f){var b=f.count;return P(b,function(a,c){return a.invoke(c,b)})}return g?va(g)?g?h?new Z(h.thisDep,h.contextDep,h.propDep,function(a,b){return b.def(a.ELEMENTS,".vertCount-",a.OFFSET)}):D(function(a,b){return b.def(a.ELEMENTS,".vertCount")}):D(function(){return-1}):new Z(g.thisDep||h.thisDep,g.contextDep||
h.contextDep,g.propDep||h.propDep,function(a,b){var c=a.ELEMENTS;return a.OFFSET?b.def(c,"?",c,".vertCount-",a.OFFSET,":-1"):b.def(c,"?",c,".vertCount:-1")}):null}(),instances:c("instances",!1),offset:h}}function R(a,b){var c=a["static"],d=a.dynamic,e={};Ka.forEach(function(a){function b(f,g){if(a in c){var w=f(c[a]);e[p]=D(function(){return w})}else if(a in d){var h=d[a];e[p]=P(h,function(a,b){return g(a,b,a.invoke(b,h))})}}var p=l(a);switch(a){case "cull.enable":case "blend.enable":case "dither":case "stencil.enable":case "depth.enable":case "scissor.enable":case "polygonOffset.enable":case "sample.alpha":case "sample.enable":case "depth.mask":return b(function(a){return a},
function(a,b,c){return c});case "depth.func":return b(function(a){return Xa[a]},function(a,b,c){return b.def(a.constants.compareFuncs,"[",c,"]")});case "depth.range":return b(function(a){return a},function(a,b,c){a=b.def("+",c,"[0]");b=b.def("+",c,"[1]");return[a,b]});case "blend.func":return b(function(a){return[Ga["srcRGB"in a?a.srcRGB:a.src],Ga["dstRGB"in a?a.dstRGB:a.dst],Ga["srcAlpha"in a?a.srcAlpha:a.src],Ga["dstAlpha"in a?a.dstAlpha:a.dst]]},function(a,b,c){function d(a,e){return b.def('"',
a,e,'" in ',c,"?",c,".",a,e,":",c,".",a)}a=a.constants.blendFuncs;var e=d("src","RGB"),p=d("dst","RGB"),e=b.def(a,"[",e,"]"),f=b.def(a,"[",d("src","Alpha"),"]"),p=b.def(a,"[",p,"]");a=b.def(a,"[",d("dst","Alpha"),"]");return[e,p,f,a]});case "blend.equation":return b(function(a){if("string"===typeof a)return[X[a],X[a]];if("object"===typeof a)return[X[a.rgb],X[a.alpha]]},function(a,b,c){var d=a.constants.blendEquations,e=b.def(),p=b.def();a=a.cond("typeof ",c,'==="string"');a.then(e,"=",p,"=",d,"[",
c,"];");a["else"](e,"=",d,"[",c,".rgb];",p,"=",d,"[",c,".alpha];");b(a);return[e,p]});case "blend.color":return b(function(a){return J(4,function(b){return+a[b]})},function(a,b,c){return J(4,function(a){return b.def("+",c,"[",a,"]")})});case "stencil.mask":return b(function(a){return a|0},function(a,b,c){return b.def(c,"|0")});case "stencil.func":return b(function(a){return[Xa[a.cmp||"keep"],a.ref||0,"mask"in a?a.mask:-1]},function(a,b,c){a=b.def('"cmp" in ',c,"?",a.constants.compareFuncs,"[",c,".cmp]",
":",7680);var d=b.def(c,".ref|0");b=b.def('"mask" in ',c,"?",c,".mask|0:-1");return[a,d,b]});case "stencil.opFront":case "stencil.opBack":return b(function(b){return["stencil.opBack"===a?1029:1028,Pa[b.fail||"keep"],Pa[b.zfail||"keep"],Pa[b.zpass||"keep"]]},function(b,c,d){function e(a){return c.def('"',a,'" in ',d,"?",p,"[",d,".",a,"]:",7680)}var p=b.constants.stencilOps;return["stencil.opBack"===a?1029:1028,e("fail"),e("zfail"),e("zpass")]});case "polygonOffset.offset":return b(function(a){return[a.factor|
0,a.units|0]},function(a,b,c){a=b.def(c,".factor|0");b=b.def(c,".units|0");return[a,b]});case "cull.face":return b(function(a){var b=0;"front"===a?b=1028:"back"===a&&(b=1029);return b},function(a,b,c){return b.def(c,'==="front"?',1028,":",1029)});case "lineWidth":return b(function(a){return a},function(a,b,c){return c});case "frontFace":return b(function(a){return wb[a]},function(a,b,c){return b.def(c+'==="cw"?2304:2305')});case "colorMask":return b(function(a){return a.map(function(a){return!!a})},
function(a,b,c){return J(4,function(a){return"!!"+c+"["+a+"]"})});case "sample.coverage":return b(function(a){return["value"in a?a.value:1,!!a.invert]},function(a,b,c){a=b.def('"value" in ',c,"?+",c,".value:1");b=b.def("!!",c,".invert");return[a,b]})}});return e}function F(a,b){var c=a["static"],d=a.dynamic,e={};Object.keys(c).forEach(function(a){var b=c[a],d;if("number"===typeof b||"boolean"===typeof b)d=D(function(){return b});else if("function"===typeof b){var p=b._reglType;if("texture2d"===p||
"textureCube"===p)d=D(function(a){return a.link(b)});else if("framebuffer"===p||"framebufferCube"===p)d=D(function(a){return a.link(b.color[0])})}else pa(b)&&(d=D(function(a){return a.global.def("[",J(b.length,function(a){return b[a]}),"]")}));d.value=b;e[a]=d});Object.keys(d).forEach(function(a){var b=d[a];e[a]=P(b,function(a,c){return a.invoke(c,b)})});return e}function T(a,c){var d=a["static"],e=a.dynamic,f={};Object.keys(d).forEach(function(a){var c=d[a],e=b.id(a),p=new ya;if(Oa(c))p.state=1,
p.buffer=g.getBuffer(g.create(c,34962,!1,!0)),p.type=0;else{var w=g.getBuffer(c);if(w)p.state=1,p.buffer=w,p.type=0;else if("constant"in c){var h=c.constant;p.buffer="null";p.state=2;"number"===typeof h?p.x=h:Da.forEach(function(a,b){b<h.length&&(p[a]=h[b])})}else{var w=Oa(c.buffer)?g.getBuffer(g.create(c.buffer,34962,!1,!0)):g.getBuffer(c.buffer),k=c.offset|0,m=c.stride|0,I=c.size|0,l=!!c.normalized,n=0;"type"in c&&(n=Ra[c.type]);c=c.divisor|0;p.buffer=w;p.state=1;p.size=I;p.normalized=l;p.type=
n||w.dtype;p.offset=k;p.stride=m;p.divisor=c}}f[a]=D(function(a,b){var c=a.attribCache;if(e in c)return c[e];var d={isStream:!1};Object.keys(p).forEach(function(a){d[a]=p[a]});p.buffer&&(d.buffer=a.link(p.buffer),d.type=d.type||d.buffer+".dtype");return c[e]=d})});Object.keys(e).forEach(function(a){var b=e[a];f[a]=P(b,function(a,c){function d(a){c(w[a],"=",e,".",a,"|0;")}var e=a.invoke(c,b),p=a.shared,f=p.isBufferArgs,g=p.buffer,w={isStream:c.def(!1)},h=new ya;h.state=1;Object.keys(h).forEach(function(a){w[a]=
c.def(""+h[a])});var z=w.buffer,k=w.type;c("if(",f,"(",e,")){",w.isStream,"=true;",z,"=",g,".createStream(",34962,",",e,");",k,"=",z,".dtype;","}else{",z,"=",g,".getBuffer(",e,");","if(",z,"){",k,"=",z,".dtype;",'}else if("constant" in ',e,"){",w.state,"=",2,";","if(typeof "+e+'.constant === "number"){',w[Da[0]],"=",e,".constant;",Da.slice(1).map(function(a){return w[a]}).join("="),"=0;","}else{",Da.map(function(a,b){return w[a]+"="+e+".constant.length>"+b+"?"+e+".constant["+b+"]:0;"}).join(""),"}}else{",
"if(",f,"(",e,".buffer)){",z,"=",g,".createStream(",34962,",",e,".buffer);","}else{",z,"=",g,".getBuffer(",e,".buffer);","}",k,'="type" in ',e,"?",p.glTypes,"[",e,".type]:",z,".dtype;",w.normalized,"=!!",e,".normalized;");d("size");d("offset");d("stride");d("divisor");c("}}");c.exit("if(",w.isStream,"){",g,".destroyStream(",z,");","}");return w})});return f}function M(a){var b=a["static"],c=a.dynamic,d={};Object.keys(b).forEach(function(a){var c=b[a];d[a]=D(function(a,b){return"number"===typeof c||
"boolean"===typeof c?""+c:a.link(c)})});Object.keys(c).forEach(function(a){var b=c[a];d[a]=P(b,function(a,c){return a.invoke(c,b)})});return d}function A(a,b,c,d,e){var f=y(a,e),g=x(a,f,e),h=O(a,e),k=R(a,e),m=E(a,e),ba=g.viewport;ba&&(k.viewport=ba);ba=l("scissor.box");(g=g[ba])&&(k[ba]=g);g=0<Object.keys(k).length;f={framebuffer:f,draw:h,shader:m,state:k,dirty:g};f.profile=B(a,e);f.uniforms=F(c,e);f.attributes=T(b,e);f.context=M(d,e);return f}function ua(a,b,c){var d=a.shared.context,e=a.scope();
Object.keys(c).forEach(function(f){b.save(d,"."+f);e(d,".",f,"=",c[f].append(a,b),";")});b(e)}function K(a,b,c,d){var e=a.shared,f=e.gl,g=e.framebuffer,h;ha&&(h=b.def(e.extensions,".webgl_draw_buffers"));var k=a.constants,e=k.drawBuffer,k=k.backBuffer;a=c?c.append(a,b):b.def(g,".next");d||b("if(",a,"!==",g,".cur){");b("if(",a,"){",f,".bindFramebuffer(",36160,",",a,".framebuffer);");ha&&b(h,".drawBuffersWEBGL(",e,"[",a,".colorAttachments.length]);");b("}else{",f,".bindFramebuffer(",36160,",null);");
ha&&b(h,".drawBuffersWEBGL(",k,");");b("}",g,".cur=",a,";");d||b("}")}function V(a,b,c){var d=a.shared,e=d.gl,f=a.current,g=a.next,h=d.current,k=d.next,m=a.cond(h,".dirty");Ka.forEach(function(b){b=l(b);if(!(b in c.state)){var d,w;if(b in g){d=g[b];w=f[b];var I=J(ra[b].length,function(a){return m.def(d,"[",a,"]")});m(a.cond(I.map(function(a,b){return a+"!=="+w+"["+b+"]"}).join("||")).then(e,".",ta[b],"(",I,");",I.map(function(a,b){return w+"["+b+"]="+a}).join(";"),";"))}else d=m.def(k,".",b),I=a.cond(d,
"!==",h,".",b),m(I),b in sa?I(a.cond(d).then(e,".enable(",sa[b],");")["else"](e,".disable(",sa[b],");"),h,".",b,"=",d,";"):I(e,".",ta[b],"(",d,");",h,".",b,"=",d,";")}});0===Object.keys(c.state).length&&m(h,".dirty=false;");b(m)}function Q(a,b,c,d){var e=a.shared,f=a.current,g=e.current,h=e.gl;vb(Object.keys(c)).forEach(function(e){var k=c[e];if(!d||d(k)){var m=k.append(a,b);if(sa[e]){var l=sa[e];va(k)?m?b(h,".enable(",l,");"):b(h,".disable(",l,");"):b(a.cond(m).then(h,".enable(",l,");")["else"](h,
".disable(",l,");"));b(g,".",e,"=",m,";")}else if(pa(m)){var n=f[e];b(h,".",ta[e],"(",m,");",m.map(function(a,b){return n+"["+b+"]="+a}).join(";"),";")}else b(h,".",ta[e],"(",m,");",g,".",e,"=",m,";")}})}function wa(a,b){ea&&(a.instancing=b.def(a.shared.extensions,".angle_instanced_arrays"))}function G(a,b,c,d,e){function f(){return"undefined"===typeof performance?"Date.now()":"performance.now()"}function g(a){t=b.def();a(t,"=",f(),";");"string"===typeof e?a(ba,".count+=",e,";"):a(ba,".count++;");
k&&(d?(r=b.def(),a(r,"=",q,".getNumPendingQueries();")):a(q,".beginQuery(",ba,");"))}function h(a){a(ba,".cpuTime+=",f(),"-",t,";");k&&(d?a(q,".pushScopeStats(",r,",",q,".getNumPendingQueries(),",ba,");"):a(q,".endQuery();"))}function m(a){var c=b.def(n,".profile");b(n,".profile=",a,";");b.exit(n,".profile=",c,";")}var l=a.shared,ba=a.stats,n=l.current,q=l.timer;c=c.profile;var t,r;if(c){if(va(c)){c.enable?(g(b),h(b.exit),m("true")):m("false");return}c=c.append(a,b);m(c)}else c=b.def(n,".profile");
l=a.block();g(l);b("if(",c,"){",l,"}");a=a.block();h(a);b.exit("if(",c,"){",a,"}")}function U(a,b,c,d,e){function f(a){switch(a){case 35664:case 35667:case 35671:return 2;case 35665:case 35668:case 35672:return 3;case 35666:case 35669:case 35673:return 4;default:return 1}}function g(c,d,e){function f(){b("if(!",z,".buffer){",k,".enableVertexAttribArray(",l,");}");var c=e.type,g;g=e.size?b.def(e.size,"||",d):d;b("if(",z,".type!==",c,"||",z,".size!==",g,"||",q.map(function(a){return z+"."+a+"!=="+e[a]}).join("||"),
"){",k,".bindBuffer(",34962,",",I,".buffer);",k,".vertexAttribPointer(",[l,g,c,e.normalized,e.stride,e.offset],");",z,".type=",c,";",z,".size=",g,";",q.map(function(a){return z+"."+a+"="+e[a]+";"}).join(""),"}");ea&&(c=e.divisor,b("if(",z,".divisor!==",c,"){",a.instancing,".vertexAttribDivisorANGLE(",[l,c],");",z,".divisor=",c,";}"))}function m(){b("if(",z,".buffer){",k,".disableVertexAttribArray(",l,");","}if(",Da.map(function(a,b){return z+"."+a+"!=="+n[b]}).join("||"),"){",k,".vertexAttrib4f(",
l,",",n,");",Da.map(function(a,b){return z+"."+a+"="+n[b]+";"}).join(""),"}")}var k=h.gl,l=b.def(c,".location"),z=b.def(h.attributes,"[",l,"]");c=e.state;var I=e.buffer,n=[e.x,e.y,e.z,e.w],q=["buffer","normalized","offset","stride"];1===c?f():2===c?m():(b("if(",c,"===",1,"){"),f(),b("}else{"),m(),b("}"))}var h=a.shared;d.forEach(function(d){var h=d.name,k=c.attributes[h],m;if(k){if(!e(k))return;m=k.append(a,b)}else{if(!e(xb))return;var l=a.scopeAttrib(h);m={};Object.keys(new ya).forEach(function(a){m[a]=
b.def(l,".",a)})}g(a.link(d),f(d.info.type),m)})}function W(a,c,d,e,f){for(var g=a.shared,h=g.gl,k,m=0;m<e.length;++m){var l=e[m],n=l.name,q=l.info.type,t=d.uniforms[n],l=a.link(l)+".location",r;if(t){if(!f(t))continue;if(va(t)){n=t.value;if(35678===q||35680===q)q=a.link(n._texture||n.color[0]._texture),c(h,".uniform1i(",l,",",q+".bind());"),c.exit(q,".unbind();");else if(35674===q||35675===q||35676===q)n=a.global.def("new Float32Array(["+Array.prototype.slice.call(n)+"])"),t=2,35675===q?t=3:35676===
q&&(t=4),c(h,".uniformMatrix",t,"fv(",l,",false,",n,");");else{switch(q){case 5126:k="1f";break;case 35664:k="2f";break;case 35665:k="3f";break;case 35666:k="4f";break;case 35670:k="1i";break;case 5124:k="1i";break;case 35671:k="2i";break;case 35667:k="2i";break;case 35672:k="3i";break;case 35668:k="3i";break;case 35673:k="4i";break;case 35669:k="4i"}c(h,".uniform",k,"(",l,",",pa(n)?Array.prototype.slice.call(n):n,");")}continue}else r=t.append(a,c)}else{if(!f(xb))continue;r=c.def(g.uniforms,"[",
b.id(n),"]")}35678===q?c("if(",r,"&&",r,'._reglType==="framebuffer"){',r,"=",r,".color[0];","}"):35680===q&&c("if(",r,"&&",r,'._reglType==="framebufferCube"){',r,"=",r,".color[0];","}");n=1;switch(q){case 35678:case 35680:q=c.def(r,"._texture");c(h,".uniform1i(",l,",",q,".bind());");c.exit(q,".unbind();");continue;case 5124:case 35670:k="1i";break;case 35667:case 35671:k="2i";n=2;break;case 35668:case 35672:k="3i";n=3;break;case 35669:case 35673:k="4i";n=4;break;case 5126:k="1f";break;case 35664:k=
"2f";n=2;break;case 35665:k="3f";n=3;break;case 35666:k="4f";n=4;break;case 35674:k="Matrix2fv";break;case 35675:k="Matrix3fv";break;case 35676:k="Matrix4fv"}c(h,".uniform",k,"(",l,",");if("M"===k.charAt(0)){var l=Math.pow(q-35674+2,2),v=a.global.def("new Float32Array(",l,")");c("false,(Array.isArray(",r,")||",r," instanceof Float32Array)?",r,":(",J(l,function(a){return v+"["+a+"]="+r+"["+a+"]"}),",",v,")")}else 1<n?c(J(n,function(a){return r+"["+a+"]"})):c(r);c(");")}}function S(a,b,c,d){function e(f){var g=
l[f];return g?g.contextDep&&d.contextDynamic||g.propDep?g.append(a,c):g.append(a,b):b.def(m,".",f)}function f(){function a(){c(u,".drawElementsInstancedANGLE(",[q,t,C,r+"<<(("+C+"-5121)>>1)",v],");")}function b(){c(u,".drawArraysInstancedANGLE(",[q,r,t,v],");")}n?da?a():(c("if(",n,"){"),a(),c("}else{"),b(),c("}")):b()}function g(){function a(){c(k+".drawElements("+[q,t,C,r+"<<(("+C+"-5121)>>1)"]+");")}function b(){c(k+".drawArrays("+[q,r,t]+");")}n?da?a():(c("if(",n,"){"),a(),c("}else{"),b(),c("}")):
b()}var h=a.shared,k=h.gl,m=h.draw,l=d.draw,n=function(){var e=l.elements,f=b;if(e){if(e.contextDep&&d.contextDynamic||e.propDep)f=c;e=e.append(a,f)}else e=f.def(m,".","elements");e&&f("if("+e+")"+k+".bindBuffer(34963,"+e+".buffer.buffer);");return e}(),q=e("primitive"),r=e("offset"),t=function(){var e=l.count,f=b;if(e){if(e.contextDep&&d.contextDynamic||e.propDep)f=c;e=e.append(a,f)}else e=f.def(m,".","count");return e}();if("number"===typeof t){if(0===t)return}else c("if(",t,"){"),c.exit("}");var v,
u;ea&&(v=e("instances"),u=a.instancing);var C=n+".type",da=l.elements&&va(l.elements);ea&&("number"!==typeof v||0<=v)?"string"===typeof v?(c("if(",v,">0){"),f(),c("}else if(",v,"<0){"),g(),c("}")):f():g()}function ca(a,b,c,d,e){b=N();e=b.proc("body",e);ea&&(b.instancing=e.def(b.shared.extensions,".angle_instanced_arrays"));a(b,e,c,d);return b.compile().body}function L(a,b,c,d){wa(a,b);U(a,b,c,d.attributes,function(){return!0});W(a,b,c,d.uniforms,function(){return!0});S(a,b,b,c)}function da(a,b){var c=
a.proc("draw",1);wa(a,c);ua(a,c,b.context);K(a,c,b.framebuffer);V(a,c,b);Q(a,c,b.state);G(a,c,b,!1,!0);var d=b.shader.progVar.append(a,c);c(a.shared.gl,".useProgram(",d,".program);");if(b.shader.program)L(a,c,b,b.shader.program);else{var e=a.global.def("{}"),f=c.def(d,".id"),g=c.def(e,"[",f,"]");c(a.cond(g).then(g,".call(this,a0);")["else"](g,"=",e,"[",f,"]=",a.link(function(c){return ca(L,a,b,c,1)}),"(",d,");",g,".call(this,a0);"))}0<Object.keys(b.state).length&&c(a.shared.current,".dirty=true;")}
function oa(a,b,c,d){function e(){return!0}a.batchId="a1";wa(a,b);U(a,b,c,d.attributes,e);W(a,b,c,d.uniforms,e);S(a,b,b,c)}function za(a,b,c,d){function e(a){return a.contextDep&&g||a.propDep}function f(a){return!e(a)}wa(a,b);var g=c.contextDep,h=b.def(),k=b.def();a.shared.props=k;a.batchId=h;var m=a.scope(),l=a.scope();b(m.entry,"for(",h,"=0;",h,"<","a1",";++",h,"){",k,"=","a0","[",h,"];",l,"}",m.exit);c.needsContext&&ua(a,l,c.context);c.needsFramebuffer&&K(a,l,c.framebuffer);Q(a,l,c.state,e);c.profile&&
e(c.profile)&&G(a,l,c,!1,!0);d?(U(a,m,c,d.attributes,f),U(a,l,c,d.attributes,e),W(a,m,c,d.uniforms,f),W(a,l,c,d.uniforms,e),S(a,m,l,c)):(b=a.global.def("{}"),d=c.shader.progVar.append(a,l),k=l.def(d,".id"),m=l.def(b,"[",k,"]"),l(a.shared.gl,".useProgram(",d,".program);","if(!",m,"){",m,"=",b,"[",k,"]=",a.link(function(b){return ca(oa,a,c,b,2)}),"(",d,");}",m,".call(this,a0[",h,"],",h,");"))}function ka(a,b){function c(a){return a.contextDep&&e||a.propDep}var d=a.proc("batch",2);a.batchId="0";wa(a,
d);var e=!1,f=!0;Object.keys(b.context).forEach(function(a){e=e||b.context[a].propDep});e||(ua(a,d,b.context),f=!1);var g=b.framebuffer,h=!1;g?(g.propDep?e=h=!0:g.contextDep&&e&&(h=!0),h||K(a,d,g)):K(a,d,null);b.state.viewport&&b.state.viewport.propDep&&(e=!0);V(a,d,b);Q(a,d,b.state,function(a){return!c(a)});b.profile&&c(b.profile)||G(a,d,b,!1,"a1");b.contextDep=e;b.needsContext=f;b.needsFramebuffer=h;f=b.shader.progVar;if(f.contextDep&&e||f.propDep)za(a,d,b,null);else if(f=f.append(a,d),d(a.shared.gl,
".useProgram(",f,".program);"),b.shader.program)za(a,d,b,b.shader.program);else{var g=a.global.def("{}"),h=d.def(f,".id"),k=d.def(g,"[",h,"]");d(a.cond(k).then(k,".call(this,a0,a1);")["else"](k,"=",g,"[",h,"]=",a.link(function(c){return ca(za,a,b,c,2)}),"(",f,");",k,".call(this,a0,a1);"))}0<Object.keys(b.state).length&&d(a.shared.current,".dirty=true;")}function ia(a,c){function d(b){var g=c.shader[b];g&&e.set(f.shader,"."+b,g.append(a,e))}var e=a.proc("scope",3);a.batchId="a2";var f=a.shared,g=f.current;
ua(a,e,c.context);c.framebuffer&&c.framebuffer.append(a,e);vb(Object.keys(c.state)).forEach(function(b){var d=c.state[b].append(a,e);pa(d)?d.forEach(function(c,d){e.set(a.next[b],"["+d+"]",c)}):e.set(f.next,"."+b,d)});G(a,e,c,!0,!0);["elements","offset","count","instances","primitive"].forEach(function(b){var d=c.draw[b];d&&e.set(f.draw,"."+b,""+d.append(a,e))});Object.keys(c.uniforms).forEach(function(d){e.set(f.uniforms,"["+b.id(d)+"]",c.uniforms[d].append(a,e))});Object.keys(c.attributes).forEach(function(b){var d=
c.attributes[b].append(a,e),f=a.scopeAttrib(b);Object.keys(new ya).forEach(function(a){e.set(f,"."+a,d[a])})});d("vert");d("frag");0<Object.keys(c.state).length&&(e(g,".dirty=true;"),e.exit(g,".dirty=true;"));e("a1(",a.shared.context,",a0,",a.batchId,");")}function ma(a){if("object"===typeof a&&!pa(a)){for(var b=Object.keys(a),c=0;c<b.length;++c)if(la.isDynamic(a[b[c]]))return!0;return!1}}function ja(a,b,c){function d(a,b){g.forEach(function(c){var d=e[c];la.isDynamic(d)&&(d=a.invoke(b,d),b(l,".",
c,"=",d,";"))})}var e=b["static"][c];if(e&&ma(e)){var f=a.global,g=Object.keys(e),h=!1,k=!1,m=!1,l=a.global.def("{}");g.forEach(function(b){var c=e[b];if(la.isDynamic(c))"function"===typeof c&&(c=e[b]=la.unbox(c)),b=P(c,null),h=h||b.thisDep,m=m||b.propDep,k=k||b.contextDep;else{f(l,".",b,"=");switch(typeof c){case "number":f(c);break;case "string":f('"',c,'"');break;case "object":Array.isArray(c)&&f("[",c.join(),"]");break;default:f(a.link(c))}f(";")}});b.dynamic[c]=new la.DynamicVariable(4,{thisDep:h,
contextDep:k,propDep:m,ref:l,append:d});delete b["static"][c]}}var ya=q.Record,X={add:32774,subtract:32778,"reverse subtract":32779};c.ext_blend_minmax&&(X.min=32775,X.max=32776);var ea=c.angle_instanced_arrays,ha=c.webgl_draw_buffers,ra={dirty:!0,profile:h.profile},Fa={},Ka=[],sa={},ta={};u("dither",3024);u("blend.enable",3042);v("blend.color","blendColor",[0,0,0,0]);v("blend.equation","blendEquationSeparate",[32774,32774]);v("blend.func","blendFuncSeparate",[1,0,1,0]);u("depth.enable",2929,!0);
v("depth.func","depthFunc",513);v("depth.range","depthRange",[0,1]);v("depth.mask","depthMask",!0);v("colorMask","colorMask",[!0,!0,!0,!0]);u("cull.enable",2884);v("cull.face","cullFace",1029);v("frontFace","frontFace",2305);v("lineWidth","lineWidth",1);u("polygonOffset.enable",32823);v("polygonOffset.offset","polygonOffset",[0,0]);u("sample.alpha",32926);u("sample.enable",32928);v("sample.coverage","sampleCoverage",[1,!1]);u("stencil.enable",2960);v("stencil.mask","stencilMask",-1);v("stencil.func",
"stencilFunc",[519,0,-1]);v("stencil.opFront","stencilOpSeparate",[1028,7680,7680,7680]);v("stencil.opBack","stencilOpSeparate",[1029,7680,7680,7680]);u("scissor.enable",3089);v("scissor.box","scissor",[0,0,a.drawingBufferWidth,a.drawingBufferHeight]);v("viewport","viewport",[0,0,a.drawingBufferWidth,a.drawingBufferHeight]);var na={gl:a,context:C,strings:b,next:Fa,current:ra,draw:m,elements:d,buffer:g,shader:t,attributes:q.state,uniforms:r,framebuffer:f,extensions:c,timer:k,isBufferArgs:Oa},aa={primTypes:Sa,
compareFuncs:Xa,blendFuncs:Ga,blendEquations:X,stencilOps:Pa,glTypes:Ra,orientationType:wb};ha&&(aa.backBuffer=[1029],aa.drawBuffer=J(e.maxDrawbuffers,function(a){return 0===a?[0]:J(a,function(a){return 36064+a})}));var qa=0;return{next:Fa,current:ra,procs:function(){var a=N(),b=a.proc("poll"),c=a.proc("refresh"),d=a.block();b(d);c(d);var f=a.shared,g=f.gl,h=f.next,k=f.current;d(k,".dirty=false;");K(a,b);K(a,c,null,!0);var m;ea&&(m=a.link(ea));for(var l=0;l<e.maxAttributes;++l){var n=c.def(f.attributes,
"[",l,"]"),q=a.cond(n,".buffer");q.then(g,".enableVertexAttribArray(",l,");",g,".bindBuffer(",34962,",",n,".buffer.buffer);",g,".vertexAttribPointer(",l,",",n,".size,",n,".type,",n,".normalized,",n,".stride,",n,".offset);")["else"](g,".disableVertexAttribArray(",l,");",g,".vertexAttrib4f(",l,",",n,".x,",n,".y,",n,".z,",n,".w);",n,".buffer=null;");c(q);ea&&c(m,".vertexAttribDivisorANGLE(",l,",",n,".divisor);")}Object.keys(sa).forEach(function(e){var f=sa[e],m=d.def(h,".",e),l=a.block();l("if(",m,"){",
g,".enable(",f,")}else{",g,".disable(",f,")}",k,".",e,"=",m,";");c(l);b("if(",m,"!==",k,".",e,"){",l,"}")});Object.keys(ta).forEach(function(e){var f=ta[e],m=ra[e],l,n,q=a.block();q(g,".",f,"(");pa(m)?(f=m.length,l=a.global.def(h,".",e),n=a.global.def(k,".",e),q(J(f,function(a){return l+"["+a+"]"}),");",J(f,function(a){return n+"["+a+"]="+l+"["+a+"];"}).join("")),b("if(",J(f,function(a){return l+"["+a+"]!=="+n+"["+a+"]"}).join("||"),"){",q,"}")):(l=d.def(h,".",e),n=d.def(k,".",e),q(l,");",k,".",e,
"=",l,";"),b("if(",l,"!==",n,"){",q,"}"));c(q)});return a.compile()}(),compile:function(a,b,c,d,e){var f=N();f.stats=f.link(e);Object.keys(b["static"]).forEach(function(a){ja(f,b,a)});Ub.forEach(function(b){ja(f,a,b)});c=A(a,b,c,d,f);da(f,c);ia(f,c);ka(f,c);return f.compile()}}}function yb(a,b){for(var c=0;c<a.length;++c)if(a[c]===b)return c;return-1}var E=function(a,b){for(var c=Object.keys(b),e=0;e<c.length;++e)a[c[e]]=b[c[e]];return a},Ab=0,la={DynamicVariable:aa,define:function(a,b){return new aa(a,
Za(b+""))},isDynamic:function(a){return"function"===typeof a&&!a._reglType||a instanceof aa},unbox:function(a,b){return"function"===typeof a?new aa(0,a):a},accessor:Za},Ya={next:"function"===typeof requestAnimationFrame?function(a){return requestAnimationFrame(a)}:function(a){return setTimeout(a,16)},cancel:"function"===typeof cancelAnimationFrame?function(a){return cancelAnimationFrame(a)}:clearTimeout},zb="undefined"!==typeof performance&&performance.now?function(){return performance.now()}:function(){return+new Date},
x=cb();x.zero=cb();var Vb=function(a,b){var c=1;b.ext_texture_filter_anisotropic&&(c=a.getParameter(34047));var e=1,g=1;b.webgl_draw_buffers&&(e=a.getParameter(34852),g=a.getParameter(36063));var d=!!b.oes_texture_float;if(d){d=a.createTexture();a.bindTexture(3553,d);a.texImage2D(3553,0,6408,1,1,0,6408,5126,null);var n=a.createFramebuffer();a.bindFramebuffer(36160,n);a.framebufferTexture2D(36160,36064,3553,d,0);a.bindTexture(3553,null);if(36053!==a.checkFramebufferStatus(36160))d=!1;else{a.viewport(0,
0,1,1);a.clearColor(1,0,0,1);a.clear(16384);var f=x.allocType(5126,4);a.readPixels(0,0,1,1,6408,5126,f);a.getError()?d=!1:(a.deleteFramebuffer(n),a.deleteTexture(d),d=1===f[0]);x.freeType(f)}}f=!0;"undefined"!==typeof navigator&&(/MSIE/.test(navigator.userAgent)||/Trident\//.test(navigator.appVersion)||/Edge/.test(navigator.userAgent))||(f=a.createTexture(),n=x.allocType(5121,36),a.activeTexture(33984),a.bindTexture(34067,f),a.texImage2D(34069,0,6408,3,3,0,6408,5121,n),x.freeType(n),a.bindTexture(34067,
null),a.deleteTexture(f),f=!a.getError());return{colorBits:[a.getParameter(3410),a.getParameter(3411),a.getParameter(3412),a.getParameter(3413)],depthBits:a.getParameter(3414),stencilBits:a.getParameter(3415),subpixelBits:a.getParameter(3408),extensions:Object.keys(b).filter(function(a){return!!b[a]}),maxAnisotropic:c,maxDrawbuffers:e,maxColorAttachments:g,pointSizeDims:a.getParameter(33901),lineWidthDims:a.getParameter(33902),maxViewportDims:a.getParameter(3386),maxCombinedTextureUnits:a.getParameter(35661),
maxCubeMapSize:a.getParameter(34076),maxRenderbufferSize:a.getParameter(34024),maxTextureUnits:a.getParameter(34930),maxTextureSize:a.getParameter(3379),maxAttributes:a.getParameter(34921),maxVertexUniforms:a.getParameter(36347),maxVertexTextureUnits:a.getParameter(35660),maxVaryingVectors:a.getParameter(36348),maxFragmentUniforms:a.getParameter(36349),glsl:a.getParameter(35724),renderer:a.getParameter(7937),vendor:a.getParameter(7936),version:a.getParameter(7938),readFloat:d,npotTextureCube:f}},
M=function(a){return a instanceof Uint8Array||a instanceof Uint16Array||a instanceof Uint32Array||a instanceof Int8Array||a instanceof Int16Array||a instanceof Int32Array||a instanceof Float32Array||a instanceof Float64Array||a instanceof Uint8ClampedArray},S=function(a){return Object.keys(a).map(function(b){return a[b]})},Ma={shape:function(a){for(var b=[];a.length;a=a[0])b.push(a.length);return b},flatten:function(a,b,c,e){var g=1;if(b.length)for(var d=0;d<b.length;++d)g*=b[d];else g=0;c=e||x.allocType(c,
g);switch(b.length){case 0:break;case 1:e=b[0];for(b=0;b<e;++b)c[b]=a[b];break;case 2:e=b[0];b=b[1];for(d=g=0;d<e;++d)for(var n=a[d],f=0;f<b;++f)c[g++]=n[f];break;case 3:db(a,b[0],b[1],b[2],c,0);break;default:eb(a,b,0,c,0)}return c}},Ia={"[object Int8Array]":5120,"[object Int16Array]":5122,"[object Int32Array]":5124,"[object Uint8Array]":5121,"[object Uint8ClampedArray]":5121,"[object Uint16Array]":5123,"[object Uint32Array]":5125,"[object Float32Array]":5126,"[object Float64Array]":5121,"[object ArrayBuffer]":5121},
Ra={int8:5120,int16:5122,int32:5124,uint8:5121,uint16:5123,uint32:5125,"float":5126,float32:5126},jb={dynamic:35048,stream:35040,"static":35044},Qa=Ma.flatten,hb=Ma.shape,ja=[];ja[5120]=1;ja[5122]=2;ja[5124]=4;ja[5121]=1;ja[5123]=2;ja[5125]=4;ja[5126]=4;var Sa={points:0,point:0,lines:1,line:1,triangles:4,triangle:4,"line loop":2,"line strip":3,"triangle strip":5,"triangle fan":6},lb=new Float32Array(1),Ib=new Uint32Array(lb.buffer),Mb=[9984,9986,9985,9987],La=[0,6409,6410,6407,6408],L={};L[6409]=
L[6406]=L[6402]=1;L[34041]=L[6410]=2;L[6407]=L[35904]=3;L[6408]=L[35906]=4;var Ua=Ea("HTMLCanvasElement"),pb=Ea("CanvasRenderingContext2D"),qb=Ea("ImageBitmap"),rb=Ea("HTMLImageElement"),sb=Ea("HTMLVideoElement"),Jb=Object.keys(Ia).concat([Ua,pb,qb,rb,sb]),qa=[];qa[5121]=1;qa[5126]=4;qa[36193]=2;qa[5123]=2;qa[5125]=4;var y=[];y[32854]=2;y[32855]=2;y[36194]=2;y[34041]=4;y[33776]=.5;y[33777]=.5;y[33778]=1;y[33779]=1;y[35986]=.5;y[35987]=1;y[34798]=1;y[35840]=.5;y[35841]=.25;y[35842]=.5;y[35843]=.25;
y[36196]=.5;var Q=[];Q[32854]=2;Q[32855]=2;Q[36194]=2;Q[33189]=2;Q[36168]=1;Q[34041]=4;Q[35907]=4;Q[34836]=16;Q[34842]=8;Q[34843]=6;var Wb=function(a,b,c,e,g){function d(a){this.id=q++;this.refCount=1;this.renderbuffer=a;this.format=32854;this.height=this.width=0;g.profile&&(this.stats={size:0})}function n(b){var c=b.renderbuffer;a.bindRenderbuffer(36161,null);a.deleteRenderbuffer(c);b.renderbuffer=null;b.refCount=0;delete t[b.id];e.renderbufferCount--}var f={rgba4:32854,rgb565:36194,"rgb5 a1":32855,
depth:33189,stencil:36168,"depth stencil":34041};b.ext_srgb&&(f.srgba=35907);b.ext_color_buffer_half_float&&(f.rgba16f=34842,f.rgb16f=34843);b.webgl_color_buffer_float&&(f.rgba32f=34836);var r=[];Object.keys(f).forEach(function(a){r[f[a]]=a});var q=0,t={};d.prototype.decRef=function(){0>=--this.refCount&&n(this)};g.profile&&(e.getTotalRenderbufferSize=function(){var a=0;Object.keys(t).forEach(function(b){a+=t[b].stats.size});return a});return{create:function(b,c){function k(b,c){var d=0,e=0,m=32854;
"object"===typeof b&&b?("shape"in b?(e=b.shape,d=e[0]|0,e=e[1]|0):("radius"in b&&(d=e=b.radius|0),"width"in b&&(d=b.width|0),"height"in b&&(e=b.height|0)),"format"in b&&(m=f[b.format])):"number"===typeof b?(d=b|0,e="number"===typeof c?c|0:d):b||(d=e=1);if(d!==h.width||e!==h.height||m!==h.format)return k.width=h.width=d,k.height=h.height=e,h.format=m,a.bindRenderbuffer(36161,h.renderbuffer),a.renderbufferStorage(36161,m,d,e),g.profile&&(h.stats.size=Q[h.format]*h.width*h.height),k.format=r[h.format],
k}var h=new d(a.createRenderbuffer());t[h.id]=h;e.renderbufferCount++;k(b,c);k.resize=function(b,c){var d=b|0,e=c|0||d;if(d===h.width&&e===h.height)return k;k.width=h.width=d;k.height=h.height=e;a.bindRenderbuffer(36161,h.renderbuffer);a.renderbufferStorage(36161,h.format,d,e);g.profile&&(h.stats.size=Q[h.format]*h.width*h.height);return k};k._reglType="renderbuffer";k._renderbuffer=h;g.profile&&(k.stats=h.stats);k.destroy=function(){h.decRef()};return k},clear:function(){S(t).forEach(n)},restore:function(){S(t).forEach(function(b){b.renderbuffer=
a.createRenderbuffer();a.bindRenderbuffer(36161,b.renderbuffer);a.renderbufferStorage(36161,b.format,b.width,b.height)});a.bindRenderbuffer(36161,null)}}},Wa=[];Wa[6408]=4;Wa[6407]=3;var Na=[];Na[5121]=1;Na[5126]=4;Na[36193]=2;var Da=["x","y","z","w"],Ub="blend.func blend.equation stencil.func stencil.opFront stencil.opBack sample.coverage viewport scissor.box polygonOffset.offset".split(" "),Ga={0:0,1:1,zero:0,one:1,"src color":768,"one minus src color":769,"src alpha":770,"one minus src alpha":771,
"dst color":774,"one minus dst color":775,"dst alpha":772,"one minus dst alpha":773,"constant color":32769,"one minus constant color":32770,"constant alpha":32771,"one minus constant alpha":32772,"src alpha saturate":776},Xa={never:512,less:513,"<":513,equal:514,"=":514,"==":514,"===":514,lequal:515,"<=":515,greater:516,">":516,notequal:517,"!=":517,"!==":517,gequal:518,">=":518,always:519},Pa={0:0,zero:0,keep:7680,replace:7681,increment:7682,decrement:7683,"increment wrap":34055,"decrement wrap":34056,
invert:5386},wb={cw:2304,ccw:2305},xb=new Z(!1,!1,!1,function(){}),Xb=function(a,b){function c(){this.endQueryIndex=this.startQueryIndex=-1;this.sum=0;this.stats=null}function e(a,b,d){var e=n.pop()||new c;e.startQueryIndex=a;e.endQueryIndex=b;e.sum=0;e.stats=d;f.push(e)}if(!b.ext_disjoint_timer_query)return null;var g=[],d=[],n=[],f=[],r=[],q=[];return{beginQuery:function(a){var c=g.pop()||b.ext_disjoint_timer_query.createQueryEXT();b.ext_disjoint_timer_query.beginQueryEXT(35007,c);d.push(c);e(d.length-
1,d.length,a)},endQuery:function(){b.ext_disjoint_timer_query.endQueryEXT(35007)},pushScopeStats:e,update:function(){var a,c;a=d.length;if(0!==a){q.length=Math.max(q.length,a+1);r.length=Math.max(r.length,a+1);r[0]=0;var e=q[0]=0;for(c=a=0;c<d.length;++c){var k=d[c];b.ext_disjoint_timer_query.getQueryObjectEXT(k,34919)?(e+=b.ext_disjoint_timer_query.getQueryObjectEXT(k,34918),g.push(k)):d[a++]=k;r[c+1]=e;q[c+1]=a}d.length=a;for(c=a=0;c<f.length;++c){var e=f[c],h=e.startQueryIndex,k=e.endQueryIndex;
e.sum+=r[k]-r[h];h=q[h];k=q[k];k===h?(e.stats.gpuTime+=e.sum/1E6,n.push(e)):(e.startQueryIndex=h,e.endQueryIndex=k,f[a++]=e)}f.length=a}},getNumPendingQueries:function(){return d.length},clear:function(){g.push.apply(g,d);for(var a=0;a<g.length;a++)b.ext_disjoint_timer_query.deleteQueryEXT(g[a]);d.length=0;g.length=0},restore:function(){d.length=0;g.length=0}}};return function(a){function b(){if(0===G.length)B&&B.update(),ca=null;else{ca=Ya.next(b);t();for(var a=G.length-1;0<=a;--a){var c=G[a];c&&
c(O,null,0)}k.flush();B&&B.update()}}function c(){!ca&&0<G.length&&(ca=Ya.next(b))}function e(){ca&&(Ya.cancel(b),ca=null)}function g(a){a.preventDefault();e();U.forEach(function(a){a()})}function d(a){k.getError();l.restore();Q.restore();F.restore();A.restore();M.restore();K.restore();B&&B.restore();V.procs.refresh();c();W.forEach(function(a){a()})}function n(a){function b(a){var c={},d={};Object.keys(a).forEach(function(b){var e=a[b];la.isDynamic(e)?d[b]=la.unbox(e,b):c[b]=e});return{dynamic:d,
"static":c}}function c(a){for(;m.length<a;)m.push(null);return m}var d=b(a.context||{}),e=b(a.uniforms||{}),f=b(a.attributes||{}),g=b(function(a){function b(a){if(a in c){var d=c[a];delete c[a];Object.keys(d).forEach(function(b){c[a+"."+b]=d[b]})}}var c=E({},a);delete c.uniforms;delete c.attributes;delete c.context;"stencil"in c&&c.stencil.op&&(c.stencil.opBack=c.stencil.opFront=c.stencil.op,delete c.stencil.op);b("blend");b("depth");b("cull");b("stencil");b("polygonOffset");b("scissor");b("sample");
return c}(a));a={gpuTime:0,cpuTime:0,count:0};var d=V.compile(g,f,e,d,a),h=d.draw,k=d.batch,l=d.scope,m=[];return E(function(a,b){var d;if("function"===typeof a)return l.call(this,null,a,0);if("function"===typeof b)if("number"===typeof a)for(d=0;d<a;++d)l.call(this,null,b,d);else if(Array.isArray(a))for(d=0;d<a.length;++d)l.call(this,a[d],b,d);else return l.call(this,a,b,0);else if("number"===typeof a){if(0<a)return k.call(this,c(a|0),a|0)}else if(Array.isArray(a)){if(a.length)return k.call(this,
a,a.length)}else return h.call(this,a)},{stats:a})}function f(a,b){var c=0;V.procs.poll();var d=b.color;d&&(k.clearColor(+d[0]||0,+d[1]||0,+d[2]||0,+d[3]||0),c|=16384);"depth"in b&&(k.clearDepth(+b.depth),c|=256);"stencil"in b&&(k.clearStencil(b.stencil|0),c|=1024);k.clear(c)}function r(a){G.push(a);c();return{cancel:function(){function b(){var a=yb(G,b);G[a]=G[G.length-1];--G.length;0>=G.length&&e()}var c=yb(G,a);G[c]=b}}}function q(){var a=S.viewport,b=S.scissor_box;a[0]=a[1]=b[0]=b[1]=0;O.viewportWidth=
O.framebufferWidth=O.drawingBufferWidth=a[2]=b[2]=k.drawingBufferWidth;O.viewportHeight=O.framebufferHeight=O.drawingBufferHeight=a[3]=b[3]=k.drawingBufferHeight}function t(){O.tick+=1;O.time=y();q();V.procs.poll()}function m(){q();V.procs.refresh();B&&B.update()}function y(){return(zb()-D)/1E3}a=Eb(a);if(!a)return null;var k=a.gl,h=k.getContextAttributes();k.isContextLost();var l=Fb(k,a);if(!l)return null;var u=Bb(),v={bufferCount:0,elementsCount:0,framebufferCount:0,shaderCount:0,textureCount:0,
cubeCount:0,renderbufferCount:0,maxTextureUnits:0},x=l.extensions,B=Xb(k,x),D=zb(),J=k.drawingBufferWidth,P=k.drawingBufferHeight,O={tick:0,time:0,viewportWidth:J,viewportHeight:P,framebufferWidth:J,framebufferHeight:P,drawingBufferWidth:J,drawingBufferHeight:P,pixelRatio:a.pixelRatio},R=Vb(k,x),J=Pb(k,x,R,u),F=Gb(k,v,a,J),T=Hb(k,x,F,v),Q=Qb(k,u,v,a),A=Kb(k,x,R,function(){V.procs.poll()},O,v,a),M=Wb(k,x,R,v,a),K=Ob(k,x,R,A,M,v),V=Tb(k,u,x,R,F,T,A,K,{},J,Q,{elements:null,primitive:4,count:-1,offset:0,
instances:-1},O,B,a),u=Rb(k,K,V.procs.poll,O,h,x,R),S=V.next,L=k.canvas,G=[],U=[],W=[],Z=[a.onDestroy],ca=null;L&&(L.addEventListener("webglcontextlost",g,!1),L.addEventListener("webglcontextrestored",d,!1));var aa=K.setFBO=n({framebuffer:la.define.call(null,1,"framebuffer")});m();h=E(n,{clear:function(a){if("framebuffer"in a)if(a.framebuffer&&"framebufferCube"===a.framebuffer_reglType)for(var b=0;6>b;++b)aa(E({framebuffer:a.framebuffer.faces[b]},a),f);else aa(a,f);else f(null,a)},prop:la.define.bind(null,
1),context:la.define.bind(null,2),"this":la.define.bind(null,3),draw:n({}),buffer:function(a){return F.create(a,34962,!1,!1)},elements:function(a){return T.create(a,!1)},texture:A.create2D,cube:A.createCube,renderbuffer:M.create,framebuffer:K.create,framebufferCube:K.createCube,attributes:h,frame:r,on:function(a,b){var c;switch(a){case "frame":return r(b);case "lost":c=U;break;case "restore":c=W;break;case "destroy":c=Z}c.push(b);return{cancel:function(){for(var a=0;a<c.length;++a)if(c[a]===b){c[a]=
c[c.length-1];c.pop();break}}}},limits:R,hasExtension:function(a){return 0<=R.extensions.indexOf(a.toLowerCase())},read:u,destroy:function(){G.length=0;e();L&&(L.removeEventListener("webglcontextlost",g),L.removeEventListener("webglcontextrestored",d));Q.clear();K.clear();M.clear();A.clear();T.clear();F.clear();B&&B.clear();Z.forEach(function(a){a()})},_gl:k,_refresh:m,poll:function(){t();B&&B.update()},now:y,stats:v});a.onDone(null,h);return h}});

},{}],4:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 uv;
            uniform vec4 rect;

            void main () {
                if (uv.x < rect.x) discard;
                if (uv.x > rect.z) discard;
                if (uv.y > 1.0 - rect.y) discard;
                if (uv.y < 1.0 - rect.w) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // if (uv.y == 1.0 - rect.y) {
                //     // gl_FragColor = vec4(rand(uv, 1.0), rand(uv, 2.0)*0.25, rand(uv, 2.0), rand(uv, 3.0)*0.25);
                // } else {
                //     // gl_FragColor = vec4(rand(uv, 1.0), rand(uv, 2.0)*0.25, rand(uv, 2.0), rand(uv, 3.0)*0.25);
                //     // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            rect: regl.prop('rect')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}
},{}],5:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D u_src;
            uniform vec2 u_size;
            uniform float scale;
            varying vec2 uv;
            const float F = 0.037, K = 0.06;
            float D_a = 0.2*scale, D_b = 0.1*scale;

            void main() {
                vec4 n = texture2D(u_src, uv + vec2(0.0, 1.0)*u_size),
                     e = texture2D(u_src, uv + vec2(1.0, 0.0)*u_size),
                     s = texture2D(u_src, uv + vec2(0.0, -1.0)*u_size),
                     w = texture2D(u_src, uv + vec2(-1.0, 0.0)*u_size),

                     ne = texture2D(u_src, uv + vec2(1.0, 1.0)*u_size),
                     nw = texture2D(u_src, uv + vec2(-1.0, 1.0)*u_size),
                     se = texture2D(u_src, uv + vec2(1.0, -1.0)*u_size),
                     sw = texture2D(u_src, uv + vec2(-1.0, -1.0)*u_size);

                vec4 val = texture2D(u_src, uv);

                vec4 lap = (0.5 * (n + s + e + w) + 0.25 * (ne + nw + se + sw) - 3.0 * val);

                val += vec4(D_a * lap.x - val.x*val.y*val.y + F * (1.0-val.x),
                            D_b * lap.y + val.x*val.y*val.y - (K+F) * val.y,
                            1.5*D_a * lap.z - val.z*val.w*val.w + F * (1.0-val.z),
                            1.5*D_b * lap.w + val.z*val.w*val.w - (K+F) * val.w);

                /*  Make the two systems mutually exclusive by having the
                    dominant suppress the other. */
                if (val.y > val.w) {
                    gl_FragColor = vec4(val.x, val.y, val.z, val.w/2.0);
                } else {
                    gl_FragColor = vec4(val.x, val.y/2.0, val.z, val.w);
                }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            scale: 0.3,
            u_src: regl.prop('src'),
            u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3
    });
}
},{}],6:[function(require,module,exports){

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) { return null }
    return  [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
        1.0
    ]
}
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 uv;
            uniform sampler2D src;
            uniform int show;
            uniform vec4 colorA;
            uniform vec4 colorB;

            const float COLOR_MIN = 0.15, COLOR_MAX = 0.3;
            const vec4 WHITE = vec4( 1.0, 1.0, 1.0, 1.0 );

            float remap( float minval, float maxval, float curval ) {
                return ( curval - minval ) / ( maxval - minval );
            }

            void main() {
                vec4 pixel = texture2D(src, uv);
                float v1 = remap(COLOR_MIN, COLOR_MAX, pixel.y);
                float v2 = remap(COLOR_MIN, COLOR_MAX, pixel.w);

                if (show == 1) {
                    gl_FragColor = mix( WHITE, colorA, v1 );
                } else if (show == 2) {
                    gl_FragColor = mix( WHITE, colorB, v2 );
                } else if (show == 3) {
                    if (v2 < v1) {
                        gl_FragColor = mix( WHITE, colorA, v1 );
                    } else {
                        gl_FragColor = mix( WHITE, colorB, v2 );
                    }
                } else {
                    gl_FragColor = vec4(1, 1, 1, 1);
                }
            }
        `,
        uniforms: {
            colorA: regl.prop('colorA'),//hexToRgb("#0000e0"),
            colorB: regl.prop('colorB'),
            src: regl.prop('src'),
            show: 3,
        },
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        depth: {enable: false},
        count: 3
    });
}
},{}],7:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D texture;
            uniform sampler2D random;
            varying vec2 uv;

            void main () {
                vec4 val = texture2D(texture, uv);
                vec4 rand = texture2D(random, uv);

                vec4 result = vec4(1.0, 0.0, 1.0, 0.0);

                if (val.g > 0.5 && rand.x > 0.5) {
                    result.x = 0.5;
                    result.y = 0.25;
                }
                if (val.r > 0.5 && rand.y > 0.7) {
                    result.z = 0.5;
                    result.w = 0.25;
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            texture: regl.prop('texture'),
            random: regl.prop('random')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}
},{}],8:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = 1.0 - uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D u_src;
            uniform sampler2D old_texture;
            uniform sampler2D new_texture;
            uniform sampler2D random;
            varying vec2 uv;
            void main () {
                vec4 oldv = texture2D(u_src, uv);
                bool old_text = oldv.y > 0.2;
                bool new_seed = texture2D(new_texture, uv).g > 0.2;
                bool new_bound = texture2D(new_texture, uv).r > 0.2;
                bool old_seed = texture2D(old_texture, uv).g > 0.2;
                bool old_bound = texture2D(old_texture, uv).r > 0.2;
                vec4 result = oldv;
                vec4 rand = texture2D(random, uv);

                /* Clear morph2 to allow morph1 to grow.
                */

                if (old_bound && new_bound) {

                }

                if (!new_bound) {
                    result.zw = vec2(1.0, 0.0);
                }

                if (new_seed) {
                    if (rand.x > 0.8) {
                        result.xy = vec2(0.5, 0.25);
                    } else {
                        result.xy = vec2(1.0, 0.0);
                    }
                }

                if (old_text) {
                    result.xy = vec2(1.0, 0.0);
                }

                if (new_bound) {
                    if (old_bound) {
                        result.zw = oldv.zw;
                    }
                    else if (rand.y > 0.9) {
                        result.zw = vec2(0.5, 0.25);
                    } else {
                        result.zw = vec2(1.0, 0.0);
                    }
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            u_src: regl.prop('src'),
            old_texture: regl.prop('old_texture'),
            new_texture: regl.prop('new_texture'),
            random: regl.prop('random')
            // regl.texture({
            //     width: 512, height: 256, data: random_list(512*256*4)
            // })
        },
        framebuffer: regl.prop('dst'),
        depth: {enable: false},
        count: 3,
    });
}
},{}]},{},[1]);
