var container, img;
var camera, scene, renderer;
var win_width, win_height;
var rtt_target;
var rtt_width, rtt_height;
var controls;
var uniforms;

var num_regions = 100;
// centroids of each voronoi region
var centroids = new Float32Array(num_regions*2);
// number of pixels in a voronoi region
var region_pixels = new Uint16Array(num_regions);
// cones geometry representing voronoi regions
var region_mesh = new Array(num_regions);

var frames_to_render = 100;

$(function() {
  img = new Image();
  img.onload = function() {
    init();
    init_geometry();
    animate();
  };
  img.src = 'static/bg.jpg';
});

function init() {
    container = $( '#banner' );

    win_width = window.innerWidth;
    win_height = window.innerHeight;
    rtt_width = win_width;
    rtt_height = win_height;
    container.width = win_width;
    container.height = win_height;

    var img_data = getImageData(win_width, win_height);
    console.log(getPixel(img_data, 10, 10));

    var fov = 40,
        aspect = win_width / win_height,
        near = 0.1,
        far = 100000;

//    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera = new THREE.OrthographicCamera(win_width / -2, win_width / 2,
                                          win_height / 2, win_height / -2,
                                          near, far);
    //camera = new THREE.CombinedCamera(win_width, win_height, fov, near, far, near, far);
    //camera.toOrthographic();
    camera.position.z = 1000;

    controls = new THREE.OrbitControls( camera );
    controls.damping = 0.2;
    controls.addEventListener( 'change', render );

    scene = new THREE.Scene();

    rtt_target = new THREE.WebGLRenderTarget( rtt_width, rtt_height );
    rtt_target.magFilter = THREE.NearestFilter;
    rtt_target.minFilter = THREE.NearestFilter;
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    //renderer.setClearColor( 0xffff00 );
    renderer.setSize(win_width, win_height);

    container.appendChild(renderer.domElement);
}

function reset_centroids() {
  for (var i = 0; i < num_regions; ++i) {
    centroids[2*i] = 0;
    centroids[2*i+1] = 0;
    region_pixels[i] = 0;
  }
}

function init_geometry() {
  // initialize voronoi region arrays
  reset_centroids();

  // generate geometry to display
  var geometry = new THREE.CylinderGeometry( 0, 200, 100, 16, 1, true );

  //var material = new THREE.ShaderMaterial( {
  //    vertexShader: document.getElementById( 'coneVert' ).textContent,
  //    fragmentShader: document.getElementById( 'coneFrag' ).textContent
  //} );

  //material.vertexColor = THREE.VertexColors;
  //material.attributes.vColor.needsUpdate = true;

  for ( var i = 0; i < num_regions; ++i ) {
    var material = new THREE.MeshBasicMaterial( {color: i} );
    region_mesh[i] = new THREE.Mesh( geometry, material );
    region_mesh[i].position.x += win_width*(Math.random() - 0.5);
    region_mesh[i].position.y += win_height*(Math.random() - 0.5);
    region_mesh[i].rotation.x += Math.PI/2;
    scene.add(region_mesh[i]);
  }
}

function animate() {
  if (frames_to_render > 0)
  {
    requestAnimationFrame(animate);
    frames_to_render -= 1;
  }
  controls.update();
  render();
  render_to_target();
}

function render_to_target() {
  renderer.render( scene, camera, rtt_target, true );

  var gl = renderer.getContext();
  var pixels = new Uint8Array(rtt_width*rtt_height*4);
  gl.readPixels( 0, 0, rtt_width, rtt_height, gl.RGBA, gl.UNSIGNED_BYTE, pixels );

  for ( var y = 0; y < rtt_height; ++y ) {
    for ( var x = 0; x < rtt_width; ++x ) {
      var index = 0;
      for ( var k = 0; k < 3; ++k ) { // ignore opacity
        index += Math.pow(256,(2-k)) * pixels[k + 4 * (x + rtt_width * y)];
      }
      centroids[2*index] += x;
      centroids[2*index+1] += y;
      region_pixels[index] += 1;
    }
  }

  for (var i = 0; i < num_regions; ++i) {
    centroids[2*i] /= region_pixels[i];
    centroids[2*i+1] /= region_pixels[i];
  }

  for (var i = 0; i < num_regions; ++i) {
    region_mesh[i].position.x = centroids[2*i] - 0.5*rtt_width + 0.5;
    region_mesh[i].position.y = centroids[2*i+1] - 0.5*rtt_height + 0.5;
  }

  reset_centroids();
}

function render() {
  renderer.render( scene, camera );
}

function getImageData(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    return context.getImageData(0, 0, width, height);
}

function getPixel( imagedata, x, y ) {
  var position = ( x + imagedata.width * y ) * 4,
      data     = imagedata.data;
  return { r: data[ position ], 
           g: data[ position + 1 ],
           b: data[ position + 2 ],
           a: data[ position + 3 ] };
}
