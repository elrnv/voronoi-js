// This software is licensed under the GNU GPL Version 2.
// Originally developed by Egor Larionov

var container, img;
var camera, scene, renderer;
var width, height;
var rtt_target;
var width, height;
//var controls;
var num_regions = 500;
var paint_colors = new Float32Array(num_regions*3);
var materials = new Array(num_regions);
var img_data, grad_img_data;

// centroids of each voronoi region
var centroids = new Float32Array(num_regions*2);
// number of pixels in a voronoi region
var region_pixels = new Uint16Array(num_regions);
// cones geometry representing voronoi regions
var region_mesh = new Array(num_regions);

var rtt_pixels;
var px2idx;
var pixel_weights;
var pixel_weight_sums = new Float32Array(num_regions);

var frames_to_render;

var MAX_FRAMES = 500;

var animation_started = false;

// Main point of entry
var is_chrome = /chrom(e|ium)/.test(navigator.userAgent.toLowerCase());
var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
if (is_chrome || is_firefox ) {
  $(function() {
    // allocate needed arrays
    container = document.getElementById('webgl-container');

    if (!container) return;

    init();
    init_geometry();

    container.addEventListener("dragover", function(e){e.preventDefault();}, true);
    container.addEventListener("drop", function(e){
      e.preventDefault();
      loadImage(e.dataTransfer.files[0]);
    }, true);

    var header = document.getElementById("main-header");
    if ( header ) {
      style = header.currentStyle || window.getComputedStyle(header, false),
      url = style.backgroundImage.slice(4, -1);
      url = url.replace(/"/g,"");
      renderFile(url);
    }
  });
}

function loadImage(src) {
  // Prevent any non-image file type from being read.
  if (!src.type.match(/image.*/)) {
    return;
  }

  // Create our FileReader and run the results through the renderer
  var reader = new FileReader();
  reader.onload = function(e) {
    renderFile(e.target.result);
  };
  reader.readAsDataURL(src);
}

function renderFile(src) {
  img = new Image();
  img.onload = function() {
    reset();
    reset_image_data();
    if (!animation_started) {
      animation_started = true;
      animate();
    }
  };
  img.src = src;
}

function init() {
  width = container.offsetWidth;
  height = container.offsetHeight;

  rtt_pixels = new Uint8Array(width*height*4);
  px2idx = new Array(width*height*4);
  pixel_weights = new Array(width*height);

  var near = 0.1, far = 100000;
  camera = new THREE.OrthographicCamera(
      width / -2, width / 2,
      height / 2, height / -2,
      near, far);
  camera.position.z = 1000;

  scene = new THREE.Scene();
  rtt_target = new THREE.WebGLRenderTarget();
  rtt_target.magFilter = THREE.NearestFilter;
  rtt_target.minFilter = THREE.NearestFilter;
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0, 0 );
}

function reset() {
    while (container.firstChild) { container.removeChild(container.firstChild); }
    frames_to_render = MAX_FRAMES;

    width = container.offsetWidth;
    height = container.offsetHeight;

    // if size has changed, we need to reallocate our arrays
    if ( width*height*4 > rtt_pixels.length ) {
      rtt_pixels = null;
      rtt_pixels = new Uint8Array(width*height*4);
    }
    px2idx.length = width*height*4;
    pixel_weights.length = width*height;

    camera.left = width / -2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = height / -2;
    camera.updateProjectionMatrix();

    rtt_target.setSize(width, height);
    renderer.setSize(width, height);

    //renderer.domElement.style.position = "absolute";
    //renderer.domElement.style.top = "0px";
    //renderer.domElement.style.left = "0px";
    //renderer.domElement.style.bottom = "0px";
    //renderer.domElement.style.right = "0px";
    //renderer.domElement.style.transform = "translate(-50%, -50%)";
    //renderer.domElement.style.zIndex = "-1";
    container.appendChild(renderer.domElement);
}

function reset_image_data() {
    var canvas = createImageCanvas(width, height);
    var context = canvas.getContext("2d");
    img_data = context.getImageData(0, 0, width, height);

    grad_img_data = context.createImageData(img_data); // create empty img data
    computeGradient( img_data.data, grad_img_data.data, width, height );
    gaussBlur(grad_img_data.data, grad_img_data.data, width, height, 3 );
    normalize(grad_img_data.data, width, height);
    context.putImageData( grad_img_data, 0, 0 );
    //container.appendChild(canvas);
}

function reset_centroids() {
  for (var i = 0; i < num_regions; ++i) {
    centroids[2*i] = 0;
    centroids[2*i+1] = 0;
    region_pixels[i] = 0;
  }
}

//var reject_probability = 0.5;
function reset_geometry() {
  reset_centroids();
  //var cur_utility = 0;
  for ( var i = 0; i < num_regions; ++i ) {
    region_mesh[i].position.x = width*(Math.random() - 0.5);
    region_mesh[i].position.y = height*(Math.random() - 0.5);
  }
  reset_region_colors();
}

function init_geometry() {
  // initialize voronoi region arrays
  // generate geometry to display
  var geometry = new THREE.CylinderGeometry( 0, 400, 100, 16, 1, true );

  for ( var i = 0; i < num_regions; ++i ) {
    materials[i] = new THREE.MeshBasicMaterial();
  }

  for ( var i = 0; i < num_regions; ++i ) {
    region_mesh[i] = new THREE.Mesh( geometry, materials[i] );
    region_mesh[i].rotation.x = Math.PI/2;
    scene.add(region_mesh[i]);
  }

  reset_geometry();
}

function animate() {
  if ( container.offsetWidth !== width || container.offsetHeight !== height ) {
    reset();
    reset_geometry();
    reset_image_data();
    var maxpos = 0;
    for ( var i = 0; i < num_regions; ++i ) {
      maxpos = Math.max(maxpos, region_mesh[i].position.x);
    }
  }
  else
  {
    if (frames_to_render > 0 || frames_to_render === -1) {
      render_to_target();
      paint_regions();
      render();
      reset_region_colors();
      update_positions();
      frames_to_render -= 1;
    }
  }
  requestAnimationFrame(animate);
}

function render_to_target() {
  renderer.render( scene, camera, rtt_target, true );

  var gl = renderer.getContext();
  gl.finish();
  gl.readPixels( 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rtt_pixels );

  for ( var y = 0; y < height; ++y ) {
    for ( var x = 0; x < width; ++x ) {
      px2idx[x + width * y] = -1;
      for ( var k = 0; k < 3; ++k ) { // ignore opacity
        px2idx[x + width * y] += Math.pow(256,(2-k)) * rtt_pixels[k + 4 * (x + width * y)];
      }
      if ( grad_img_data ) {
        var weight = 0;
        for ( var k = 0; k < 3; ++k ) {
          weight += grad_img_data.data[k + 4 * (x + width * (height - y - 1))];
        }
        pixel_weights[x + width * y] = weight;
      }
    }
  }

  for ( var y = 0; y < height; ++y ) {
    for ( var x = 0; x < width; ++x ) {
      var index = px2idx[x + width * y];
      if (index >= 0) region_pixels[index] += 1;
    }
  }

  if ( grad_img_data ) {
    for ( var i = 0; i < num_regions; ++i ) {
      pixel_weight_sums[i] = 0;
    }
    for ( var y = 0; y < height; ++y ) {
      for ( var x = 0; x < width; ++x ) {
        var index = px2idx[x+width*y];
        if ( index >= 0 ) {
          pixel_weight_sums[index] += pixel_weights[x + width * y];
        }
      }
    }
  }

  for ( var y = 0; y < height; ++y ) {
    for ( var x = 0; x < width; ++x ) {
      var index = px2idx[x + width * y];
      if (index < 0) continue;
      paint_colors[3*index] += img_data.data[4 * (x + width * (height - y - 1))];
      paint_colors[1 + 3*index] += img_data.data[1 + 4 * (x + width * (height - y - 1))];
      paint_colors[2 + 3*index] += img_data.data[2 + 4 * (x + width * (height - y - 1))];
      var weight = 1;
      if (grad_img_data) {
       weight = pixel_weights[x + width*y];
      }
      centroids[2*index] += x*weight;
      centroids[2*index+1] += y*weight;
    }
  }

  for (var i = 0; i < num_regions; ++i) {
    if ( grad_img_data ) {
      centroids[2*i] /= pixel_weight_sums[i];
      centroids[2*i+1] /= pixel_weight_sums[i];
    }
    else {
      centroids[2*i] /= region_pixels[i];
      centroids[2*i+1] /= region_pixels[i];
    }

    paint_colors[3*i] /= 255*region_pixels[i];
    paint_colors[3*i + 1] /= 255*region_pixels[i];
    paint_colors[3*i + 2] /= 255*region_pixels[i];
  }
}

function paint_regions() {
  for ( var i = 0; i < num_regions; ++i ) {
    materials[i].color.setRGB(paint_colors[3*i],paint_colors[3*i+1],paint_colors[3*i+2]);
  }
}

function reset_region_colors() {
  for ( var i = 0; i < num_regions; ++i ) {
    materials[i].color.setHex(i+1);
    paint_colors[3*i] = 0;
    paint_colors[3*i + 1] = 0;
    paint_colors[3*i + 2] = 0;
  }
}

function update_positions() {
  for (var i = 0; i < num_regions; ++i) {
    region_mesh[i].position.x = centroids[2*i] - 0.5*width + 0.5;
    region_mesh[i].position.y = centroids[2*i+1] - 0.5*height + 0.5;
  }

  reset_centroids();
}

function render() {
  renderer.render( scene, camera );
}

function createImageCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');

    var hRatio = canvas.width / img.width;
    var vRatio = canvas.height / img.height;
    var ratio  = Math.max( hRatio, vRatio );
    context.drawImage(img,0,0,img.width,img.height, 
                    (width - img.width*ratio)/2, (height-img.height*ratio)/2,img.width*ratio, img.height*ratio);
    return canvas;
}

// assuming I is a Uint8ClampedArray of w by h by 4 in size
function computeGradient( I, G, w, h ) {
  var w1 = w+1;
  var h1 = h+1;
  var idx = function(x, y) { return ( x + w * y ) * 4; };
  var gidx = function(x, y) { return ( x + w * y ) * 3; };
  var gidx1 = function(x, y) { return ( x + w1 * y ) * 3; };
  var set_zero = function(A, i) { A[i] = 0; A[i+1] = 0; A[i+2] = 0; };
  var gx = new Uint8ClampedArray( w1*h*3 ); // gradient along horizontal axis
  var gy = new Uint8ClampedArray( w*h1*3 ); // gradient along vertical axis
  // assume zero gradient on the boundaries
  // set boundary to zero
  for ( var y = 0; y < h; ++y ) { set_zero(gx, gidx1(0,y)); }
  for ( var y = 0; y < h; ++y ) { set_zero(gx, gidx1(w,y)); }
  for ( var x = 0; x < w; ++x ) { set_zero(gy, gidx(x,0)); }
  for ( var x = 0; x < w; ++x ) { set_zero(gy, gidx(x,h)); }

  // compute the gradient
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 1; x < w; ++x ) {
      gx[gidx1(x,y)] = Math.abs(I[idx(x-1,y)] - I[idx(x,y)]);
      gx[1+gidx1(x,y)] = Math.abs(I[1+idx(x-1,y)] - I[1+idx(x,y)]);
      gx[2+gidx1(x,y)] = Math.abs(I[2+idx(x-1,y)] - I[2+idx(x,y)]);
    }
  }
  for ( var y = 1; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      gy[gidx(x,y)] = Math.abs(I[idx(x,y-1)] - I[idx(x,y)]);
      gy[1+gidx(x,y)] = Math.abs(I[1+idx(x,y-1)] - I[1+idx(x,y)]);
      gy[2+gidx(x,y)] = Math.abs(I[2+idx(x,y-1)] - I[2+idx(x,y)]);
    }
  }

  // interpolate gradients
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      G[idx(x,y)] = (gx[gidx1(x,y)] + gx[gidx1(x+1,y)] + gy[gidx(x,y)] + gy[gidx(x,y+1)]) / 4;
      G[1+idx(x,y)] = (gx[1+gidx1(x,y)] + gx[1+gidx1(x+1,y)] + gy[1+gidx(x,y)] + gy[1+gidx(x,y+1)]) / 4;
      G[2+idx(x,y)] = (gx[2+gidx1(x,y)] + gx[2+gidx1(x+1,y)] + gy[2+gidx(x,y)] + gy[2+gidx(x,y+1)]) / 4;
      G[3+idx(x,y)] = 255;
    }
  }

}

function normalize(G, w, h) {
  var idx = function(x, y) { return ( x + w * y ) * 4; };
  var max = 0;
  var min = 0;
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      var r = G[idx(x,y)];
      var g = G[1+idx(x,y)];
      var b = G[2+idx(x,y)];
      max = Math.max(max, r);
      max = Math.max(max, g);
      max = Math.max(max, b);
      min = Math.min(min, r);
      min = Math.min(min, g);
      min = Math.min(min, b);
    }
  }
  // normalize resulting gradient
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      G[idx(x,y)]   -= min;
      G[1+idx(x,y)] -= min;
      G[2+idx(x,y)] -= min;
      G[idx(x,y)]   *= 255/(max-min);
      G[1+idx(x,y)] *= 255/(max-min);
      G[2+idx(x,y)] *= 255/(max-min);
    }
  }

}

// Gaussian blur

function boxesForGauss(sigma, n)  // standard deviation, number of boxes
{
  var wIdeal = Math.sqrt((12*sigma*sigma/n)+1);  // Ideal averaging filter width 
  var wl = Math.floor(wIdeal);  if(wl%2===0) wl--;
  var wu = wl+2;

  var mIdeal = (12*sigma*sigma - n*wl*wl - 4*n*wl - 3*n)/(-4*wl - 4);
  var m = Math.round(mIdeal);
  // var sigmaActual = Math.sqrt( (m*wl*wl + (n-m)*wu*wu - n)/12 );

  var sizes = new Array(n);
  for(var i=0; i<n; i++) {
    sizes[i] = i<m?wl:wu;
  }
  return sizes;
}
function gaussBlur(scl, tcl, w, h, r) {
  var bxs = boxesForGauss(r, 3);
  boxBlur (scl, tcl, w, h, (bxs[0]-1)/2);
  boxBlur (tcl, scl, w, h, (bxs[1]-1)/2);
  boxBlur (scl, tcl, w, h, (bxs[2]-1)/2);
}
function boxBlur(scl, tcl, w, h, r) {
  for(var i=0; i<scl.length; i++) tcl[i] = scl[i];
  boxBlurH(tcl, scl, w, h, r);
  boxBlurT(scl, tcl, w, h, r);
}
function boxBlurH(scl, tcl, w, h, r) {
  var iarr = 1 / (r+r+1);
  for(var i=0; i<h; i++) { // vertical
    for(var k=0; k<3; ++k) {
      var ti = i*w, li = ti, ri = ti+r;
      var fv = scl[k+4*ti], lv = scl[k+4*(ti+w-1)], val = (r+1)*fv;
      for(var j=0; j<r; j++) val += scl[k+4*(ti+j)];
      for(var j=0  ; j<=r ; j++) { val += scl[k+4*(ri++)] - fv       ;   tcl[k+4*(ti++)] = Math.round(val*iarr); }
      for(var j=r+1; j<w-r; j++) { val += scl[k+4*(ri++)] - scl[k+4*(li++)];   tcl[k+4*(ti++)] = Math.round(val*iarr); }
      for(var j=w-r; j<w  ; j++) { val += lv        - scl[k+4*(li++)];   tcl[k+4*(ti++)] = Math.round(val*iarr); }
    }
  }
}
function boxBlurT(scl, tcl, w, h, r) {
  var iarr = 1 / (r+r+1);
  for(var i=0; i<w; i++) { // horizontal
    for(var k=0; k<3; ++k) {
      var ti = i, li = ti, ri = ti+r*w;
      var fv = scl[k+4*ti], lv = scl[k+4*(ti+w*(h-1))], val = (r+1)*fv;
      for(var j=0; j<r; j++) val += scl[k+4*(ti+j*w)];
      for(var j=0  ; j<=r ; j++) { val += scl[k+4*ri] - fv     ;  tcl[k+4*ti] = Math.round(val*iarr);  ri+=w; ti+=w; }
      for(var j=r+1; j<h-r; j++) { val += scl[k+4*ri] - scl[k+4*li];  tcl[k+4*ti] = Math.round(val*iarr);  li+=w; ri+=w; ti+=w; }
      for(var j=h-r; j<h  ; j++) { val += lv      - scl[k+4*li];  tcl[k+4*ti] = Math.round(val*iarr);  li+=w; ti+=w; }
    }
  }
}
